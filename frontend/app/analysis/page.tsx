"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
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
  getAnalyses,
  getAnalysisById,
  runSupervisedAnalysis,
  runUnsupervisedAnalysis,
} from "@/lib/analysisApi";
import { AnalysisListItem, AnalysisReport } from "@/lib/analysisTypes";
import {
  clearCurrentAnalysisSelection,
  getCurrentAnalysisSelection,
  isAnalysisStateStorageEvent,
  notifyAnalysesChanged,
  setCurrentAnalysisSelection,
} from "@/lib/currentAnalysis";
import { calculateQualityScore } from "@/lib/analysisDerived";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";

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

  function buildAnalysisHref(analysisId: number, tab: AnalysisTabKey = activeTab) {
    const tabQuery = tab !== "overview" ? `&tab=${tab}` : "";
    return `/analysis?analysisId=${analysisId}${tabQuery}`;
  }

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

    const handleStorage = (event: StorageEvent) => {
      if (!active || !isAnalysisStateStorageEvent(event)) return;
      void bootstrap();
    };

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [requestedAnalysisId, router]);

  async function refreshAnalyses(nextId?: number, nextTab?: AnalysisTabKey) {
    const items = await getAnalyses();
    setAnalyses(items);
    const targetId = nextId ?? selectedAnalysisId;

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
    router.replace(buildAnalysisHref(targetId, nextTab ?? activeTab), { scroll: false });
  }

  const hasRenderableReport = Boolean(
    report &&
      (report.overview.row_count > 0 ||
        report.overview.column_count > 0 ||
        report.schema.columns.length > 0 ||
        report.statistics.numeric_summary.length > 0 ||
        report.statistics.categorical_summary.length > 0)
  );
  const visibleTab: AnalysisTabKey = hasRenderableReport ? activeTab : "overview";

  const stats = hasRenderableReport && report
    ? [
        {
          label: "Rows",
          value: report.overview.row_count.toLocaleString(),
          hint: report.overview.dataset_name,
        },
        {
          label: "Columns",
          value: report.overview.column_count.toLocaleString(),
          hint: `${report.schema.target_candidates.length} target candidates inferred`,
        },
        {
          label: "Quality score",
          value: calculateQualityScore(report.overview, report.quality).toFixed(1),
          hint: report.insights.modeling_readiness.is_ready ? "Optional ML enabled" : "EDA-first mode",
        },
      ]
    : [];

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
        eyebrow="Analysis Workspace"
        title="Review the current dataset from Overview first, then inspect the details"
        description="Open the selected dataset report and move through the tabs as needed."
        stats={stats}
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
              <div className="phone-only space-y-3">
                {/* Inline dataset overview on mobile */}
                <div className="mobile-inline-stats">
                  <div className="mobile-inline-stat">
                    <span className="mobile-inline-stat-value">{report.overview.row_count.toLocaleString()}</span>
                    <span className="mobile-inline-stat-label">Rows</span>
                  </div>
                  <div className="mobile-inline-stat">
                    <span className="mobile-inline-stat-value">{report.overview.column_count}</span>
                    <span className="mobile-inline-stat-label">Columns</span>
                  </div>
                  <div className="mobile-inline-stat">
                    <span className="mobile-inline-stat-value">{calculateQualityScore(report.overview, report.quality).toFixed(1)}</span>
                    <span className="mobile-inline-stat-label">Quality</span>
                  </div>
                </div>

                <div className="border-b border-white/6 pb-3">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/42">Active dataset</p>
                  <p className="mt-1 font-medium text-white">{report.overview.dataset_name}</p>
                  <p className="mt-1.5 text-sm leading-6 text-white/55">{report.insights.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="info-chip">
                      <span className="pulse-dot" />
                      {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                    </span>
                    {report.overview.total_missing_values > 0 && (
                      <span className="info-chip">{report.overview.total_missing_values.toLocaleString()} missing</span>
                    )}
                    {report.overview.duplicate_row_count > 0 && (
                      <span className="info-chip">{report.overview.duplicate_row_count.toLocaleString()} duplicates</span>
                    )}
                    <span className="info-chip">{report.ml_experiments.length} ML experiment{report.ml_experiments.length === 1 ? "" : "s"}</span>
                  </div>
                </div>

                <AnalysisMobileSections report={report} refreshAnalyses={refreshAnalyses} />
              </div>
            ) : null}

            {/* Desktop: pre-tab dataset summary */}
            {showWorkspaceNavigation && hasRenderableReport && report ? (
              <div className="tablet-up flow-section section-glow">
                <p className="flow-section-label">Dataset overview</p>
                <div className="accent-bar" />
                <p className="mt-2 font-[family:var(--font-display)] text-lg font-bold text-white">{report.overview.dataset_name}</p>
                <p className="mt-1.5 max-w-4xl text-sm leading-6 text-white/55">{report.insights.summary}</p>
                <div className="stat-row mt-3">
                  <div className="stat-row-item">
                    <p className="stat-row-value">{report.overview.row_count.toLocaleString()}</p>
                    <p className="stat-row-label">Rows</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{report.overview.column_count}</p>
                    <p className="stat-row-label">Columns</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{report.overview.total_missing_values.toLocaleString()}</p>
                    <p className="stat-row-label">Missing values</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{report.overview.duplicate_row_count.toLocaleString()}</p>
                    <p className="stat-row-label">Duplicates</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{calculateQualityScore(report.overview, report.quality).toFixed(1)}</p>
                    <p className="stat-row-label">Quality score</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{report.ml_experiments.length}</p>
                    <p className="stat-row-label">ML experiments</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="info-chip">
                    <span className="pulse-dot" />
                    {report.insights.modeling_readiness.is_ready ? "Modeling-ready" : "EDA-first recommended"}
                  </span>
                  {report.schema.target_candidates.length > 0 && (
                    <span className="info-chip">{report.schema.target_candidates.length} target candidate{report.schema.target_candidates.length === 1 ? "" : "s"}</span>
                  )}
                </div>
              </div>
            ) : null}

            {showWorkspaceNavigation ? (
              <div id="analysis-workspace-navigation" className="tablet-up route-scroll-target border-b border-white/6 pb-4">
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

                <p className="analysis-subnav-description px-1 pt-3 text-sm leading-6 text-white/50">{activeTabDescription}</p>
              </div>
            ) : null}

            {placeholderState ? (
              <article className="flow-section">
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
            ) : null}

            {/* Inline tab content — tablet+ only (phone uses slide pages) */}
            <div className="tablet-up">
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

