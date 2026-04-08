"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import {
  type AnalysisTabKey,
  analysisFocusAreas,
  analysisTabDescriptions,
  getAnalysisFocusArea,
  getAnalysisTabDefinition,
  resolveRequestedTab,
} from "@/lib/analysisNavigation";
import { formatDate } from "@/lib/helpers";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";

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

  const activeTabDescription = analysisTabDescriptions[visibleTab];
  const activeFocusArea = getAnalysisFocusArea(visibleTab);

  return (
    <>
      <AppShell
        eyebrow="Analysis workspace"
        title="Analysis"
        description="Explore, visualise, and model your dataset."
        mobileDescription="Review the dataset, charts, and ML tools."
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
                <div className="px-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/42">Analysis map</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {analysisFocusAreas.map((focusArea) => {
                      const areaActive = focusArea.key === activeFocusArea.key;
                      return (
                        <article
                          key={focusArea.key}
                          className={`rounded-xl border px-4 py-4 ${
                            areaActive
                              ? "border-[#7c3aed]/35 bg-[#7c3aed]/10"
                              : "border-white/8 bg-white/[0.02]"
                          }`}
                        >
                          <p className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-white/40">
                            {focusArea.label}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/52">{focusArea.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {focusArea.tabKeys.map((tabKey) => {
                              const tab = getAnalysisTabDefinition(tabKey);
                              const active = visibleTab === tab.key;
                              return (
                                <button
                                  type="button"
                                  key={tab.key}
                                  onClick={() => handleTabChange(tab.key)}
                                  className={`analysis-subnav-link ${active ? "analysis-subnav-link-active" : ""}`}
                                >
                                  {tab.label}
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <p className="analysis-subnav-description px-1 pb-4 pt-4 text-sm leading-6 text-white/50">
                  <span className="font-semibold text-white/74">{activeFocusArea.label}</span> - {activeTabDescription}
                </p>
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
                readiness={report.insights.modeling_readiness}
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

/* ────────────────── Phone-only analysis card navigation ────────────────── */

/** Cards shown on the mobile analysis index screen.
 *  Each subtab can optionally override the tab component it renders via `tab`. */
type MobileCardSubtab = { section: string | string[]; label: string; tab?: AnalysisTabKey };
type MobileCard = {
  key: string;
  label: string;
  description: string;
  icon: string;
  defaultTab: AnalysisTabKey;
  subtabs?: MobileCardSubtab[];
};

const mobileAnalysisCards: MobileCard[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Findings, dataset profile, next steps, and raw data preview.",
    icon: "📊",
    defaultTab: "overview",
    subtabs: [
      { section: "findings", label: "Findings", tab: "insights" },
      { section: ["dataset-posture", "type-mix"], label: "Profile" },
      { section: "what-to-do-next", label: "Next steps", tab: "insights" },
      { section: "raw-data", label: "Raw data" },
    ],
  },
  {
    key: "data-health",
    label: "Data Health",
    description: "Missing values, recommendations, numeric and categorical summaries.",
    icon: "🩺",
    defaultTab: "quality",
    subtabs: [
      { section: ["missingness", "recommendations"], label: "Quality" },
      { section: ["numeric-summary", "categorical-summary"], label: "Statistics", tab: "statistics" },
    ],
  },
  {
    key: "schema",
    label: "Schema",
    description: "Column inventory, correlations, skew, dominance, and modeling signals.",
    icon: "🗂️",
    defaultTab: "schema",
    subtabs: [
      { section: "__all__", label: "Fields" },
      { section: ["strongest-relationships", "skewed-numeric-fields", "dominant-categories", "modeling-signals"], label: "Patterns", tab: "relationships" },
    ],
  },
  {
    key: "charts",
    label: "Charts",
    description: "Missingness, distributions, categories, correlations, and drift.",
    icon: "📈",
    defaultTab: "visualisations",
    subtabs: [
      { section: "missingness", label: "Missing" },
      { section: ["distribution", "boxplot-summary"], label: "Distributions" },
      { section: "top-categories", label: "Categories" },
      { section: ["correlation-heatmap", "pairwise-scatter"], label: "Correlations" },
      { section: "drift-checks", label: "Drift" },
    ],
  },
  {
    key: "ml",
    label: "ML Lab",
    description: "Run or reopen supervised and unsupervised experiments.",
    icon: "🧪",
    defaultTab: "ml",
  },
];

function AnalysisMobileSections({
  report,
  activeTab: _activeTab,
  onTabChange,
  refreshAnalyses,
}: {
  report: AnalysisReport;
  activeTab: AnalysisTabKey;
  onTabChange: (nextTab: AnalysisTabKey) => void;
  refreshAnalyses: (nextId?: number, nextTab?: AnalysisTabKey) => Promise<void>;
}) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(0);

  /* When a card is opened, default to its first subtab. */
  function handleOpenCard(card: MobileCard) {
    setOpenCard(card.key);
    setActiveSubIdx(0);
    onTabChange(card.defaultTab);
  }

  function handleBack() {
    setOpenCard(null);
    setActiveSubIdx(0);
  }

  /* Render the appropriate tab component for the currently active subtab. */
  function renderContent(): React.ReactNode {
    if (!openCard) return null;
    const card = mobileAnalysisCards.find((c) => c.key === openCard);
    if (!card) return null;
    const sub = card.subtabs?.[activeSubIdx];
    const tab = sub?.tab ?? card.defaultTab;
    const rawSection = sub?.section ?? null;
    const section = rawSection === "__all__" ? null : rawSection;

    switch (tab) {
      case "overview":
        return (
          <OverviewTab
            overview={report.overview}
            schema={report.schema}
            quality={report.quality}
            insights={report.insights}
            mobileSection={section}
          />
        );
      case "insights":
        return <InsightsTab insights={report.insights} mobileSection={section} />;
      case "schema":
        return <SchemaTab schema={report.schema} />;
      case "quality":
        return <DataQualityTab overview={report.overview} quality={report.quality} mobileSection={section} />;
      case "statistics":
        return <StatisticsTab statistics={report.statistics} mobileSection={section} />;
      case "relationships":
        return <RelationshipsTab schema={report.schema} statistics={report.statistics} mobileSection={section} />;
      case "visualisations":
        return <VisualisationsTab visualisations={report.visualisations} mobileSection={section} />;
      case "ml":
        return (
          <MLTab
            key={`mobile-${report.analysis_id}:${report.ml_experiments.map((e) => e.id).join("|")}`}
            analysisId={report.analysis_id}
            capabilities={report.ml_capabilities}
            experiments={report.ml_experiments || []}
            readiness={report.insights.modeling_readiness}
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
      default:
        return null;
    }
  }

  const qualityScore = calculateQualityScore(report.overview, report.quality);
  const currentCard = mobileAnalysisCards.find((c) => c.key === openCard);

  /* ── Detail view (card opened) ── */
  if (openCard && currentCard) {
    return (
      <div className="phone-only mobile-screen-stack">
        <button type="button" onClick={handleBack} className="mobile-analysis-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          All sections
        </button>

        <div className="mobile-analysis-detail-header">
          <span className="mobile-analysis-detail-icon">{currentCard.icon}</span>
          <div>
            <h2 className="mobile-analysis-detail-title">{currentCard.label}</h2>
            <p className="mobile-analysis-detail-desc">{currentCard.description}</p>
          </div>
        </div>

        {currentCard.subtabs && currentCard.subtabs.length > 1 ? (
          <select
            value={activeSubIdx}
            onChange={(e) => setActiveSubIdx(Number(e.target.value))}
            className="mobile-analysis-section-select"
          >
            {currentCard.subtabs.map((sub, idx) => (
              <option key={sub.label} value={idx}>{sub.label}</option>
            ))}
          </select>
        ) : null}

        <section className="mobile-screen-panel mobile-analysis-content-panel analysis-mobile-focus-content">
          {renderContent()}
        </section>
      </div>
    );
  }

  /* ── Index view (card grid) ── */
  return (
    <div className="phone-only mobile-screen-stack">
      {/* ── Compact dataset banner ── */}
      <section className="mobile-analysis-hero">
        <div className="mobile-analysis-hero-top">
          <div className="mobile-analysis-hero-info">
            <h2 className="mobile-analysis-hero-name">{report.source_filename || report.overview.dataset_name}</h2>
            <div className="mobile-analysis-hero-chips">
              <span className="mobile-analysis-hero-chip">{report.overview.row_count.toLocaleString()} rows</span>
              <span className="mobile-analysis-hero-chip">{report.overview.column_count} cols</span>
              <span className="mobile-analysis-hero-chip">{qualityScore.toFixed(0)}% quality</span>
              <span className="mobile-analysis-hero-chip" data-tone={report.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void downloadAnalysisReport(report.analysis_id); }}
            className="mobile-analysis-hero-action"
            aria-label="Export report"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </section>

      {/* ── Vertical section cards ── */}
      <div className="mobile-analysis-card-list">
        {mobileAnalysisCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => handleOpenCard(card)}
            className="mobile-analysis-card"
          >
            <span className="mobile-analysis-card-icon">{card.icon}</span>
            <div className="mobile-analysis-card-text">
              <p className="mobile-analysis-card-label">{card.label}</p>
              <p className="mobile-analysis-card-desc">{card.description}</p>
            </div>
            <svg className="mobile-analysis-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>
    </div>
  );
}