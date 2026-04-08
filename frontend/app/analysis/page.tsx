"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import SurfaceLoadingIndicator from "@/components/ui/SurfaceLoadingIndicator";
const OverviewTab = lazy(() => import("@/components/analysis/OverviewTab"));
const SchemaTab = lazy(() => import("@/components/analysis/SchemaTab"));
const DataQualityTab = lazy(() => import("@/components/analysis/DataQualityTab"));
const StatisticsTab = lazy(() => import("@/components/analysis/StatisticsTab"));
const VisualisationsTab = lazy(() => import("@/components/analysis/VisualisationsTab"));
const InsightsTab = lazy(() => import("@/components/analysis/InsightsTab"));
const RelationshipsTab = lazy(() => import("@/components/analysis/RelationshipsTab"));
const MLTab = lazy(() => import("@/components/analysis/MLTab"));
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
  analysisTabDescriptions,
  getAnalysisFocusArea,
  getAnalysisTabDefinition,
  resolveRequestedTab,
} from "@/lib/analysisNavigation";
import { analysisVisualCards } from "@/lib/analysisVisualCards";
import { formatDate } from "@/lib/helpers";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";
import { useSwipeTabs } from "@/lib/useSwipeTabs";

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
    if (typeof window !== "undefined" && window.innerWidth < 960) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    }
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
  const activeCard = analysisVisualCards.find((card) => card.tabKeys.includes(visibleTab)) ?? analysisVisualCards[0];
  const desktopAccent = activeCard.accent;

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
          <div className="py-10">
            <SurfaceLoadingIndicator label="Loading analysis workspace..." className="mx-auto" />
          </div>
        ) : null}

        {!loading ? (
          <>
            {/* Phone: dataset summary + tappable section list for each tab */}
            {showWorkspaceNavigation && hasRenderableReport && report ? (
              <AnalysisMobileSections
                report={report}
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
                  <div className="analysis-visual-grid mt-3" data-layout="workspace">
                    {analysisVisualCards.map((card) => {
                      const areaActive = card.tabKeys.includes(visibleTab);
                      return (
                        <article
                          key={card.key}
                          className={`analysis-visual-card ${areaActive ? "analysis-visual-card-active" : ""}`}
                          style={{ "--analysis-card-accent": card.accent, "--analysis-card-border": `${card.accent}33` } as React.CSSProperties}
                        >
                          <div className="analysis-visual-cover">{card.cover}</div>
                          <div className="analysis-visual-body">
                            <p className="analysis-visual-title">{card.label}</p>
                            <p className="analysis-visual-copy">{card.description}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="analysis-visual-tabrail-grid mt-3" data-layout="workspace">
                    {analysisVisualCards.map((card) => {
                      const areaActive = card.tabKeys.includes(visibleTab);
                      return (
                        <div
                          key={`workspace-rail-${card.key}`}
                          className={`analysis-visual-tabrail-group ${areaActive ? "analysis-visual-tabrail-group-active" : ""}`}
                          style={{ "--analysis-card-accent": card.accent, "--analysis-card-border": `${card.accent}33` } as React.CSSProperties}
                        >
                          <div className="analysis-visual-tabrail-head">
                            <span className="analysis-visual-tabrail-label">{card.label}</span>
                            <span className="analysis-visual-tabrail-count">
                              {card.tabKeys.length} view{card.tabKeys.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {card.tabKeys.map((tabKey) => {
                            const tab = getAnalysisTabDefinition(tabKey);
                            const active = visibleTab === tab.key;
                            return (
                              <button
                                type="button"
                                key={`workspace-rail-${card.key}-${tab.key}`}
                                onClick={() => handleTabChange(tab.key)}
                                className={`analysis-subnav-link analysis-subnav-link-accent ${active ? "analysis-subnav-link-active" : ""}`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
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
                    <ScrollIntentLink href={placeholderState.primaryHref} className="rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-5 py-2.5 text-sm font-semibold text-[#f3e8ff]">
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
              <div
                className="tablet-up grid gap-4 xl:grid-cols-3 desktop-tab-accent-wrapper"
                style={{ "--analysis-card-accent": desktopAccent, "--analysis-card-border": `${desktopAccent}33` } as React.CSSProperties}
              >
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
            <Suspense fallback={<div className="py-12"><SurfaceLoadingIndicator label="Loading analysis view..." compact className="mx-auto" /></div>}>
            <div key={visibleTab} className="tablet-up space-y-4 desktop-tab-accent-wrapper analysis-content-stage" style={{ "--analysis-card-accent": desktopAccent, "--analysis-card-border": `${desktopAccent}33` } as React.CSSProperties}>

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
            </Suspense>
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
        <div className="flex min-h-screen items-center justify-center bg-[#08131e] px-6 py-10 text-sm text-white/55">
          <SurfaceLoadingIndicator label="Loading analysis workspace..." />
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

/* ── SVG card cover art for each of the 5 analysis sections ── */
const cardCovers: Record<string, React.ReactElement> = {
  overview: (
    <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="140" fill="#1a1f36"/>
      <circle cx="260" cy="20" r="70" fill="#2d3f8a" opacity="0.5"/>
      <circle cx="40" cy="120" r="45" fill="#2d3f8a" opacity="0.3"/>
      {/* diagonal-split motif */}
      <polygon points="0,0 200,0 0,140" fill="#4f6ef7" opacity="0.06"/>
      <polygon points="300,140 100,140 300,0" fill="#06b6d4" opacity="0.04"/>
      <line x1="0" y1="140" x2="300" y2="0" stroke="#4f6ef7" strokeWidth="0.8" opacity="0.15"/>
      <rect x="24" y="42" width="52" height="36" rx="5" fill="#4f6ef7" opacity="0.9"/>
      <rect x="84" y="42" width="80" height="36" rx="5" fill="#4f6ef7" opacity="0.5"/>
      <rect x="172" y="42" width="104" height="36" rx="5" fill="#4f6ef7" opacity="0.25"/>
      <rect x="24" y="86" width="252" height="9" rx="3" fill="#4f6ef7" opacity="0.2"/>
      <rect x="24" y="102" width="190" height="9" rx="3" fill="#4f6ef7" opacity="0.14"/>
      <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Overview</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(165,184,255,0.6)" letterSpacing="2">SUMMARY · METRICS · KPIs</text>
    </svg>
  ),
  "data-health": (
    <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="140" fill="#0d3b2e"/>
      <circle cx="270" cy="20" r="70" fill="#145a42" opacity="0.5"/>
      <circle cx="30" cy="120" r="45" fill="#145a42" opacity="0.3"/>
      {/* radial-lines motif */}
      <line x1="240" y1="90" x2="240" y2="20" stroke="#22c55e" strokeWidth="0.8" opacity="0.12"/>
      <line x1="240" y1="90" x2="280" y2="50" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <line x1="240" y1="90" x2="290" y2="90" stroke="#22c55e" strokeWidth="0.8" opacity="0.08"/>
      <line x1="240" y1="90" x2="280" y2="130" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <line x1="240" y1="90" x2="200" y2="50" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <line x1="240" y1="90" x2="200" y2="130" stroke="#22c55e" strokeWidth="0.8" opacity="0.08"/>
      <circle cx="240" cy="90" r="4" fill="#22c55e" opacity="0.18"/>
      <circle cx="240" cy="90" r="18" fill="none" stroke="#22c55e" strokeWidth="0.6" opacity="0.1"/>
      <circle cx="240" cy="90" r="35" fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.06"/>
      <polyline points="20,72 56,72 74,38 92,108 110,55 128,82 152,72 280,72" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="74" cy="38" r="4" fill="#22c55e"/>
      <circle cx="92" cy="108" r="4" fill="#22c55e"/>
      <circle cx="110" cy="55" r="4" fill="#22c55e"/>
      <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Data Health</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(134,239,172,0.6)" letterSpacing="2">QUALITY · NULLS · ANOMALIES</text>
    </svg>
  ),
  schema: (
    <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="140" fill="#1e1535"/>
      <circle cx="260" cy="20" r="65" fill="#2d1f52" opacity="0.5"/>
      {/* dot-grid motif */}
      <circle cx="220" cy="42" r="1.5" fill="#a78bfa" opacity="0.18"/>
      <circle cx="236" cy="42" r="1.5" fill="#a78bfa" opacity="0.14"/>
      <circle cx="252" cy="42" r="2" fill="#a78bfa" opacity="0.25"/>
      <circle cx="268" cy="42" r="1.5" fill="#a78bfa" opacity="0.12"/>
      <circle cx="220" cy="58" r="2" fill="#a78bfa" opacity="0.22"/>
      <circle cx="236" cy="58" r="1.5" fill="#a78bfa" opacity="0.16"/>
      <circle cx="252" cy="58" r="1.5" fill="#a78bfa" opacity="0.2"/>
      <circle cx="268" cy="58" r="2" fill="#a78bfa" opacity="0.28"/>
      <circle cx="220" cy="74" r="1.5" fill="#a78bfa" opacity="0.14"/>
      <circle cx="236" cy="74" r="2" fill="#a78bfa" opacity="0.2"/>
      <circle cx="252" cy="74" r="1.5" fill="#a78bfa" opacity="0.16"/>
      <circle cx="268" cy="74" r="1.5" fill="#a78bfa" opacity="0.1"/>
      <rect x="24" y="38" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.9"/>
      <rect x="24" y="56" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.45"/>
      <rect x="24" y="74" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.3"/>
      <rect x="24" y="92" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.18"/>
      <line x1="108" y1="38" x2="108" y2="102" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
      <line x1="192" y1="38" x2="192" y2="102" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
      <text x="24" y="125" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Schema</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(196,181,253,0.6)" letterSpacing="2">TABLES · COLUMNS · TYPES</text>
    </svg>
  ),
  charts: (
    <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="140" fill="#2d1a00"/>
      <circle cx="262" cy="18" r="68" fill="#4a2c00" opacity="0.5"/>
      {/* scatter-plot trend motif */}
      <circle cx="248" cy="34" r="2.5" fill="#f59e0b" opacity="0.18"/>
      <circle cx="260" cy="42" r="3.5" fill="#f59e0b" opacity="0.22"/>
      <circle cx="272" cy="28" r="2" fill="#f59e0b" opacity="0.15"/>
      <circle cx="256" cy="54" r="2" fill="#f59e0b" opacity="0.12"/>
      <circle cx="280" cy="38" r="2.5" fill="#f59e0b" opacity="0.16"/>
      <line x1="242" y1="60" x2="288" y2="24" stroke="#fcd34d" strokeWidth="0.8" opacity="0.15" strokeDasharray="3,3"/>
      <rect x="24" y="82" width="28" height="38" rx="3" fill="#f59e0b" opacity="0.4"/>
      <rect x="60" y="62" width="28" height="58" rx="3" fill="#f59e0b" opacity="0.6"/>
      <rect x="96" y="44" width="28" height="76" rx="3" fill="#f59e0b" opacity="0.85"/>
      <rect x="132" y="55" width="28" height="65" rx="3" fill="#f59e0b" opacity="0.7"/>
      <rect x="168" y="68" width="28" height="52" rx="3" fill="#f59e0b" opacity="0.5"/>
      <rect x="204" y="76" width="28" height="44" rx="3" fill="#f59e0b" opacity="0.35"/>
      <line x1="14" y1="120" x2="286" y2="120" stroke="#f59e0b" strokeWidth="1" opacity="0.2"/>
      <text x="24" y="135" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Charts</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,211,77,0.6)" letterSpacing="2">VISUALISE · EXPLORE · COMPARE</text>
    </svg>
  ),
  ml: (
    <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="140" fill="#2d0a1a"/>
      <circle cx="258" cy="18" r="70" fill="#4a0f28" opacity="0.5"/>
      <circle cx="20" cy="118" r="45" fill="#4a0f28" opacity="0.3"/>
      {/* ring-gauge motif */}
      <circle cx="248" cy="105" r="22" fill="none" stroke="#f43f5e" strokeWidth="3" strokeDasharray="70 69" strokeDashoffset="18" strokeLinecap="round" opacity="0.25"/>
      <circle cx="248" cy="105" r="14" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="44 44" strokeDashoffset="12" strokeLinecap="round" opacity="0.15"/>
      <circle cx="248" cy="105" r="5" fill="#f43f5e" opacity="0.12"/>
      <circle cx="44" cy="42" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="44" cy="70" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="44" cy="98" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="110" cy="32" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="110" cy="60" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="110" cy="88" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="110" cy="108" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="176" cy="42" r="9" fill="#f43f5e" opacity="0.5"/>
      <circle cx="176" cy="70" r="9" fill="#f43f5e" opacity="0.5"/>
      <circle cx="176" cy="98" r="9" fill="#f43f5e" opacity="0.5"/>
      <circle cx="242" cy="56" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="242" cy="84" r="9" fill="#f43f5e" opacity="0.9"/>
      <line x1="53" y1="42" x2="101" y2="32" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="42" x2="101" y2="60" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="70" x2="101" y2="60" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="70" x2="101" y2="88" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="98" x2="101" y2="88" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="98" x2="101" y2="108" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="32" x2="167" y2="42" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="60" x2="167" y2="42" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="60" x2="167" y2="70" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="88" x2="167" y2="70" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="88" x2="167" y2="98" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="185" y1="42" x2="233" y2="56" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
      <line x1="185" y1="70" x2="233" y2="56" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
      <line x1="185" y1="70" x2="233" y2="84" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
      <line x1="185" y1="98" x2="233" y2="84" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
      <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">ML Lab</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,164,175,0.6)" letterSpacing="2">TRAIN · EVALUATE · PREDICT</text>
    </svg>
  ),
};

function AnalysisMobileSections({
  report,
  refreshAnalyses,
}: {
  report: AnalysisReport;
  refreshAnalyses: (nextId?: number, nextTab?: AnalysisTabKey) => Promise<void>;
}) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(0);

  useEffect(() => {
    if (!openCard || typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [openCard]);

  function handleOpenCard(card: MobileCard) {
    setOpenCard(card.key);
    setActiveSubIdx(0);
  }

  function handleBack() {
    setOpenCard(null);
    setActiveSubIdx(0);
  }

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
        return <OverviewTab overview={report.overview} schema={report.schema} quality={report.quality} insights={report.insights} mobileSection={section} />;
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
  const swipeHandlers = useSwipeTabs({
    length: currentCard?.subtabs?.length ?? 0,
    index: activeSubIdx,
    onChange: setActiveSubIdx,
    disabled: !currentCard,
  });

  const cardAccents: Record<string, string> = {
    "overview": "#4f6ef7",
    "data-health": "#22c55e",
    "schema": "#a78bfa",
    "charts": "#f59e0b",
    "ml": "#f43f5e",
  };

  /* ── Detail view (card opened) ── */
  if (openCard && currentCard) {
    const accent = cardAccents[currentCard.key] ?? "#4f6ef7";
    return (
      <div className="phone-only mobile-analysis-fullpage">
        <div className="mobile-analysis-fullpage-topbar">
          <button type="button" onClick={handleBack} className="mobile-analysis-back-btn-inline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span style={{ color: accent, fontFamily: "var(--font-mono)", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {currentCard.label}
          </span>
        </div>

        <div className="mobile-analysis-detail-stage" {...swipeHandlers}>
          <div
            className="mobile-analysis-detail-cover"
            style={{ "--analysis-card-accent": accent, "--analysis-card-border": `${accent}44` } as React.CSSProperties}
          >
            {cardCovers[currentCard.key]}
            {currentCard.subtabs && currentCard.subtabs.length > 1 ? (
              <div className="mobile-analysis-detail-subtabs">
                {currentCard.subtabs.map((sub, idx) => (
                  <button
                    key={sub.label}
                    type="button"
                    onClick={() => setActiveSubIdx(idx)}
                    className={`mobile-analysis-detail-subtab${activeSubIdx === idx ? " mobile-analysis-detail-subtab-active" : ""}`}
                    style={{ "--subtab-accent": accent } as React.CSSProperties}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {currentCard.subtabs && currentCard.subtabs.length > 1 ? (
            <p className="mobile-analysis-swipe-hint">Swipe left or right across this panel to switch views.</p>
          ) : null}

          <section key={`analysis-mobile-${currentCard.key}-${activeSubIdx}`} className="mobile-screen-panel mobile-analysis-content-panel analysis-mobile-focus-content analysis-motion-surface" style={{ "--analysis-card-accent": accent, "--analysis-card-border": `${accent}33` } as React.CSSProperties}>
            <Suspense fallback={<div className="py-8"><SurfaceLoadingIndicator label="Loading analysis view..." compact className="mx-auto" /></div>}>
              {renderContent()}
            </Suspense>
          </section>
        </div>
      </div>
    );
  }

  /* ── Index view: 2-col grid of SVG card covers ── */
  return (
    <div className="phone-only mobile-screen-stack">
      {/* Dataset hero banner */}
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

      {/* 2-column SVG card grid */}
      <div className="mobile-analysis-svg-grid">
        {mobileAnalysisCards.map((card) => {
          const accent = cardAccents[card.key] ?? "#4f6ef7";
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleOpenCard(card)}
              className="mobile-analysis-svg-card"
              style={{ "--analysis-card-accent": accent } as React.CSSProperties}
            >
              {cardCovers[card.key]}
              <span className="mobile-analysis-svg-card-tap">Tap to open</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}