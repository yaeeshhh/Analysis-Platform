"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import AnalysisResultPopup from "@/components/history/AnalysisResultPopup";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import {
  deleteAnalysis,
  deleteMlExperiment,
  downloadAnalysisReport,
  downloadMlExperimentReport,
  downloadMlExperimentSummary,
  getAnalysisById,
  getAnalyses,
  runSupervisedAnalysis,
  runUnsupervisedAnalysis,
} from "@/lib/analysisApi";
import { AnalysisListItem, AnalysisReport } from "@/lib/analysisTypes";
import {
  ANALYSES_UPDATED_EVENT,
  clearCurrentAnalysisSelection,
  getCurrentAnalysisSelection,
  isAnalysisStateStorageEvent,
  notifyAnalysesChanged,
} from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";

type ReadinessFilter = "all" | "ml-ready" | "eda-first";
type MlFilter = "all" | "with-ml" | "without-ml";

export default function HistoryPage() {
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [mlFilter, setMlFilter] = useState<MlFilter>("all");
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [popupAnalysisId, setPopupAnalysisId] = useState<number | null>(null);
  const [popupSavedAt, setPopupSavedAt] = useState<string | undefined>(undefined);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupError, setPopupError] = useState("");
  const [popupReport, setPopupReport] = useState<AnalysisReport | null>(null);

  useApplyNavigationScroll("/history", !loading);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);
      setError("");

      const user = await resolveAuthenticatedUser();
      if (!active) return;
      if (!user) {
        setAnalyses([]);
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      setLoginRequired(false);

      try {
        setAnalyses(await getAnalyses());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load history.");
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

    const handleAnalysesChanged = () => {
      if (!active) return;
      void refreshHistoryList();
    };

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(ANALYSES_UPDATED_EVENT, handleAnalysesChanged);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(ANALYSES_UPDATED_EVENT, handleAnalysesChanged);
    };
  }, []);

  useEffect(() => {
    if ((!deleteTargetId && !popupAnalysisId) || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteTargetId, popupAnalysisId]);

  const filteredAnalyses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return analyses.filter((analysis) => {
      if (readinessFilter === "ml-ready" && !analysis.insights.modeling_readiness.is_ready) {
        return false;
      }

      if (readinessFilter === "eda-first" && analysis.insights.modeling_readiness.is_ready) {
        return false;
      }

      if (mlFilter === "with-ml" && analysis.experiment_count === 0) {
        return false;
      }

      if (mlFilter === "without-ml" && analysis.experiment_count > 0) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        analysis.overview.dataset_name,
        analysis.source_filename,
        analysis.insights.summary,
        analysis.status,
        analysis.latest_experiment?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [analyses, mlFilter, readinessFilter, searchQuery]);

  const latestRun = analyses[0] ?? null;
  const stats = [
    {
      label: "Saved runs",
      value: analyses.length.toLocaleString(),
      hint: latestRun ? latestRun.overview.dataset_name : "No history yet",
    },
    {
      label: "Filtered view",
      value: filteredAnalyses.length.toLocaleString(),
      hint:
        searchQuery.trim() || readinessFilter !== "all" || mlFilter !== "all"
          ? "After search and filters"
          : "All saved runs visible",
    },
    {
      label: "Runs with ML",
      value: analyses.filter((analysis) => analysis.experiment_count > 0).length.toLocaleString(),
      hint: "Saved experiment history attached",
    },
  ];

  async function refreshHistoryList() {
    const items = await getAnalyses();
    setAnalyses(items);
    return items;
  }

  async function refreshPopupReport(analysisId: number) {
    const [reportPayload] = await Promise.all([getAnalysisById(analysisId), refreshHistoryList()]);
    setPopupReport(reportPayload);
    return reportPayload;
  }

  async function handleDeleteAnalysis() {
    if (!deleteTargetId) return;

    try {
      setDeleteBusy(true);
      setError("");
      setNotice("");
      await deleteAnalysis(deleteTargetId);

      if (getCurrentAnalysisSelection() === deleteTargetId) {
        clearCurrentAnalysisSelection();
      }

      setAnalyses((current) => current.filter((item) => item.id !== deleteTargetId));
      notifyAnalysesChanged();
      setDeleteTargetId(null);
      setNotice("Saved run deleted. If it was open in Analysis, the active dataset selection was cleared.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete the saved run.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleOpenAnalysisPopup(analysis: AnalysisListItem) {
    try {
      setPopupAnalysisId(analysis.id);
      setPopupSavedAt(analysis.saved_at);
      setPopupLoading(true);
      setPopupError("");
      setPopupReport(null);
      const payload = await getAnalysisById(analysis.id);
      setPopupReport(payload);
    } catch (requestError) {
      setPopupError(requestError instanceof Error ? requestError.message : "Failed to open the saved result popup.");
    } finally {
      setPopupLoading(false);
    }
  }

  function handleCloseAnalysisPopup() {
    setPopupAnalysisId(null);
    setPopupSavedAt(undefined);
    setPopupLoading(false);
    setPopupError("");
    setPopupReport(null);
  }

  return (
    <>
      <AppShell
        eyebrow="Analysis History"
        title="Search, reopen, download, and retire saved runs"
        description="History is the archive surface for saved datasets. Search it, filter it, download what you need, or open a run in a detached popup without replacing the app's current dataset selection."
        stats={stats}
      >
        {error ? (
          <div className="rounded-[24px] border border-[#ff8c8c]/30 bg-[#ff8c8c]/10 px-5 py-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-[24px] border border-[#224c37] bg-[#13241c] px-5 py-4 text-sm text-[#a5f5c7]">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-sm text-white/55">
            Loading history...
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-4">
            <HistoryMobileSections
              analyses={analyses}
              filteredAnalyses={filteredAnalyses}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              readinessFilter={readinessFilter}
              setReadinessFilter={setReadinessFilter}
              mlFilter={mlFilter}
              setMlFilter={setMlFilter}
              onOpenPopup={handleOpenAnalysisPopup}
              onDeleteRun={setDeleteTargetId}
              onDownloadReport={(id: number) => { void downloadAnalysisReport(id); }}
            />

            <details id="history-first-block" className="mobile-accordion tablet-up route-scroll-target">
              <summary>
                <div className="min-w-0">
                  <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Archive search</span>
                  <p className="mobile-accordion-hint">Search and filter saved runs by name, readiness, or ML status</p>
                </div>
              </summary>
              <div className="mobile-accordion-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-3xl text-sm leading-6 text-white/64">
                  Find an older run by dataset name or summary, then narrow the list by modeling readiness or whether ML experiments were saved with it.
                </p>
                <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
                  {filteredAnalyses.length} of {analyses.length} run{analyses.length === 1 ? "" : "s"} shown
                </div>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
                <label className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Search runs</p>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by dataset, summary, or status"
                    className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </label>

                <label className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Readiness</p>
                  <select
                    value={readinessFilter}
                    onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
                    className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
                  >
                    <option value="all" className="bg-[#08131e] text-white">All runs</option>
                    <option value="ml-ready" className="bg-[#08131e] text-white">ML-ready only</option>
                    <option value="eda-first" className="bg-[#08131e] text-white">EDA-first only</option>
                  </select>
                </label>

                <label className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">ML history</p>
                  <select
                    value={mlFilter}
                    onChange={(event) => setMlFilter(event.target.value as MlFilter)}
                    className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
                  >
                    <option value="all" className="bg-[#08131e] text-white">All runs</option>
                    <option value="with-ml" className="bg-[#08131e] text-white">With ML runs</option>
                    <option value="without-ml" className="bg-[#08131e] text-white">Without ML runs</option>
                  </select>
                </label>
              </div>
            </div>
            </details>

            {filteredAnalyses.map((analysis) => (
              <details key={analysis.id} className="mobile-accordion tablet-up">
                <summary>
                  <div className="min-w-0">
                    <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Run #{analysis.id} — {analysis.overview.dataset_name}</span>
                    <p className="mobile-accordion-hint">Summary, dates, and actions for this saved analysis run</p>
                  </div>
                </summary>
                <div className="mobile-accordion-body">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <h2 className="mt-2 break-words font-[family:var(--font-display)] text-2xl text-white">
                        {analysis.overview.dataset_name}
                      </h2>
                      <p className="mt-1 text-sm text-white/44">Saved {formatDate(analysis.saved_at)}</p>
                      <p className="mt-3 max-w-4xl text-sm leading-6 text-white/68">{analysis.insights.summary}</p>
                    </div>

                    <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[520px] xl:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenAnalysisPopup(analysis);
                      }}
                      className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]"
                    >
                      Open saved run
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void downloadAnalysisReport(analysis.id);
                      }}
                      className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82"
                    >
                      Download report
                    </button>
                    {analysis.latest_experiment ? (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadMlExperimentReport(analysis.id, analysis.latest_experiment!);
                        }}
                        className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82"
                      >
                        Download latest ML report
                      </button>
                    ) : (
                      <div className="rounded-full border border-dashed border-white/12 px-5 py-3 text-center text-sm text-white/40">
                        No ML report saved
                      </div>
                    )}
                    {analysis.latest_experiment ? (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadMlExperimentSummary(analysis.id, analysis.latest_experiment!);
                        }}
                        className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82"
                      >
                        Download latest ML summary
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(analysis.id)}
                        className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-medium text-[#ffb4ba]"
                      >
                        Delete saved run
                      </button>
                    )}
                    {analysis.latest_experiment ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(analysis.id)}
                        className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-medium text-[#ffb4ba] sm:col-span-2"
                      >
                        Delete saved run
                      </button>
                    ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Rows</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{analysis.overview.row_count.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Columns</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{analysis.overview.column_count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Status</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{analysis.status}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">Readiness</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {analysis.insights.modeling_readiness.is_ready ? "ML" : "EDA"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">ML experiments</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{analysis.experiment_count}</p>
                  </div>
                  </div>

                {analysis.latest_experiment ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-white/68">
                    <p className="text-xs uppercase tracking-[0.16em] text-white/42">Latest ML run</p>
                    <p className="mt-2">{analysis.latest_experiment.summary}</p>
                  </div>
                ) : null}
                </div>
              </details>
            ))}

            {analyses.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/48">
                No analysis history yet. The page stays empty until the first dataset is uploaded from Uploads, then saved runs and ML downloads appear here.
              </div>
            ) : null}

            {analyses.length > 0 && filteredAnalyses.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/48">
                No saved runs matched the current search and filters. Adjust the query, readiness, or ML filter to widen the list.
              </div>
            ) : null}
          </section>
        ) : null}
      </AppShell>

      <AnalysisResultPopup
        open={popupAnalysisId !== null}
        loading={popupLoading}
        error={popupError}
        report={popupReport}
        savedAt={popupSavedAt}
        onClose={handleCloseAnalysisPopup}
        onDownloadReport={() => {
          if (!popupAnalysisId) return;
          void downloadAnalysisReport(popupAnalysisId);
        }}
        onRunUnsupervised={async (nClusters) => {
          if (!popupAnalysisId) {
            throw new Error("No saved run is open in the history popup.");
          }

          const result = await runUnsupervisedAnalysis(popupAnalysisId, nClusters);
          await refreshPopupReport(popupAnalysisId);
          return result;
        }}
        onRunSupervised={async (targetColumn) => {
          if (!popupAnalysisId) {
            throw new Error("No saved run is open in the history popup.");
          }

          const result = await runSupervisedAnalysis(popupAnalysisId, targetColumn);
          await refreshPopupReport(popupAnalysisId);
          return result;
        }}
        onDeleteExperiment={async (experiment) => {
          if (!popupAnalysisId) {
            throw new Error("No saved run is open in the history popup.");
          }

          await deleteMlExperiment(popupAnalysisId, experiment);
          await refreshPopupReport(popupAnalysisId);
          notifyAnalysesChanged();
        }}
      />

      {deleteTargetId ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-4 backdrop-blur-md" onMouseDown={() => setDeleteTargetId(null)}>
          <div
            className="w-full max-w-lg rounded-[28px] border border-[#5a2328] bg-[#111821]/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb4ba]">Delete run</p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-white">Delete this saved analysis?</h2>
            <p className="mt-3 text-sm leading-6 text-white/66">
              This removes the dataset, its saved report, and any attached ML experiment files. If this run was the app&apos;s current dataset selection, that selection will also be cleared.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/82"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteAnalysis();
                }}
                disabled={deleteBusy}
                className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {deleteBusy ? "Deleting..." : "Delete saved run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LoginRequiredModal
        open={loginRequired}
        title="Login required"
        message="Log in to review saved analysis history."
        loginHref="/login?redirect=/history"
        onDismiss={() => setLoginRequired(false)}
        onLoginSuccess={() => setLoginRequired(false)}
      />
    </>
  );
}

