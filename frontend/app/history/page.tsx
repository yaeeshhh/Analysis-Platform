"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import AnalysisResultPopup from "@/components/history/AnalysisResultPopup";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import SurfaceLoadingIndicator from "@/components/ui/SurfaceLoadingIndicator";
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
  clearCurrentAnalysisSelection,
  getCurrentAnalysisSelection,
  notifyAnalysesChanged,
  subscribeToAnalysisStateChanges,
} from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { resolveAuthenticatedUser } from "@/lib/session";

type ReadinessFilter = "all" | "ml-ready" | "eda-first";
type MlFilter = "all" | "with-ml" | "without-ml";

function getHistoryReviewWarning(targetCandidates: string[]) {
  const highlightedTargets = targetCandidates.slice(0, 2);

  if (highlightedTargets.length > 0) {
    return `Potential targets like ${highlightedTargets.join(", ")} are available, but review this dataset before relying on ML output. You can still run it if needed.`;
  }

  return "Review this dataset before relying on ML output. You can still run it if needed.";
}

function truncateHistorySummary(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

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

      const [user, prefetchedAnalyses] = await Promise.all([
        resolveAuthenticatedUser(),
        getAnalyses().catch(() => null as AnalysisListItem[] | null),
      ]);
      if (!active) return;
      if (!user) {
        setAnalyses([]);
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      setLoginRequired(false);

      try {
        setAnalyses(prefetchedAnalyses ?? await getAnalyses());
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

    const unsubscribeAnalysisState = subscribeToAnalysisStateChanges(() => {
      if (!active) return;
      void refreshHistoryList();
    });

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      unsubscribeAnalysisState();
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
  const runsWithMl = analyses.filter((analysis) => analysis.experiment_count > 0).length;
  const hasHistoryFilters = Boolean(searchQuery.trim() || readinessFilter !== "all" || mlFilter !== "all");
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
      value: runsWithMl.toLocaleString(),
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
        eyebrow="Saved runs"
        title="History"
        description="Search, reopen, download, and delete saved runs."
        mobileDescription="Search, reopen, and manage saved runs."
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
          <div className="py-10">
            <SurfaceLoadingIndicator label="Loading history..." className="mx-auto" />
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-4">
            <HistoryMobileSections
              key={`${searchQuery}|${readinessFilter}|${mlFilter}`}
              filteredAnalyses={filteredAnalyses}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              readinessFilter={readinessFilter}
              setReadinessFilter={setReadinessFilter}
              mlFilter={mlFilter}
              setMlFilter={setMlFilter}
              hasHistoryFilters={hasHistoryFilters}
              clearFilters={() => {
                setSearchQuery("");
                setReadinessFilter("all");
                setMlFilter("all");
              }}
              onOpenPopup={handleOpenAnalysisPopup}
              onDeleteRun={setDeleteTargetId}
              onDownloadReport={(id: number) => { void downloadAnalysisReport(id); }}
              onDownloadMlReport={(id, experiment) => { if (experiment) void downloadMlExperimentReport(id, experiment); }}
              onDownloadMlSummary={(id, experiment) => { if (experiment) void downloadMlExperimentSummary(id, experiment); }}
            />

            <div id="history-first-block" className="tablet-up route-scroll-target desktop-page-stack">
              <section className="desktop-toolbar">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by dataset, file, summary, or status"
                  className="desktop-search-input"
                />

                <select
                  value={readinessFilter}
                  onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
                  className="desktop-select"
                >
                  <option value="all">All readiness</option>
                  <option value="ml-ready">ML-ready only</option>
                  <option value="eda-first">Review first only</option>
                </select>

                <select
                  value={mlFilter}
                  onChange={(event) => setMlFilter(event.target.value as MlFilter)}
                  className="desktop-select"
                >
                  <option value="all">All ML history</option>
                  <option value="with-ml">With ML runs</option>
                  <option value="without-ml">Without ML runs</option>
                </select>

                {hasHistoryFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setReadinessFilter("all");
                      setMlFilter("all");
                    }}
                    className="desktop-filter-pill text-white/82"
                  >
                    Clear filters
                  </button>
                ) : null}
              </section>

              <section className="desktop-panel section-glow">
                <div className="desktop-panel-header">
                  <div>
                    <p className="desktop-panel-title">Saved runs</p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/46">
                      Search the archive, reopen saved datasets in place, download reports, or retire older runs without replacing the current workspace selection.
                    </p>
                  </div>
                  <span className="desktop-badge" data-tone={runsWithMl ? "purple" : "amber"}>
                    <span className="desktop-status-dot" />
                    {runsWithMl} run{runsWithMl === 1 ? "" : "s"} with ML
                  </span>
                </div>

                {filteredAnalyses.length > 0 ? (
                  <div className="desktop-data-table-wrap desktop-history-table-wrap">
                    <table className="desktop-data-table desktop-history-table">
                      <colgroup>
                        <col className="desktop-history-table-col-run" />
                        <col className="desktop-history-table-col-mode" />
                        <col className="desktop-history-table-col-readiness" />
                        <col className="desktop-history-table-col-status" />
                        <col className="desktop-history-table-col-saved" />
                        <col className="desktop-history-table-col-actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Run</th>
                          <th>Mode</th>
                          <th>Readiness</th>
                          <th>Status</th>
                          <th>Saved</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAnalyses.map((analysis) => {
                          const modeLabel = analysis.latest_experiment
                            ? analysis.latest_experiment.type === "supervised"
                              ? "Supervised ML"
                              : "Unsupervised ML"
                            : "Analysis only";
                          const modeTone = analysis.latest_experiment ? "purple" : "teal";
                          const readinessTone = analysis.insights.modeling_readiness.is_ready ? "teal" : "amber";
                          const needsReview = !analysis.insights.modeling_readiness.is_ready;
                          const reviewWarning = needsReview
                            ? getHistoryReviewWarning(analysis.insights.modeling_readiness.target_candidates)
                            : "";
                          const statusValue = analysis.status || "saved";
                          const statusTone = statusValue.toLowerCase().includes("error")
                            ? "red"
                            : analysis.experiment_count > 0
                              ? "purple"
                              : "teal";

                          return (
                            <tr key={analysis.id}>
                              <td>
                                <div>
                                  <div>{analysis.overview.dataset_name}</div>
                                  <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/28">
                                    {analysis.source_filename}
                                  </div>
                                  <div className="mt-2 max-w-md text-[0.74rem] leading-5 text-white/38">
                                    {analysis.insights.summary}
                                  </div>
                                </div>
                              </td>
                              <td className="desktop-history-metric-cell">
                                <div className="desktop-history-metric">
                                  <span className="desktop-badge" data-tone={modeTone}>
                                    <span className="desktop-status-dot" />
                                    {modeLabel}
                                  </span>
                                  <div className="desktop-history-metric-note">
                                    {analysis.latest_experiment?.summary || "No ML experiment saved for this run."}
                                  </div>
                                </div>
                              </td>
                              <td className="desktop-history-metric-cell">
                                <div className="desktop-history-metric">
                                  <span className="desktop-badge" data-tone={readinessTone}>
                                    <span className="desktop-status-dot" />
                                    {analysis.insights.modeling_readiness.is_ready ? "ML-ready" : "Review first"}
                                  </span>
                                  <div className="desktop-history-metric-note">
                                    {analysis.experiment_count} ML experiment{analysis.experiment_count === 1 ? "" : "s"}
                                  </div>
                                  {needsReview ? (
                                    <div className="inline-warning-note mt-2">
                                      <p className="inline-warning-note-title">Review advised</p>
                                      <p className="inline-warning-note-copy">{reviewWarning}</p>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="desktop-history-metric-cell">
                                <div className="desktop-history-metric">
                                  <span className="desktop-badge" data-tone={statusTone}>
                                    <span className="desktop-status-dot" />
                                    {statusValue}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="text-sm text-white/72">{formatDate(analysis.saved_at)}</div>
                                <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/24">
                                  {analysis.overview.row_count.toLocaleString()} rows · {analysis.overview.column_count} cols
                                </div>
                              </td>
                              <td className="desktop-history-actions-cell">
                                <div className="desktop-action-row desktop-history-actions">
                                  <button
                                    type="button"
                                    onClick={() => { void handleOpenAnalysisPopup(analysis); }}
                                    className="desktop-action-button desktop-action-button-primary rounded-md border border-[#7c3aed]/35 px-3 py-1.5 text-[0.72rem] text-[#d8c3ff]"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void downloadAnalysisReport(analysis.id); }}
                                    className="desktop-action-button rounded-md border border-white/10 px-3 py-1.5 text-[0.72rem] text-white/70"
                                  >
                                    Report
                                  </button>
                                  {analysis.latest_experiment ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => { void downloadMlExperimentReport(analysis.id, analysis.latest_experiment!); }}
                                        className="desktop-action-button rounded-md border border-white/10 px-3 py-1.5 text-[0.72rem] text-white/70"
                                      >
                                        ML report
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { void downloadMlExperimentSummary(analysis.id, analysis.latest_experiment!); }}
                                        className="desktop-action-button rounded-md border border-white/10 px-3 py-1.5 text-[0.72rem] text-white/70"
                                      >
                                        ML summary
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTargetId(analysis.id)}
                                    className={`desktop-action-button rounded-md border border-[#5a2328]/60 px-3 py-1.5 text-[0.72rem] text-[#ffb4ba] ${analysis.latest_experiment ? "desktop-action-button-wide" : ""}`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="desktop-empty-panel !min-h-[18rem]">
                    <div className="desktop-empty-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 8v4l3 3" />
                      </svg>
                    </div>
                    <p className="desktop-section-title text-[1.15rem]">
                      {analyses.length === 0 ? "No saved runs yet" : "No runs match the current filters"}
                    </p>
                    <p className="desktop-section-text max-w-md">
                      {analyses.length === 0
                        ? "Upload a dataset from Uploads to create the first saved analysis run in the archive."
                        : "Adjust the search text or the readiness and ML filters to bring matching runs back into view."}
                    </p>
                  </div>
                )}
              </section>
            </div>
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
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-5 backdrop-blur-md" onMouseDown={() => setDeleteTargetId(null)}>
          <div
            className="w-full max-w-lg rounded-xl border border-[#5a2328]/60 bg-[#111821]/95 p-5"
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
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {deleteBusy ? (
                  <>
                    <span className="button-live-loader" aria-hidden="true" />
                    Deleting...
                  </>
                ) : "Delete saved run"}
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
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  readinessFilter: ReadinessFilter;
  setReadinessFilter: (value: ReadinessFilter) => void;
  mlFilter: MlFilter;
  setMlFilter: (value: MlFilter) => void;
  hasHistoryFilters: boolean;
  clearFilters: () => void;
  onOpenPopup: (a: AnalysisListItem) => void;
  onDeleteRun: (id: number) => void;
  onDownloadReport: (id: number) => void;
  onDownloadMlReport: (analysisId: number, experiment: AnalysisListItem["latest_experiment"]) => void;
  onDownloadMlSummary: (analysisId: number, experiment: AnalysisListItem["latest_experiment"]) => void;
};

function HistoryMobileSections({
  filteredAnalyses,
  searchQuery,
  setSearchQuery,
  readinessFilter,
  setReadinessFilter,
  mlFilter,
  setMlFilter,
  hasHistoryFilters,
  clearFilters,
  onOpenPopup,
  onDeleteRun,
  onDownloadReport,
  onDownloadMlReport,
  onDownloadMlSummary,
}: HistoryMobileSectionsProps) {
  const [visibleCount, setVisibleCount] = useState(5);

  return (
    <div className="phone-only mobile-screen-stack">
      {/* ── Hero panel ── */}
      <section className="mobile-screen-panel section-glow" style={{ overflow: "hidden" }}>
        {/* Motif — topology network */}
        <svg viewBox="0 0 300 100" style={{ position: "absolute", top: 0, right: 0, width: 180, height: 60, opacity: 0.10, pointerEvents: "none" }} aria-hidden="true">
          <circle cx="40" cy="30" r="3" fill="#14b8a6"/><circle cx="100" cy="20" r="3" fill="#14b8a6"/>
          <circle cx="160" cy="50" r="3" fill="#14b8a6"/><circle cx="220" cy="25" r="3" fill="#14b8a6"/>
          <circle cx="260" cy="60" r="3" fill="#14b8a6"/><circle cx="70" cy="70" r="3" fill="#14b8a6"/>
          <circle cx="190" cy="80" r="3" fill="#14b8a6"/>
          <line x1="40" y1="30" x2="100" y2="20" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="100" y1="20" x2="160" y2="50" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="160" y1="50" x2="220" y2="25" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="220" y1="25" x2="260" y2="60" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="40" y1="30" x2="70" y2="70" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="70" y1="70" x2="160" y2="50" stroke="#14b8a6" strokeWidth="1"/>
          <line x1="160" y1="50" x2="190" y2="80" stroke="#14b8a6" strokeWidth="1"/>
        </svg>
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Saved runs</p>
            <h2 className="mobile-screen-title">Past analyses</h2>
            <p className="mobile-screen-lead">Search, filter, and revisit every dataset run.</p>
          </div>
        </div>
      </section>

      {/* ── Compact search bar ── */}
      <div className="mobile-history-search-bar">
        <svg className="mobile-history-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search runs…"
          className="mobile-history-search-input"
        />
      </div>

      {/* ── Filter dropdowns ── */}
      <div className="mobile-history-filter-row">
        <select
          value={readinessFilter}
          onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
          className="mobile-history-filter-select"
        >
          <option value="all">All readiness</option>
          <option value="ml-ready">ML-ready</option>
          <option value="eda-first">Review first</option>
        </select>
        <select
          value={mlFilter}
          onChange={(event) => setMlFilter(event.target.value as MlFilter)}
          className="mobile-history-filter-select"
        >
          <option value="all">Any ML</option>
          <option value="with-ml">Has ML</option>
          <option value="without-ml">No ML</option>
        </select>
        {hasHistoryFilters ? (
          <button type="button" onClick={clearFilters} className="mobile-history-filter-clear">
            ✕
          </button>
        ) : null}
      </div>

      {/* ── Run list ── */}
      {filteredAnalyses.length === 0 ? (
        <div className="mobile-history-empty">
          <p className="mobile-history-empty-title">No matching runs</p>
          <p className="mobile-history-empty-copy">Try a different search or adjust the filters above.</p>
        </div>
      ) : (
        <div className="mobile-history-run-list">
          {filteredAnalyses.slice(0, visibleCount).map((analysis) => {
            const latestExperiment = analysis.latest_experiment;
            const isReady = analysis.insights.modeling_readiness.is_ready;
            const needsReview = !isReady;
            const reviewWarning = needsReview
              ? getHistoryReviewWarning(analysis.insights.modeling_readiness.target_candidates)
              : "";

            return (
              <details key={analysis.id} className="mobile-history-card">
                <summary className="mobile-history-card-summary">
                  <span className="mobile-history-card-accent" data-tone={isReady ? "teal" : "amber"} />
                  <div className="mobile-history-card-body">
                    <div className="mobile-history-card-top">
                      <h3 className="mobile-history-card-name">{analysis.overview.dataset_name}</h3>
                      <span className="mobile-history-card-date">{formatDate(analysis.saved_at)}</span>
                    </div>
                    <p className="mobile-history-card-file">{analysis.source_filename}</p>
                    <p className="mobile-history-card-snippet">{truncateHistorySummary(analysis.insights.summary, 120)}</p>
                    <div className="mobile-history-card-tags">
                      <span className="mobile-history-tag">{analysis.overview.row_count.toLocaleString()} × {analysis.overview.column_count}</span>
                      <span className="mobile-history-tag" data-tone={isReady ? "teal" : "amber"}>{isReady ? "ML-ready" : "Review first"}</span>
                      {analysis.experiment_count > 0 ? (
                        <span className="mobile-history-tag" data-tone="purple">{analysis.experiment_count} ML</span>
                      ) : null}
                    </div>
                  </div>
                </summary>

                <div className="mobile-history-card-detail">
                  <p className="mobile-history-card-full-summary">{analysis.insights.summary}</p>

                  {needsReview ? (
                    <div className="mobile-history-card-warning">
                      <span className="mobile-history-card-warning-label">Review advised</span>
                      <span className="mobile-history-card-warning-copy">{reviewWarning}</span>
                    </div>
                  ) : null}

                  {latestExperiment ? (
                    <p className="mobile-history-card-ml-note">Latest ML: {latestExperiment.summary}</p>
                  ) : null}

                  <div className="mobile-history-card-actions">
                    <button type="button" onClick={() => onOpenPopup(analysis)} className="mobile-history-action-btn mobile-history-action-primary">
                      Open run
                    </button>
                    <button type="button" onClick={() => onDownloadReport(analysis.id)} className="mobile-history-action-btn">
                      Report
                    </button>
                    {latestExperiment ? (
                      <>
                        <button type="button" onClick={() => onDownloadMlReport(analysis.id, latestExperiment)} className="mobile-history-action-btn">
                          ML report
                        </button>
                        <button type="button" onClick={() => onDownloadMlSummary(analysis.id, latestExperiment)} className="mobile-history-action-btn">
                          ML summary
                        </button>
                      </>
                    ) : null}
                    <button type="button" onClick={() => onDeleteRun(analysis.id)} className="mobile-history-action-btn mobile-history-action-danger">
                      Delete
                    </button>
                    <button
                      type="button"
                      className="mobile-history-action-btn"
                      onClick={(e) => {
                        const details = e.currentTarget.closest("details");
                        if (details) details.open = false;
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {visibleCount < filteredAnalyses.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + 5)}
          className="mobile-history-load-more"
        >
          Show more ({filteredAnalyses.length - visibleCount} remaining)
        </button>
      ) : null}
    </div>
  );
}