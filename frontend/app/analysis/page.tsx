"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { useMobileSlide } from "@/components/ui/MobileSlideProvider";
import OverviewTab from "@/components/analysis/OverviewTab";
import SchemaTab from "@/components/analysis/SchemaTab";
import DataQualityTab from "@/components/analysis/DataQualityTab";
import StatisticsTab from "@/components/analysis/StatisticsTab";
import VisualisationsTab from "@/components/analysis/VisualisationsTab";
import InsightsTab from "@/components/analysis/InsightsTab";
import RelationshipsTab from "@/components/analysis/RelationshipsTab";
import MLTab from "@/components/analysis/MLTab";
import {
  deleteMlExperiment,
  downloadAnalysisReport,
  getAnalyses,
  getAnalysisById,
  runSupervisedAnalysis,
  runUnsupervisedAnalysis,
} from "@/lib/analysisApi";
import { AnalysisListItem, AnalysisReport } from "@/lib/analysisTypes";
import {
  clearCurrentAnalysisSelection,
  getCurrentAnalysisSelection,
  notifyAnalysesChanged,
  subscribeToAnalysisStateChanges,
  setCurrentAnalysisSelection,
} from "@/lib/currentAnalysis";
import { calculateQualityScore } from "@/lib/analysisDerived";
import { formatDate } from "@/lib/helpers";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";

type AnalysisTabKey =
  | "overview"
  | "schema"
  | "quality"
  | "statistics"
  | "relationships"
  | "visualisations"
  | "insights"
  | "ml";

const tabs: Array<{ key: AnalysisTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "insights", label: "Insights" },
  { key: "schema", label: "Schema" },
  { key: "quality", label: "Data Quality" },
  { key: "statistics", label: "Statistics" },
  { key: "relationships", label: "Relationships" },
  { key: "visualisations", label: "Charts" },
  { key: "ml", label: "ML Lab" },
];

const tabDescriptions: Record<AnalysisTabKey, string> = {
  overview: "Overview stays open as the default surface and shows the current dataset placeholder until a saved analysis exists.",
  insights: "Plain-language findings, modeling readiness, and the next actions suggested by the run.",
  schema: "Column roles, inferred types, grouped fields, and the full column-by-column profile.",
  quality: "Missingness, duplicates, constants, outliers, and the cleanup issues worth addressing first.",
  statistics: "Numeric and categorical summaries for the computed report.",
  relationships: "Stronger structural patterns and relationships inside the dataset.",
  visualisations: "Charts and visual summaries generated from the current run.",
  ml: "Optional ML experiments that are saved back into the selected analysis run.",
};

const tabAccents: Record<AnalysisTabKey, string> = {
  overview: "#7ad6ff",
  insights: "#9db8ff",
  schema: "#8bf1a8",
  quality: "#ffb079",
  statistics: "#bfb8ff",
  relationships: "#d7b7ff",
  visualisations: "#7ce7dd",
  ml: "#ffd57d",
};

function resolveRequestedTab(requestedTab: string | null): AnalysisTabKey | null {
  switch (requestedTab) {
    case "overview":
    case "insights":
    case "schema":
    case "quality":
    case "statistics":
    case "relationships":
    case "visualisations":
    case "ml":
      return requestedTab;
    case "guide":
      return "overview";
    case "field-guide":
      return "schema";
    case "playbook":
      return "insights";
    default:
      return null;
  }
}