/* ────────────────── Phone-only slide sections ────────────────── */

type HistoryMobileSectionsProps = {
  analyses: AnalysisListItem[];
  filteredAnalyses: AnalysisListItem[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  readinessFilter: ReadinessFilter;
  setReadinessFilter: (v: ReadinessFilter) => void;
  mlFilter: MlFilter;
  setMlFilter: (v: MlFilter) => void;
  onOpenPopup: (a: AnalysisListItem) => void;
  onDeleteRun: (id: number) => void;
  onDownloadReport: (id: number) => void;
};

function HistoryMobileSections({
  analyses,
  filteredAnalyses,
  searchQuery,
  setSearchQuery,
  readinessFilter,
  setReadinessFilter,
  mlFilter,
  setMlFilter,
  onOpenPopup,
  onDeleteRun,
  onDownloadReport,
}: HistoryMobileSectionsProps) {
  const searchSection: MobileSection = {
    id: "history-search",
    title: "Search & filters",
    hint: `${filteredAnalyses.length} of ${analyses.length} runs shown`,
    accent: "#7ad6ff",
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-6 text-white/64">
          Find an older run by dataset name or summary, then narrow the list by readiness or ML status.
        </p>

        <label className="block rounded-2xl border border-white/10 bg-black/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-white/42">Search runs</p>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by dataset, summary, or status"
            className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>

        <label className="block rounded-2xl border border-white/10 bg-black/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-white/42">Readiness</p>
          <select
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value as ReadinessFilter)}
            className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
          >
            <option value="all">All runs</option>
            <option value="ml-ready">ML-ready only</option>
            <option value="eda-first">EDA-first only</option>
          </select>
        </label>

        <label className="block rounded-2xl border border-white/10 bg-black/10 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-white/42">ML history</p>
          <select
            value={mlFilter}
            onChange={(e) => setMlFilter(e.target.value as MlFilter)}
            className="mt-2 w-full rounded-full border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
          >
            <option value="all">All runs</option>
            <option value="with-ml">With ML runs</option>
            <option value="without-ml">Without ML runs</option>
          </select>
        </label>
      </div>
    ),
  };

  const runSections: MobileSection[] = filteredAnalyses.map((a) => ({
    id: `history-run-${a.id}`,
    title: a.overview.dataset_name,
    hint: `${formatDate(a.saved_at)} · ${a.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"} · ${a.experiment_count} ML`,
    accent: a.insights.modeling_readiness.is_ready ? "#5ae681" : "#ffb079",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-white/44">Saved {formatDate(a.saved_at)}</p>
        <p className="text-sm leading-6 text-white/68">{a.insights.summary}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/42">Rows</p>
            <p className="mt-1 text-lg font-semibold text-white">{a.overview.row_count.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/42">Columns</p>
            <p className="mt-1 text-lg font-semibold text-white">{a.overview.column_count}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/42">Status</p>
            <p className="mt-1 text-lg font-semibold text-white">{a.status}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/42">ML runs</p>
            <p className="mt-1 text-lg font-semibold text-white">{a.experiment_count}</p>
          </div>
        </div>

        {a.latest_experiment ? (
          <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-white/68">
            <p className="text-[0.65rem] uppercase tracking-wider text-white/42">Latest ML run</p>
            <p className="mt-1">{a.latest_experiment.summary}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenPopup(a)}
            className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]"
          >
            Open saved run
          </button>
          <button
            type="button"
            onClick={() => onDownloadReport(a.id)}
            className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82"
          >
            Download report
          </button>
          <button
            type="button"
            onClick={() => onDeleteRun(a.id)}
            className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-medium text-[#ffb4ba]"
          >
            Delete saved run
          </button>
        </div>
      </div>
    ),
  }));

  if (analyses.length === 0) {
    return (
      <div className="phone-only rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/48">
        No analysis history yet.
      </div>
    );
  }

  return <MobileSectionList sections={[searchSection, ...runSections]} />;
}