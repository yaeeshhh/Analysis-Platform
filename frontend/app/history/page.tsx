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
          <div className="border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="border-l-2 border-[#5ae681]/30 pl-4 text-sm text-[#a5f5c7]">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-white/55">
            Loading history...
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-4">
            {/* Phone: inline stats + search + section list */}
            <div className="phone-only space-y-3">
              <div className="mobile-inline-stats">
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{analyses.length}</span>
                  <span className="mobile-inline-stat-label">Total runs</span>
                </div>
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{filteredAnalyses.length}</span>
                  <span className="mobile-inline-stat-label">Filtered</span>
                </div>
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{analyses.filter(a => a.experiment_count > 0).length}</span>
                  <span className="mobile-inline-stat-label">With ML</span>
                </div>
              </div>

              {/* Inline search on phone */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search runs..."
                className="w-full rounded-lg border border-white/12 bg-[#08131e] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
              />

              {/* Compact inline filters */}
              <div className="flex gap-2">
                <select
                  value={readinessFilter}
                  onChange={(e) => setReadinessFilter(e.target.value as ReadinessFilter)}
                  className="flex-1 rounded-lg border border-white/12 bg-[#08131e] px-2 py-2 text-xs text-white outline-none [color-scheme:dark]"
                >
                  <option value="all">All readiness</option>
                  <option value="ml-ready">ML-ready</option>
                  <option value="eda-first">EDA-first</option>
                </select>
                <select
                  value={mlFilter}
                  onChange={(e) => setMlFilter(e.target.value as MlFilter)}
                  className="flex-1 rounded-lg border border-white/12 bg-[#08131e] px-2 py-2 text-xs text-white outline-none [color-scheme:dark]"
                >
                  <option value="all">All ML</option>
                  <option value="with-ml">With ML</option>
                  <option value="without-ml">No ML</option>
                </select>
              </div>

              {/* Most recent run card */}
              {filteredAnalyses[0] ? (
                <div className="border-b border-white/6 pb-3">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/42">Most recent</p>
                  <p className="mt-1 font-medium text-white">{filteredAnalyses[0].overview.dataset_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="info-chip">{filteredAnalyses[0].overview.row_count?.toLocaleString() ?? "—"} rows</span>
                    <span className="info-chip">{filteredAnalyses[0].overview.column_count ?? "—"} cols</span>
                    {filteredAnalyses[0].experiment_count > 0 && (
                      <span className="info-chip"><span className="pulse-dot" />{filteredAnalyses[0].experiment_count} ML</span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <HistoryMobileSections
              filteredAnalyses={filteredAnalyses}
              onOpenPopup={handleOpenAnalysisPopup}
              onDeleteRun={setDeleteTargetId}
              onDownloadReport={(id: number) => { void downloadAnalysisReport(id); }}
            />

            <section id="history-first-block" className="flow-section tablet-up route-scroll-target section-glow">
              <div className="flex items-baseline justify-between gap-4">
                <p className="flow-section-label"><span className="pulse-dot mr-2" />Archive search</p>
                <span className="text-xs text-white/40">{filteredAnalyses.length} of {analyses.length} run{analyses.length === 1 ? "" : "s"}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/55">Find a run by dataset name or summary, then narrow by readiness or ML status.</p>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
                <label className="block">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Search runs</p>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by dataset, summary, or status"
                    className="mt-2 w-full rounded-lg border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                  />
                </label>

                <label className="block">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Readiness</p>
                  <select
                    value={readinessFilter}
                    onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
                    className="mt-2 w-full rounded-lg border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
                  >
                    <option value="all" className="bg-[#08131e] text-white">All runs</option>
                    <option value="ml-ready" className="bg-[#08131e] text-white">ML-ready only</option>
                    <option value="eda-first" className="bg-[#08131e] text-white">EDA-first only</option>
                  </select>
                </label>

                <label className="block">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">ML history</p>
                  <select
                    value={mlFilter}
                    onChange={(event) => setMlFilter(event.target.value as MlFilter)}
                    className="mt-2 w-full rounded-lg border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
                  >
                    <option value="all" className="bg-[#08131e] text-white">All runs</option>
                    <option value="with-ml" className="bg-[#08131e] text-white">With ML runs</option>
                    <option value="without-ml" className="bg-[#08131e] text-white">Without ML runs</option>
                  </select>
                </label>
              </div>
            </section>

            {filteredAnalyses.map((analysis) => (
              <section key={analysis.id} className="flow-section tablet-up">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="flow-section-label">Run #{analysis.id}</p>
                    <p className="mt-1 font-[family:var(--font-display)] text-xl font-bold text-white">
                      {analysis.overview.dataset_name}
                    </p>
                    <p className="mt-1 text-xs text-white/40">Saved {formatDate(analysis.saved_at)}</p>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">{analysis.insights.summary}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:w-auto xl:shrink-0">
                    <button
                      type="button"
                      onClick={() => { void handleOpenAnalysisPopup(analysis); }}
                      className="rounded-lg bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b]"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => { void downloadAnalysisReport(analysis.id); }}
                      className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70"
                    >
                      Report
                    </button>
                    {analysis.latest_experiment ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { void downloadMlExperimentReport(analysis.id, analysis.latest_experiment!); }}
                          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70"
                        >
                          ML report
                        </button>
                        <button
                          type="button"
                          onClick={() => { void downloadMlExperimentSummary(analysis.id, analysis.latest_experiment!); }}
                          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70"
                        >
                          ML summary
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(analysis.id)}
                      className="rounded-lg border border-[#5a2328]/60 px-4 py-2.5 text-sm font-medium text-[#ffb4ba]"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="stat-row mt-3">
                  <div className="stat-row-item">
                    <p className="stat-row-value">{analysis.overview.row_count.toLocaleString()}</p>
                    <p className="stat-row-label">Rows</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{analysis.overview.column_count}</p>
                    <p className="stat-row-label">Columns</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{analysis.status}</p>
                    <p className="stat-row-label">Status</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{analysis.insights.modeling_readiness.is_ready ? "ML" : "EDA"}</p>
                    <p className="stat-row-label">Readiness</p>
                  </div>
                  <div className="stat-row-item">
                    <p className="stat-row-value">{analysis.experiment_count}</p>
                    <p className="stat-row-label">ML experiments</p>
                  </div>
                </div>

                {analysis.latest_experiment ? (
                  <p className="mt-2 text-sm text-white/50">
                    <span className="text-xs uppercase tracking-wider text-white/35">Latest ML:</span>{" "}
                    {analysis.latest_experiment.summary}
                  </p>
                ) : null}
              </section>
            ))}

            {analyses.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/40">
                No analysis history yet. Upload a dataset from the Uploads page to get started.
              </div>
            ) : null}

            {analyses.length > 0 && filteredAnalyses.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/40">
                No saved runs match the current filters. Adjust the search, readiness, or ML filter.
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
            className="w-full max-w-lg rounded-xl border border-[#5a2328]/60 bg-[#111821]/95 p-6"
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
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/82"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteAnalysis();
                }}
                disabled={deleteBusy}
                className="rounded-lg border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
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
  filteredAnalyses: AnalysisListItem[];
  onOpenPopup: (a: AnalysisListItem) => void;
  onDeleteRun: (id: number) => void;
  onDownloadReport: (id: number) => void;
};

function HistoryMobileSections({
  filteredAnalyses,
  onOpenPopup,
  onDeleteRun,
  onDownloadReport,
}: HistoryMobileSectionsProps) {
  const runSections: MobileSection[] = filteredAnalyses.map((a) => ({
    id: `history-run-${a.id}`,
    title: a.overview.dataset_name,
    hint: `${formatDate(a.saved_at)} · ${a.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"} · ${a.experiment_count} ML`,
    accent: a.insights.modeling_readiness.is_ready ? "#5ae681" : "#ffb079",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-white/40">Saved {formatDate(a.saved_at)}</p>
        <p className="text-sm leading-6 text-white/55">{a.insights.summary}</p>

        <div className="stat-row">
          <div className="stat-row-item">
            <p className="stat-row-value">{a.overview.row_count.toLocaleString()}</p>
            <p className="stat-row-label">Rows</p>
          </div>
          <div className="stat-row-item">
            <p className="stat-row-value">{a.overview.column_count}</p>
            <p className="stat-row-label">Columns</p>
          </div>
          <div className="stat-row-item">
            <p className="stat-row-value">{a.status}</p>
            <p className="stat-row-label">Status</p>
          </div>
          <div className="stat-row-item">
            <p className="stat-row-value">{a.experiment_count}</p>
            <p className="stat-row-label">ML runs</p>
          </div>
        </div>

        {a.latest_experiment ? (
          <p className="text-sm text-white/50">
            <span className="text-xs uppercase tracking-wider text-white/35">Latest ML:</span>{" "}
            {a.latest_experiment.summary}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenPopup(a)}
            className="rounded-lg bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]"
          >
            Open saved run
          </button>
          <button
            type="button"
            onClick={() => onDownloadReport(a.id)}
            className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white/70"
          >
            Download report
          </button>
          <button
            type="button"
            onClick={() => onDeleteRun(a.id)}
            className="rounded-lg border border-[#5a2328]/60 px-5 py-3 text-sm font-medium text-[#ffb4ba]"
          >
            Delete saved run
          </button>
        </div>
      </div>
    ),
  }));

  if (filteredAnalyses.length === 0) {
    return (
      <div className="phone-only py-4 text-center text-sm text-white/40">
        No runs match the current filters.
      </div>
    );
  }

  return <MobileSectionList sections={runSections} />;
}