const tabAccents: Record<AnalysisTabKey, string> = {
  overview: "#7ad6ff",
  insights: "#ffb079",
  schema: "#a78bfa",
  quality: "#5ae681",
  statistics: "#fbbf24",
  relationships: "#f472b6",
  visualisations: "#38bdf8",
  ml: "#c084fc",
};

function AnalysisMobileSections({
  report,
  refreshAnalyses,
}: {
  report: AnalysisReport;
  refreshAnalyses: (nextId?: number, nextTab?: AnalysisTabKey) => Promise<void>;
}) {
  const sections: MobileSection[] = [
    {
      id: "analysis-overview",
      title: "Overview",
      hint: `${report.overview.row_count.toLocaleString()} rows · ${report.overview.column_count} columns`,
      accent: tabAccents.overview,
      content: (
        <OverviewTab
          overview={report.overview}
          schema={report.schema}
          quality={report.quality}
          insights={report.insights}
        />
      ),
    },
    {
      id: "analysis-insights",
      title: "Insights",
      hint: report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first",
      accent: tabAccents.insights,
      content: <InsightsTab insights={report.insights} />,
    },
    {
      id: "analysis-schema",
      title: "Schema",
      hint: `${report.schema.columns.length} columns profiled`,
      accent: tabAccents.schema,
      content: <SchemaTab schema={report.schema} />,
    },
    {
      id: "analysis-quality",
      title: "Data Quality",
      hint: `Score ${calculateQualityScore(report.overview, report.quality).toFixed(1)}`,
      accent: tabAccents.quality,
      content: <DataQualityTab overview={report.overview} quality={report.quality} />,
    },
    {
      id: "analysis-statistics",
      title: "Statistics",
      hint: `${report.statistics.numeric_summary.length} numeric · ${report.statistics.categorical_summary.length} categorical`,
      accent: tabAccents.statistics,
      content: <StatisticsTab statistics={report.statistics} />,
    },
    {
      id: "analysis-relationships",
      title: "Relationships",
      hint: "Structural patterns and correlations",
      accent: tabAccents.relationships,
      content: <RelationshipsTab schema={report.schema} statistics={report.statistics} />,
    },
    {
      id: "analysis-visualisations",
      title: "Charts",
      hint: "Visual summaries from the current run",
      accent: tabAccents.visualisations,
      content: <VisualisationsTab visualisations={report.visualisations} />,
    },
    {
      id: "analysis-ml",
      title: "ML Lab",
      hint: `${report.ml_experiments.length} experiment${report.ml_experiments.length === 1 ? "" : "s"} saved`,
      accent: tabAccents.ml,
      content: (
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
      ),
    },
  ];

  return <MobileSectionList sections={sections} />;
}