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
import { triggerNavigationScroll, useApplyNavigationScroll } from "@/lib/navigationScroll";
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

    triggerNavigationScroll("analysis-workspace-navigation", 0);
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
          <div className="rounded-[24px] border border-[#ff8c8c]/30 bg-[#ff8c8c]/10 px-5 py-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-sm text-white/55">
            Loading analysis workspace...
          </div>
        ) : null}

        {!loading ? (
          <>
            {showWorkspaceNavigation ? (
              <div id="analysis-workspace-navigation" className="route-scroll-target rounded-[28px] border border-white/10 bg-white/[0.04] p-3">
                <p className="px-2 text-xs uppercase tracking-[0.2em] text-white/42">Report sections</p>
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
                <p className="analysis-subnav-description px-2 pt-3 text-sm leading-6 text-white/58">{activeTabDescription}</p>
              </div>
            ) : null}

            {placeholderState ? (
              <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">{placeholderState.eyebrow}</p>
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-white">
                  {placeholderState.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/66">
                  {placeholderState.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ScrollIntentLink href={placeholderState.primaryHref} className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]">
                    {placeholderState.primaryLabel}
                  </ScrollIntentLink>
                  {placeholderState.secondaryHref && placeholderState.secondaryLabel ? (
                    <ScrollIntentLink href={placeholderState.secondaryHref} className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
                      {placeholderState.secondaryLabel}
                    </ScrollIntentLink>
                  ) : null}
                </div>
              </article>
            ) : null}

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
          </>
        ) : null}

        {!loading && report && !hasRenderableReport ? (
          <div className="rounded-[28px] border border-[#ffb079]/25 bg-[#ffb079]/10 px-5 py-6 text-sm text-[#ffe7d7]">
            <p className="font-semibold text-white">This saved analysis is incomplete.</p>
            <p className="mt-2 leading-6 text-white/72">
              The record loaded successfully, but it does not include the full report structure required by the
              current analysis workspace. Re-stage the dataset from Uploads or inspect the archived copy from History.
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