function parseAnalysisId(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type AnalysisSectionPreview = {
  summary: string;
  pills: string[];
};

function getAnalysisSectionPreview(report: AnalysisReport, tab: AnalysisTabKey): AnalysisSectionPreview {
  switch (tab) {
    case "overview":
      return {
        summary: "Dataset scale, sample rows, missingness, and readiness signals stay visible before you dive into any deeper report section.",
        pills: [
          `${report.overview.row_count.toLocaleString()} rows`,
          `${report.overview.column_count.toLocaleString()} cols`,
          `${report.overview.total_missing_values.toLocaleString()} missing`,
        ],
      };
    case "insights":
      return {
        summary: report.insights.findings[0] ?? report.insights.summary,
        pills: [
          `${report.insights.findings.length} findings`,
          `${report.insights.recommended_next_steps.length} next steps`,
          report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first",
        ],
      };
    case "schema":
      return {
        summary: `${report.schema.columns.length.toLocaleString()} profiled columns with inferred types, likely roles, identifiers, and target candidates.`,
        pills: [
          `${report.schema.identifier_columns.length} identifiers`,
          `${report.schema.target_candidates.length} targets`,
          `${report.schema.type_counts.numeric ?? report.overview.type_counts.numeric ?? 0} numeric`,
        ],
      };
    case "quality":
      return {
        summary: `${report.quality.missing_by_column.length} columns with missing data, ${report.quality.constant_columns.length} constant columns, and ${report.quality.outlier_columns.length} outlier-heavy fields are flagged.`,
        pills: [
          `${report.quality.duplicate_row_count.toLocaleString()} duplicates`,
          `${report.quality.high_correlations.length} correlations`,
          `${report.quality.recommendations.length} fixes`,
        ],
      };
    case "statistics":
      return {
        summary: `${report.statistics.numeric_summary.length} numeric summaries, ${report.statistics.categorical_summary.length} categorical profiles, and ${report.statistics.datetime_summary.length} datetime ranges are ready to inspect.`,
        pills: [
          `${report.statistics.numeric_summary.length} numeric`,
          `${report.statistics.categorical_summary.length} categorical`,
          `${report.statistics.datetime_summary.length} datetime`,
        ],
      };
    case "relationships":
      return {
        summary: `${report.quality.high_correlations.length} high-correlation pairs and ${report.statistics.correlation_matrix.length} correlation cells help surface the strongest links in the dataset.`,
        pills: [
          `${report.quality.high_correlations.length} strong pairs`,
          `${report.statistics.correlation_matrix.length} correlation cells`,
          `${report.schema.target_candidates.length} targets`,
        ],
      };
    case "visualisations":
      return {
        summary: `${report.visualisations.histograms.length} histograms, ${report.visualisations.boxplots.length} boxplots, and ${report.visualisations.top_categories.length} category charts are ready to review.`,
        pills: [
          `${report.visualisations.missingness.length} missingness`,
          `${report.visualisations.pairwise_scatter.length} scatter plots`,
          `${report.visualisations.drift_checks.length} drift checks`,
        ],
      };
    case "ml":
      return {
        summary:
          report.ml_experiments.length > 0
            ? `${report.ml_experiments.length} saved experiment${report.ml_experiments.length === 1 ? " is" : "s are"} already attached to this run, and you can keep iterating from mobile.`
            : "Run supervised or unsupervised experiments here and keep the outputs attached to this saved analysis run.",
        pills: [
          `${report.ml_experiments.length} saved`,
          report.ml_capabilities.unsupervised.available ? "Unsupervised ready" : "Unsupervised blocked",
          report.ml_capabilities.supervised.available
            ? `${report.ml_capabilities.supervised.target_candidates.length} targets`
            : "Supervised blocked",
        ],
      };
  }
}

function AnalysisPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAnalysisId = searchParams.get("analysisId");
  const requestedTab = searchParams.get("tab");
  const requestedTabKey = resolveRequestedTab(requestedTab);

  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [activeTab, setActiveTab] = useState<AnalysisTabKey>("overview");
  const selectedAnalysisIdRef = useRef<number | null>(null);
  const activeTabRef = useRef<AnalysisTabKey>("overview");

  useEffect(() => {
    selectedAnalysisIdRef.current = selectedAnalysisId;
  }, [selectedAnalysisId]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  function handleTabChange(nextTab: AnalysisTabKey) {
    setActiveTab(nextTab);
    if (selectedAnalysisId) {
      const tabQuery = nextTab !== "overview" ? `&tab=${nextTab}` : "";
      router.replace(`/analysis?analysisId=${selectedAnalysisId}${tabQuery}`, { scroll: false });
    }
  }

  useEffect(() => {
    setActiveTab(requestedTabKey ?? "overview");
  }, [requestedTabKey]);

  const refreshAnalyses = useCallback(async (nextId?: number, nextTab?: AnalysisTabKey) => {
    const items = await getAnalyses();
    setAnalyses(items);
    const targetId = nextId ?? selectedAnalysisIdRef.current;

    if (!targetId || !items.some((item) => item.id === targetId)) {
      setSelectedAnalysisId(null);
      setReport(null);
      router.replace("/analysis");
      return;
    }

    const payload = await getAnalysisById(targetId);
    setCurrentAnalysisSelection(targetId);
    setSelectedAnalysisId(targetId);
    setReport(payload);
    if (nextTab) {
      setActiveTab(nextTab);
    }
    const targetTab = nextTab ?? activeTabRef.current;
    const tabQuery = targetTab !== "overview" ? `&tab=${targetTab}` : "";
    router.replace(`/analysis?analysisId=${targetId}${tabQuery}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);

      const queryAnalysisId = parseAnalysisId(requestedAnalysisId);

      const user = await resolveAuthenticatedUser();
      if (!active) return;

      if (!user) {
        setAnalyses([]);
        setSelectedAnalysisId(null);
        setReport(null);
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      setLoginRequired(false);

      try {
        setError("");
        const items = await getAnalyses();
        if (!active) return;
        setAnalyses(items);

        const storedAnalysisId = queryAnalysisId ? null : getCurrentAnalysisSelection();
        const initialId = queryAnalysisId ?? storedAnalysisId;

        if (!initialId) {
          setSelectedAnalysisId(null);
          setReport(null);
          setActiveTab("overview");
          return;
        }

        if (!items.some((item) => item.id === initialId)) {
          if (!queryAnalysisId && storedAnalysisId) {
            clearCurrentAnalysisSelection();
          }

          setSelectedAnalysisId(null);
          setReport(null);
          setActiveTab("overview");

          if (queryAnalysisId) {
            setError("Requested analysis was not found. Return to Uploads to choose a current dataset or open the saved run from History.");
            router.replace("/analysis");
          }

          return;
        }

        const payload = await getAnalysisById(initialId);
        if (!active) return;
        setCurrentAnalysisSelection(initialId);
        setSelectedAnalysisId(initialId);
        setReport(payload);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load analysis workspace.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      if (!active) return;
      void bootstrap();
    };

    const unsubscribeAnalysisState = subscribeToAnalysisStateChanges(() => {
      if (!active) return;
      const nextId = getCurrentAnalysisSelection() ?? selectedAnalysisIdRef.current;
      void refreshAnalyses(nextId ?? undefined, activeTabRef.current);
    });

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      unsubscribeAnalysisState();
    };
  }, [requestedAnalysisId, refreshAnalyses, router]);

  const hasRenderableReport = Boolean(
    report &&
      (report.overview.row_count > 0 ||
        report.overview.column_count > 0 ||
        report.schema.columns.length > 0 ||
        report.statistics.numeric_summary.length > 0 ||
        report.statistics.categorical_summary.length > 0)
  );
  const visibleTab: AnalysisTabKey = hasRenderableReport ? activeTab : "overview";

  const showWorkspaceNavigation = Boolean(selectedAnalysisId);
  useApplyNavigationScroll("/analysis", !loading && showWorkspaceNavigation);

  const placeholderState = !hasRenderableReport
    ? !selectedAnalysisId
      ? analyses.length === 0
        ? {
            eyebrow: "No datasets yet",
            title: "Overview unlocks after the first dataset upload",
            description:
              "Upload a CSV in Uploads, then come back here to open the report tabs.",
            primaryHref: "/batch",
            primaryLabel: "Go to uploads workspace",
            secondaryHref: null,
            secondaryLabel: null,
          }
        : {
            eyebrow: "No active dataset",
            title: "Choose the current dataset before entering the workspace",
            description:
              "Pick the current dataset from Uploads, or open a saved run from History.",
            primaryHref: "/batch",
            primaryLabel: "Choose or upload a dataset",
            secondaryHref: "/history",
            secondaryLabel: "Open saved history",
          }
      : {
          eyebrow: "Report pending",
          title: "This dataset is still waiting on a complete report",
          description:
            "The dataset record loaded, but the full report is not ready yet. Re-run it from Uploads if needed, then come back here.",
          primaryHref: "/batch",
          primaryLabel: "Go to uploads workspace",
          secondaryHref: analyses.length > 0 ? "/history" : null,
          secondaryLabel: analyses.length > 0 ? "Inspect saved runs in History" : null,
        }
    : null;

  const activeTabDescription = tabDescriptions[visibleTab];

  return (
    <>
      <AppShell
        eyebrow="Analysis workspace"
        title="Analysis"
        description="Explore, visualise, and model your dataset."
        actions={
          hasRenderableReport && report ? (
            <div className="tablet-up flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => { void downloadAnalysisReport(report.analysis_id); }}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
              >
                Export results
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("ml")}
                className="rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-[#f3e8ff]"
              >
                Run ML model
              </button>
            </div>
          ) : undefined
        }
      >
        {error ? (
          <div className="border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-white/55">
            Loading analysis workspace...
          </div>
        ) : null}

        {!loading ? (
          <>
            {/* Phone: dataset summary + tappable section list for each tab */}
            {showWorkspaceNavigation && hasRenderableReport && report ? (
              <AnalysisMobileSections
                report={report}
                activeTab={visibleTab}
                onTabChange={handleTabChange}
                refreshAnalyses={refreshAnalyses}
              />
            ) : null}

            {showWorkspaceNavigation && hasRenderableReport && report ? (
              <section className="tablet-up desktop-panel section-glow">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#7c3aed]/25 bg-[#7c3aed]/10 text-[#c4b5fd]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="3" width="14" height="18" rx="3" />
                        <path d="M9 8h6" />
                        <path d="M9 12h6" />
                        <path d="M9 16h4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-[family:var(--font-display)] text-xl font-bold text-white">
                        {report.source_filename || report.overview.dataset_name}
                      </p>
                      <p className="mt-1 font-[family:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.14em] text-white/28">
                        {report.overview.row_count.toLocaleString()} rows · {report.overview.column_count} columns
                        {report.saved_at ? ` · saved ${formatDate(report.saved_at)}` : ""}
                      </p>
                      <p className="mt-3 max-w-4xl text-sm leading-6 text-white/48">{report.insights.summary}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <span className="desktop-badge" data-tone={report.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                      <span className="desktop-status-dot" />
                      {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                    </span>
                    <span className="desktop-badge" data-tone="purple">Active dataset</span>
                    {report.schema.target_candidates.length > 0 ? (
                      <span className="desktop-badge" data-tone="amber">
                        {report.schema.target_candidates.length} target candidate{report.schema.target_candidates.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {showWorkspaceNavigation && hasRenderableReport ? (
              <section id="analysis-workspace-navigation" className="tablet-up route-scroll-target desktop-panel" style={{ paddingBottom: 0 }}>
                <p className="px-1 text-xs uppercase tracking-[0.2em] text-white/42">Report sections</p>

                {/* Tablet+: horizontal scroll tab bar */}
                <div className="mt-3 scrollbar-hide overflow-x-auto overflow-y-visible pb-2 pt-1">
                  <div className="analysis-subnav-surface">
                    <div className="analysis-subnav-track">
                      {tabs.map((tab) => {
                        const active = visibleTab === tab.key;
                        const disabled = tab.key !== "overview" && !hasRenderableReport;
                        return (
                          <button
                            type="button"
                            key={tab.key}
                            disabled={disabled}
                            onClick={() => handleTabChange(tab.key)}
                            className={`analysis-subnav-link ${
                              active ? "analysis-subnav-link-active" : ""
                            } disabled:cursor-not-allowed disabled:opacity-45`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <p className="analysis-subnav-description px-1 pb-4 pt-3 text-sm leading-6 text-white/50">{activeTabDescription}</p>
              </section>
            ) : null}

            {placeholderState ? (
              <>
                <article className="phone-only flow-section">
                  <p className="flow-section-label">{placeholderState.eyebrow}</p>
                  <p className="mt-2 font-[family:var(--font-display)] text-xl font-bold text-white">
                    {placeholderState.title}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                    {placeholderState.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ScrollIntentLink href={placeholderState.primaryHref} className="rounded-lg bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b]">
                      {placeholderState.primaryLabel}
                    </ScrollIntentLink>
                    {placeholderState.secondaryHref && placeholderState.secondaryLabel ? (
                      <ScrollIntentLink href={placeholderState.secondaryHref} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/70">
                        {placeholderState.secondaryLabel}
                      </ScrollIntentLink>
                    ) : null}
                  </div>
                </article>

                <section className="tablet-up desktop-empty-panel section-glow">
                  <div className="desktop-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="5" y="3" width="14" height="18" rx="3" />
                      <path d="M9 8h6" />
                      <path d="M9 12h6" />
                      <path d="M9 16h4" />
                      <circle cx="18" cy="18" r="3" />
                    </svg>
                  </div>
                  <p className="desktop-section-title">{placeholderState.title}</p>
                  <p className="desktop-section-text max-w-md">{placeholderState.description}</p>
                  <div className="desktop-step-list mt-5 justify-center">
                    {["Go to Uploads", "Import file", "Open in Analysis"].map((label, index) => (
                      <span key={label} className="desktop-step-pill">
                        <strong>{index + 1}</strong>
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <ScrollIntentLink href={placeholderState.primaryHref} className="rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-[#f3e8ff]">
                      {placeholderState.primaryLabel}
                    </ScrollIntentLink>
                    {placeholderState.secondaryHref && placeholderState.secondaryLabel ? (
                      <ScrollIntentLink href={placeholderState.secondaryHref} className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/70">
                        {placeholderState.secondaryLabel}
                      </ScrollIntentLink>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {visibleTab === "overview" && hasRenderableReport && report ? (
              <div className="tablet-up grid gap-4 xl:grid-cols-3">
                <article className="desktop-stat-card">
                  <p className="desktop-stat-label">Total rows</p>
                  <p className="desktop-stat-value">{report.overview.row_count.toLocaleString()}</p>
                  <p className="desktop-stat-hint">
                    {report.overview.duplicate_row_count === 0
                      ? "No duplicates found"
                      : `${report.overview.duplicate_row_count.toLocaleString()} duplicate row${report.overview.duplicate_row_count === 1 ? "" : "s"}`}
                  </p>
                </article>
                <article className="desktop-stat-card">
                  <p className="desktop-stat-label">Columns</p>
                  <p className="desktop-stat-value">{report.overview.column_count.toLocaleString()}</p>
                  <p className="desktop-stat-hint">
                    {(report.schema.type_counts.numeric ?? 0)} numeric · {((report.schema.type_counts.categorical ?? 0) + (report.schema.type_counts.text ?? 0) + (report.schema.type_counts.boolean ?? 0))} non-numeric · {(report.schema.type_counts.datetime ?? 0)} date
                  </p>
                </article>
                <article className="desktop-stat-card">
                  <p className="desktop-stat-label">Missing values</p>
                  <p className="desktop-stat-value">{report.overview.total_missing_values.toLocaleString()}</p>
                  <p className="desktop-stat-hint">
                    {report.overview.total_missing_values === 0
                      ? "No missing cells detected"
                      : `${calculateQualityScore(report.overview, report.quality).toFixed(1)} quality score`}
                  </p>
                </article>
              </div>
            ) : null}

            {/* Inline tab content — tablet+ only (phone uses slide pages) */}
            <div className="tablet-up space-y-4">
            {visibleTab === "overview" && hasRenderableReport && report ? (
              <OverviewTab
                overview={report.overview}
                schema={report.schema}
                quality={report.quality}
                insights={report.insights}
              />
            ) : null}
            {visibleTab === "insights" && hasRenderableReport && report ? <InsightsTab insights={report.insights} /> : null}
            {visibleTab === "schema" && hasRenderableReport && report ? <SchemaTab schema={report.schema} /> : null}
            {visibleTab === "quality" && hasRenderableReport && report ? (
              <DataQualityTab overview={report.overview} quality={report.quality} />
            ) : null}
            {visibleTab === "statistics" && hasRenderableReport && report ? <StatisticsTab statistics={report.statistics} /> : null}
            {visibleTab === "relationships" && hasRenderableReport && report ? (
              <RelationshipsTab schema={report.schema} statistics={report.statistics} />
            ) : null}
            {visibleTab === "visualisations" && hasRenderableReport && report ? <VisualisationsTab visualisations={report.visualisations} /> : null}
            {visibleTab === "ml" && hasRenderableReport && report ? (
              <MLTab
                key={`${report.analysis_id}:${report.ml_experiments.map((experiment) => experiment.id).join("|")}`}
                analysisId={report.analysis_id}
                capabilities={report.ml_capabilities}
                experiments={report.ml_experiments || []}
                initialUnsupervised={report.ml_results.unsupervised}
                initialSupervised={report.ml_results.supervised}
                onRunUnsupervised={async (nClusters) => {
                  const result = await runUnsupervisedAnalysis(report.analysis_id, nClusters);
                  setReport((current) =>
                    current
                      ? {
                          ...current,
                          ml_results: {
                            ...current.ml_results,
                            unsupervised: result,
                          },
                          ml_experiments: result.experiment
                            ? [result.experiment, ...(current.ml_experiments || []).filter((item) => item.id !== result.experiment?.id)]
                            : current.ml_experiments,
                        }
                      : current
                  );
                  await refreshAnalyses(report.analysis_id);
                  notifyAnalysesChanged();
                  return result;
                }}
                onRunSupervised={async (targetColumn) => {
                  const result = await runSupervisedAnalysis(report.analysis_id, targetColumn);
                  setReport((current) =>
                    current
                      ? {
                          ...current,
                          ml_results: {
                            ...current.ml_results,
                            supervised: result,
                          },
                          ml_experiments: result.experiment
                            ? [result.experiment, ...(current.ml_experiments || []).filter((item) => item.id !== result.experiment?.id)]
                            : current.ml_experiments,
                        }
                      : current
                  );
                  await refreshAnalyses(report.analysis_id);
                  notifyAnalysesChanged();
                  return result;
                }}
                onDeleteExperiment={async (experiment) => {
                  await deleteMlExperiment(report.analysis_id, experiment);
                  await refreshAnalyses(report.analysis_id, "ml");
                  notifyAnalysesChanged();
                }}
              />
            ) : null}
            </div>
          </>
        ) : null}

        {!loading && report && !hasRenderableReport ? (
          <div className="border-l-2 border-[#ffb079]/40 pl-4 text-sm text-white/60">
            <p className="font-semibold text-white">This saved analysis is incomplete.</p>
            <p className="mt-1 leading-6">
              The record loaded, but the full report structure is not ready. Re-stage the dataset from Uploads or inspect the archived copy from History.
            </p>
          </div>
        ) : null}
      </AppShell>

      <LoginRequiredModal
        open={loginRequired}
        title="Login required"
        message="Log in to review current dataset reports and run optional ML workflows."
        loginHref="/login?redirect=/analysis"
        onDismiss={() => setLoginRequired(false)}
        onLoginSuccess={() => setLoginRequired(false)}
      />
    </>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#08131e] px-6 py-10 text-sm text-white/55">
          Loading analysis workspace...
        </div>
      }
    >
      <AnalysisPageContent />
    </Suspense>
  );
}

/* ────────────────── Phone-only analysis tab slides ────────────────── */

function AnalysisMobileSections({
  report,
  activeTab,
  onTabChange,
  refreshAnalyses,
}: {
  report: AnalysisReport;
  activeTab: AnalysisTabKey;
  onTabChange: (nextTab: AnalysisTabKey) => void;
  refreshAnalyses: (nextId?: number, nextTab?: AnalysisTabKey) => Promise<void>;
}) {
  const { push } = useMobileSlide();
  const [datasetExpanded, setDatasetExpanded] = useState(false);
  let activeContent: React.ReactNode = null;

  if (activeTab === "overview") {
    activeContent = (
      <OverviewTab
        overview={report.overview}
        schema={report.schema}
        quality={report.quality}
        insights={report.insights}
      />
    );
  }

  if (activeTab === "insights") {
    activeContent = <InsightsTab insights={report.insights} />;
  }

  if (activeTab === "schema") {
    activeContent = <SchemaTab schema={report.schema} />;
  }

  if (activeTab === "quality") {
    activeContent = <DataQualityTab overview={report.overview} quality={report.quality} />;
  }

  if (activeTab === "statistics") {
    activeContent = <StatisticsTab statistics={report.statistics} />;
  }

  if (activeTab === "relationships") {
    activeContent = <RelationshipsTab schema={report.schema} statistics={report.statistics} />;
  }

  if (activeTab === "visualisations") {
    activeContent = <VisualisationsTab visualisations={report.visualisations} />;
  }

  if (activeTab === "ml") {
    activeContent = (
      <MLTab
        key={`mobile-${report.analysis_id}:${report.ml_experiments.map((e) => e.id).join("|")}`}
        analysisId={report.analysis_id}
        capabilities={report.ml_capabilities}
        experiments={report.ml_experiments || []}
        initialUnsupervised={report.ml_results.unsupervised}
        initialSupervised={report.ml_results.supervised}
        onRunUnsupervised={async (nClusters) => {
          const result = await runUnsupervisedAnalysis(report.analysis_id, nClusters);
          await refreshAnalyses(report.analysis_id);
          notifyAnalysesChanged();
          return result;
        }}
        onRunSupervised={async (targetColumn) => {
          const result = await runSupervisedAnalysis(report.analysis_id, targetColumn);
          await refreshAnalyses(report.analysis_id);
          notifyAnalysesChanged();
          return result;
        }}
        onDeleteExperiment={async (experiment) => {
          await deleteMlExperiment(report.analysis_id, experiment);
          await refreshAnalyses(report.analysis_id, "ml");
          notifyAnalysesChanged();
        }}
      />
    );
  }

  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? "Section";
  const activeTabPreview = getAnalysisSectionPreview(report, activeTab);
  const activeTabAccent = tabAccents[activeTab];
  const focusedViewContent = (
    <div className="analysis-mobile-focus-view">
      <section className="analysis-mobile-focus-hero" style={{ ["--analysis-focus-accent" as string]: activeTabAccent }}>
        <div>
          <p className="analysis-mobile-focus-kicker">Focused view</p>
          <h2 className="analysis-mobile-focus-title">{activeTabLabel}</h2>
          <p className="analysis-mobile-focus-lead">{tabDescriptions[activeTab]}</p>
          <p className="analysis-mobile-focus-summary">{activeTabPreview.summary}</p>
        </div>
        <div className="analysis-mobile-focus-meta">
          {activeTabPreview.pills.map((pill) => (
            <span key={`focus-${activeTab}-${pill}`} className="mobile-screen-pill">
              {pill}
            </span>
          ))}
        </div>
      </section>

      <section className="analysis-mobile-focus-note">
        <p className="analysis-mobile-focus-note-title">Expand only what matters</p>
        <p className="analysis-mobile-focus-note-copy">
          Longer sections use read-more controls so the important signals stay easy to scan before you open the deeper detail.
        </p>
      </section>

      <section className="analysis-mobile-focus-content">
        {activeContent}
      </section>
    </div>
  );

  return (
    <div className="phone-only mobile-screen-stack">
      <div className="mobile-screen-stats">
        <article className="mobile-screen-stat">
          <p className="mobile-screen-stat-label">Rows</p>
          <p className="mobile-screen-stat-value">{report.overview.row_count.toLocaleString()}</p>
          <p className="mobile-screen-stat-hint">Dataset size</p>
        </article>
        <article className="mobile-screen-stat">
          <p className="mobile-screen-stat-label">Columns</p>
          <p className="mobile-screen-stat-value">{report.overview.column_count.toLocaleString()}</p>
          <p className="mobile-screen-stat-hint">Profiled fields</p>
        </article>
        <article className="mobile-screen-stat">
          <p className="mobile-screen-stat-label">Quality</p>
          <p className="mobile-screen-stat-value">{calculateQualityScore(report.overview, report.quality).toFixed(1)}</p>
          <p className="mobile-screen-stat-hint">Composite score</p>
        </article>
      </div>

      <section className="mobile-screen-panel section-glow">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Active dataset</p>
            <h2 className="mobile-screen-title">{report.source_filename || report.overview.dataset_name}</h2>
            <p className="mobile-screen-meta">
              {report.overview.dataset_name}
              {report.saved_at ? ` • saved ${formatDate(report.saved_at)}` : ""}
            </p>
            <p className="mobile-screen-lead">
              {datasetExpanded
                ? report.insights.summary
                : report.insights.summary.length > 120
                  ? `${report.insights.summary.slice(0, 120)}…`
                  : report.insights.summary}
              {report.insights.summary.length > 120 && !datasetExpanded ? (
                <button
                  type="button"
                  onClick={() => setDatasetExpanded(true)}
                  style={{ background: "none", border: "none", color: "var(--accent-cta-muted)", cursor: "pointer", fontSize: "inherit", fontWeight: 600, marginLeft: "0.3rem", padding: 0 }}
                >
                  Read more
                </button>
              ) : null}
              {datasetExpanded && report.insights.summary.length > 120 ? (
                <button
                  type="button"
                  onClick={() => setDatasetExpanded(false)}
                  style={{ background: "none", border: "none", color: "var(--accent-cta-muted)", cursor: "pointer", fontSize: "inherit", fontWeight: 600, marginLeft: "0.3rem", padding: 0 }}
                >
                  Show less
                </button>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mobile-screen-pills">
          <span className="mobile-screen-pill" data-tone={report.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
            {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
          </span>
          {report.overview.total_missing_values > 0 ? (
            <span className="mobile-screen-pill">{report.overview.total_missing_values.toLocaleString()} missing</span>
          ) : null}
          {report.overview.duplicate_row_count > 0 ? (
            <span className="mobile-screen-pill">{report.overview.duplicate_row_count.toLocaleString()} duplicates</span>
          ) : null}
          <span className="mobile-screen-pill" data-tone="purple">
            {report.ml_experiments.length} ML experiment{report.ml_experiments.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mobile-screen-actions">
          <button
            type="button"
            onClick={() => {
              void downloadAnalysisReport(report.analysis_id);
            }}
            className="mobile-screen-button mobile-screen-button-secondary"
          >
            Export results
          </button>
          <button
            type="button"
            onClick={() => onTabChange("ml")}
            className="mobile-screen-button mobile-screen-button-primary"
          >
            {activeTab === "ml" ? "ML lab open" : "Open ML lab"}
          </button>
        </div>
      </section>

      <section className="mobile-screen-panel">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Report sections</p>
            <h2 className="mobile-screen-title">Choose a section, then open the full view</h2>
            <p className="mobile-screen-lead">
              Use the dropdown to move between analysis sections, review the quick summary below, then open the full focused view when you want the complete detail.
            </p>
          </div>
        </div>
        <div className="mobile-screen-field">
          <label htmlFor="mobile-analysis-tab" className="mobile-screen-field-label">Current section</label>
          <select
            id="mobile-analysis-tab"
            value={activeTab}
            onChange={(event) => onTabChange(event.target.value as AnalysisTabKey)}
            className="mobile-tab-select"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
        <div className="analysis-mobile-tab-spotlight" style={{ ["--analysis-focus-accent" as string]: activeTabAccent }}>
          <div className="analysis-mobile-tab-spotlight-head">
            <p className="analysis-mobile-tab-spotlight-kicker">Selected section</p>
            <h3 className="analysis-mobile-tab-spotlight-title">{activeTabLabel}</h3>
            <p className="analysis-mobile-tab-spotlight-copy">{tabDescriptions[activeTab]}</p>
          </div>
          <p className="analysis-mobile-tab-spotlight-summary">{activeTabPreview.summary}</p>
          <div className="mobile-screen-pills compact">
            {activeTabPreview.pills.map((pill) => (
              <span key={`${activeTab}-${pill}`} className="mobile-screen-pill">
                {pill}
              </span>
            ))}
          </div>
        </div>
        <div className="mobile-screen-actions">
          <button
            type="button"
            onClick={() =>
              push({
                id: `analysis-${report.analysis_id}-${activeTab}`,
                title: activeTabLabel,
                accent: activeTabAccent,
                content: focusedViewContent,
              })
            }
            className="mobile-screen-button mobile-screen-button-primary"
          >
            Open focused view
          </button>
        </div>
      </section>
    </div>
  );
}