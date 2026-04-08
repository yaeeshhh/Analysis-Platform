"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import {
  deleteAnalysis,
  downloadAnalysisReport,
  getAnalyses,
  uploadAnalysisCsv,
} from "@/lib/analysisApi";
import { type AnalysisListItem } from "@/lib/analysisTypes";
import {
  clearCurrentAnalysisSelection,
  getCurrentAnalysisSelection,
  notifyAnalysesChanged,
  subscribeToAnalysisStateChanges,
  setCurrentAnalysisSelection,
} from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { queueNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";

type ConfirmAction = "selected" | null;

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export default function BatchPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [resumeUploadAfterLogin, setResumeUploadAfterLogin] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  function clearSelectedUpload() {
    setSelectedFile(null);
    setResumeUploadAfterLogin(false);
    setNotice("Selected upload cleared.");
    setError("");
  }

  async function refreshAnalyses(preferredId?: number | null) {
    const items = await getAnalyses();
    setAnalyses(items);

    const nextSelected =
      typeof preferredId === "number" && items.some((item) => item.id === preferredId)
        ? preferredId
        : null;
    setSelectedAnalysisId(nextSelected);
  }

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
        setSelectedAnalysisId(null);
        setLoginRequired(false);
        setLoading(false);
        return;
      }

      setLoginRequired(false);

      try {
        const items = await getAnalyses();
        if (!active) return;

        setAnalyses(items);
        const currentAnalysisId = getCurrentAnalysisSelection();
        const nextSelected =
          currentAnalysisId && items.some((item) => item.id === currentAnalysisId)
            ? currentAnalysisId
            : null;

        if (currentAnalysisId && !nextSelected) {
          clearCurrentAnalysisSelection();
        }

        setSelectedAnalysisId(nextSelected);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load saved runs."
        );
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
      void refreshAnalyses(getCurrentAnalysisSelection());
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
    if (!confirmAction || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmAction]);

  const selectedAnalysis = useMemo(
    () => analyses.find((item) => item.id === selectedAnalysisId) ?? null,
    [analyses, selectedAnalysisId]
  );

  const highlightedAnalysis = selectedAnalysis ?? analyses[0] ?? null;
  const totalCells = selectedAnalysis
    ? Math.max(
        selectedAnalysis.overview.row_count * selectedAnalysis.overview.column_count,
        1
      )
    : 0;
  const completenessPct = selectedAnalysis
    ? Math.max(
        0,
        ((totalCells - selectedAnalysis.overview.total_missing_values) / totalCells) * 100
      )
    : 0;
  const uniquenessPct = selectedAnalysis
    ? Math.max(
        0,
        ((selectedAnalysis.overview.row_count -
          selectedAnalysis.overview.duplicate_row_count) /
          Math.max(selectedAnalysis.overview.row_count, 1)) *
          100
      )
    : 0;
  const readyRuns = analyses.filter(
    (item) => item.insights.modeling_readiness.is_ready
  ).length;

  const stats = [
    {
      label: "Saved runs",
      value: analyses.length.toLocaleString(),
      hint: `${readyRuns} ready for analysis`,
    },
    {
      label: "Missing values",
      value: highlightedAnalysis
        ? highlightedAnalysis.overview.total_missing_values.toLocaleString()
        : "0",
      hint: highlightedAnalysis
        ? highlightedAnalysis.overview.dataset_name
        : "Current selection pending",
    },
    {
      label: "Duplicates",
      value: highlightedAnalysis
        ? highlightedAnalysis.overview.duplicate_row_count.toLocaleString()
        : "0",
      hint: highlightedAnalysis
        ? `${highlightedAnalysis.experiment_count} saved ML experiment${highlightedAnalysis.experiment_count === 1 ? "" : "s"}`
        : "No dataset selected yet",
    },
  ];

  async function processSelectedFile(file: File) {
    try {
      setUploadBusy(true);
      setError("");
      setNotice("");

      const payload = await uploadAnalysisCsv(file);
      setCurrentAnalysisSelection(payload.analysis_id);
      notifyAnalysesChanged();
      await refreshAnalyses(payload.analysis_id);
      setSelectedFile(null);

      queueNavigationScroll(
        "/analysis",
        "analysis-workspace-navigation",
        undefined,
        true
      );
      router.push(`/analysis?analysisId=${payload.analysis_id}`, { scroll: false });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to analyze upload."
      );
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleUpload() {
    if (!selectedFile || uploadBusy) return;

    const user = await resolveAuthenticatedUser();
    if (!user) {
      setResumeUploadAfterLogin(true);
      setLoginRequired(true);
      return;
    }

    setResumeUploadAfterLogin(false);
    await processSelectedFile(selectedFile);
  }

  function handleSelectSavedUpload(id: number) {
    setCurrentAnalysisSelection(id);
    setSelectedAnalysisId(id);
    setError("");
    setNotice("Current dataset updated. Open Analysis to continue with this saved run.");
  }

  function handleClearCurrentSelection() {
    clearCurrentAnalysisSelection();
    setSelectedAnalysisId(null);
    setNotice("Current dataset cleared. Saved runs remain available below.");
  }

  async function handleConfirmClear() {
    if (!selectedAnalysis) return;

    try {
      setClearBusy(true);
      setError("");
      setNotice("");
      await deleteAnalysis(selectedAnalysis.id);
      clearCurrentAnalysisSelection();
      notifyAnalysesChanged();
      await refreshAnalyses(null);
      setConfirmAction(null);
      setNotice(
        "Current dataset deleted. Choose another saved run or upload a new CSV to continue."
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to delete the current dataset."
      );
    } finally {
      setClearBusy(false);
    }
  }

  return (
    <>
      <AppShell
        eyebrow="Dataset library"
        title="Uploads"
        description="Upload CSVs, keep saved datasets in a reusable library, and open the active run in Analysis."
        mobileDescription="Upload a CSV, save it to the library, then open it in Analysis."
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
            Loading uploads...
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-4">
            <BatchMobileSections
              analyses={analyses}
              highlightedAnalysis={highlightedAnalysis}
              selectedAnalysis={selectedAnalysis}
              selectedFile={selectedFile}
              uploadBusy={uploadBusy}
              completenessPct={completenessPct}
              uniquenessPct={uniquenessPct}
              setSelectedFile={setSelectedFile}
              handleUpload={handleUpload}
              clearSelectedUpload={clearSelectedUpload}
              handleSelectSavedUpload={handleSelectSavedUpload}
              handleClearCurrentSelection={handleClearCurrentSelection}
              setConfirmAction={setConfirmAction}
              setCurrentAnalysisSelection={setCurrentAnalysisSelection}
            />

            <div className="tablet-up desktop-page-stack">
              <div className="desktop-grid-2">
                <section className="desktop-panel section-glow">
                  <div className="rounded-[1rem] border border-dashed border-[#14b8a6]/35 bg-[radial-gradient(circle_at_center,_rgba(20,184,166,0.08),_transparent_68%)] px-8 py-12 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#14b8a6]/25 bg-[#14b8a6]/10 text-[#2dd4bf]">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v12" />
                        <path d="m7 8 5-5 5 5" />
                        <path d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />
                      </svg>
                    </div>
                    <h2 className="mt-5 font-[family:var(--font-display)] text-2xl font-bold text-white">
                      Drop your dataset here
                    </h2>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/45">
                      Choose a CSV to create a saved run, inspect the first quality signals, and route the dataset directly into Analysis.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <span className="desktop-badge" data-tone="teal">
                        .CSV only
                      </span>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#14b8a6]/35 bg-[#14b8a6]/10 px-4 py-2.5 text-sm font-semibold text-[#7ce7dd] transition hover:bg-[#14b8a6]/14">
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        />
                        {selectedFile ? "Change file" : "Browse files"}
                      </label>
                    </div>
                    <p className="mt-4 font-[family:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.14em] text-white/26">
                      {selectedFile
                        ? `Selected ${selectedFile.name}`
                        : "CSV only • max file size 50 MB"}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        disabled={!selectedFile || uploadBusy}
                        onClick={() => {
                          void handleUpload();
                        }}
                        className="rounded-lg bg-[#14b8a6] px-5 py-2.5 text-sm font-semibold text-[#052225] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadBusy ? "Processing dataset..." : "Process upload"}
                      </button>
                      <button
                        type="button"
                        disabled={!selectedFile || uploadBusy}
                        onClick={clearSelectedUpload}
                        className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Clear upload
                      </button>
                    </div>
                  </div>
                </section>

                <div className="desktop-stack">
                  <section className="desktop-panel">
                    <div className="desktop-panel-header">
                      <p className="desktop-panel-title">Dataset library</p>
                      <ScrollIntentLink href="/history" className="desktop-panel-action">
                        History archive
                      </ScrollIntentLink>
                    </div>

                    {analyses.length > 0 ? (
                      <>
                      <div className="desktop-data-table-wrap desktop-data-table-scroll-window">
                        <table className="desktop-data-table">
                          <thead>
                            <tr>
                              <th>Filename</th>
                              <th>Rows</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyses.map((analysis) => {
                              const selected = analysis.id === selectedAnalysis?.id;
                              const tone = selected
                                ? "purple"
                                : analysis.insights.modeling_readiness.is_ready
                                  ? "teal"
                                  : "amber";
                              const label = selected
                                ? "Active"
                                : analysis.insights.modeling_readiness.is_ready
                                  ? "Ready"
                                  : "Review";

                              return (
                                <tr key={analysis.id}>
                                  <td>
                                    <div>
                                      <div>{analysis.source_filename}</div>
                                      <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/28">
                                        {analysis.overview.dataset_name}
                                      </div>
                                    </div>
                                  </td>
                                  <td>{analysis.overview.row_count.toLocaleString()}</td>
                                  <td>
                                    <span className="desktop-badge" data-tone={tone}>
                                      <span className="desktop-status-dot" />
                                      {label}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="desktop-action-row">
                                      <button
                                        type="button"
                                        onClick={() => handleSelectSavedUpload(analysis.id)}
                                        className="rounded-md border border-white/10 px-3 py-1.5 text-[0.72rem] text-white/70"
                                      >
                                        {selected ? "Selected" : "Select"}
                                      </button>
                                      <ScrollIntentLink
                                        href={`/analysis?analysisId=${analysis.id}`}
                                        onClick={() => setCurrentAnalysisSelection(analysis.id)}
                                        className="rounded-md border border-[#2563eb]/35 px-3 py-1.5 text-[0.72rem] text-[#93c5fd]"
                                      >
                                        Analyse
                                      </ScrollIntentLink>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {selectedAnalysis ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={handleClearCurrentSelection}
                            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70"
                          >
                            Clear selection
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmAction("selected")}
                            className="rounded-lg border border-[#5a2328]/60 px-4 py-2.5 text-sm font-medium text-[#ffb4ba]"
                          >
                            Delete current
                          </button>
                        </div>
                      ) : null}
                      </>
                    ) : (
                      <div className="desktop-empty-panel !min-h-[12rem]">
                        <p className="desktop-section-title text-[1.1rem]">
                          No library datasets yet
                        </p>
                        <p className="desktop-section-text max-w-sm">
                          Upload a CSV to create the first saved analysis run and unlock the quick quality snapshot.
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="desktop-panel">
                    <div className="desktop-panel-header">
                      <p className="desktop-panel-title">
                        {selectedAnalysis
                          ? `Data quality - ${selectedAnalysis.overview.dataset_name}`
                          : "Data quality snapshot"}
                      </p>
                      {selectedAnalysis ? (
                        <ScrollIntentLink
                          href={`/analysis?analysisId=${selectedAnalysis.id}`}
                          onClick={() => setCurrentAnalysisSelection(selectedAnalysis.id)}
                          className="desktop-panel-action"
                        >
                          Full report
                        </ScrollIntentLink>
                      ) : null}
                    </div>

                    {selectedAnalysis ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-white/30">
                              Completeness
                            </p>
                            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">
                              {completenessPct.toFixed(1)}%
                            </p>
                            <p className="mt-1 text-xs text-white/32">
                              {selectedAnalysis.overview.total_missing_values.toLocaleString()} missing cells
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-white/30">
                              Uniqueness
                            </p>
                            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">
                              {uniquenessPct.toFixed(1)}%
                            </p>
                            <p className="mt-1 text-xs text-white/32">
                              {selectedAnalysis.overview.duplicate_row_count.toLocaleString()} duplicate rows
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-white/30">
                              ML readiness
                            </p>
                            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">
                              {selectedAnalysis.insights.modeling_readiness.is_ready ? "High" : "Review"}
                            </p>
                            <p className="mt-1 text-xs text-white/32">
                              {selectedAnalysis.experiment_count} saved ML experiment{selectedAnalysis.experiment_count === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-white/52">
                          {selectedAnalysis.insights.summary}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span
                            className="desktop-badge"
                            data-tone={selectedAnalysis.insights.modeling_readiness.is_ready ? "teal" : "amber"}
                          >
                            <span className="desktop-status-dot" />
                            {selectedAnalysis.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                          </span>
                          <span className="desktop-badge" data-tone="purple">
                            {selectedAnalysis.overview.column_count} columns
                          </span>
                          <span className="desktop-badge" data-tone="amber">
                            Saved {formatDate(selectedAnalysis.saved_at)}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <ScrollIntentLink
                            href={`/analysis?analysisId=${selectedAnalysis.id}`}
                            onClick={() => setCurrentAnalysisSelection(selectedAnalysis.id)}
                            className="rounded-lg bg-[#14b8a6] px-5 py-2.5 text-sm font-semibold text-[#052225]"
                          >
                            Open analysis
                          </ScrollIntentLink>
                          <button
                            type="button"
                            onClick={() => {
                              void downloadAnalysisReport(selectedAnalysis.id);
                            }}
                            className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70"
                          >
                            Download report
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="desktop-empty-panel !min-h-[14rem]">
                        <p className="desktop-section-title text-[1.1rem]">
                          No dataset selected
                        </p>
                        <p className="desktop-section-text max-w-md">
                          {analyses.length
                            ? "Pick a dataset from the library to make it the current dataset."
                            : "Upload a CSV to see missingness, duplicates, and readiness here."}
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </AppShell>

      {confirmAction ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-4 backdrop-blur-md"
          onMouseDown={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#5a2328]/60 bg-[#111821]/95 p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb4ba]">
              Clear datasets
            </p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-white">
              Delete the current dataset?
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/66">
              This removes the selected dataset, its saved report, and its attached ML experiment files. After deletion, the app returns to its no-selection state until you explicitly choose another saved run.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/82"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmClear();
                }}
                disabled={clearBusy}
                className="rounded-lg border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {clearBusy ? "Deleting..." : "Delete current dataset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LoginRequiredModal
        open={loginRequired}
        title="Login required"
        message="Log in to upload, review, or clear saved analysis runs."
        loginHref="/login"
        onDismiss={() => {
          setLoginRequired(false);
          setResumeUploadAfterLogin(false);
        }}
        onLoginSuccess={async () => {
          setLoginRequired(false);

          if (!resumeUploadAfterLogin || !selectedFile) {
            setResumeUploadAfterLogin(false);
            return;
          }

          await processSelectedFile(selectedFile);
        }}
      />
    </>
  );
}

function BatchMobileSections({
  analyses,
  highlightedAnalysis,
  selectedAnalysis,
  selectedFile,
  uploadBusy,
  completenessPct,
  uniquenessPct,
  setSelectedFile,
  handleUpload,
  clearSelectedUpload,
  handleSelectSavedUpload,
  handleClearCurrentSelection,
  setConfirmAction,
  setCurrentAnalysisSelection: setSelection,
}: {
  analyses: AnalysisListItem[];
  highlightedAnalysis: AnalysisListItem | null;
  selectedAnalysis: AnalysisListItem | null;
  selectedFile: File | null;
  uploadBusy: boolean;
  completenessPct: number;
  uniquenessPct: number;
  setSelectedFile: (file: File | null) => void;
  handleUpload: () => Promise<void>;
  clearSelectedUpload: () => void;
  handleSelectSavedUpload: (id: number) => void;
  handleClearCurrentSelection: () => void;
  setConfirmAction: (action: ConfirmAction) => void;
  setCurrentAnalysisSelection: (id: number) => void;
}) {
  const [showAllUploads, setShowAllUploads] = useState(false);
  const highlightedDuplicates = highlightedAnalysis?.overview.duplicate_row_count ?? 0;

  return (
    <div className="phone-only mobile-screen-stack">
      <section className="mobile-screen-panel section-glow" style={{ overflow: "hidden" }}>
        {/* Motif — step chart */}
        <svg viewBox="0 0 300 100" style={{ position: "absolute", top: 0, right: 0, width: 160, height: 55, opacity: 0.10, pointerEvents: "none" }} aria-hidden="true">
          <polyline points="10,85 50,85 50,60 100,60 100,40 150,40 150,55 200,55 200,25 250,25 250,15 290,15" fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinejoin="round"/>
          <line x1="10" y1="90" x2="290" y2="90" stroke="#14b8a6" strokeWidth="1" opacity="0.4"/>
        </svg>
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Dataset intake</p>
            <h2 className="mobile-screen-title">Upload a dataset</h2>
            <p className="mobile-screen-lead">Choose a CSV, create a saved run, then open it in Analysis.</p>
          </div>
        </div>
        <label className="mobile-upload-dropzone">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <span className="mobile-upload-dropzone-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11" />
              <path d="m7 9 5-5 5 5" />
              <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
            </svg>
          </span>
          <span className="mobile-upload-dropzone-title">{selectedFile ? selectedFile.name : "Choose a CSV file"}</span>
          <span className="mobile-upload-dropzone-copy">CSV only • up to 50 MB</span>
          <span className="mobile-screen-pills compact">
            <span className="mobile-screen-pill" data-tone="teal">.CSV</span>
            <span className="mobile-screen-pill">Saved run</span>
          </span>
        </label>
        <div className="mobile-screen-actions">
          <button
            type="button"
            disabled={!selectedFile || uploadBusy}
            onClick={() => {
              void handleUpload();
            }}
            className="mobile-screen-button mobile-screen-button-primary"
          >
            {uploadBusy ? "Processing..." : "Create run"}
          </button>
          <button
            type="button"
            disabled={!selectedFile || uploadBusy}
            onClick={clearSelectedUpload}
            className="mobile-screen-button mobile-screen-button-secondary"
          >
            Clear upload
          </button>
        </div>
      </section>

      <section className="mobile-screen-panel">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Current dataset</p>
            <h2 className="mobile-screen-title">
              {selectedAnalysis ? selectedAnalysis.overview.dataset_name : "No dataset selected yet"}
            </h2>
            <p className="mobile-screen-lead">
              {selectedAnalysis
                ? truncateText(selectedAnalysis.insights.summary, 108)
                : selectedFile
                  ? `Ready to analyse ${selectedFile.name}. Create the run to continue.`
                  : "Select a saved run below or upload a new CSV."}
            </p>
          </div>
        </div>
        {selectedAnalysis ? (
          <>
            <div className="mobile-screen-pills">
              <span className="mobile-screen-pill" data-tone="teal">
                {selectedAnalysis.overview.total_missing_values.toLocaleString()} missing
              </span>
              <span className="mobile-screen-pill" data-tone="purple">
                {selectedAnalysis.overview.column_count} columns
              </span>
              <span className="mobile-screen-pill" data-tone={selectedAnalysis.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                {selectedAnalysis.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
              </span>
            </div>
            <div className="mobile-screen-progress-list">
              <div className="mobile-screen-progress-item">
                <div className="mobile-screen-progress-copy">
                  <span>Completeness</span>
                  <strong>{completenessPct.toFixed(1)}%</strong>
                </div>
                <div className="mobile-screen-track"><span className="mobile-screen-fill" style={{ width: `${Math.max(0, Math.min(completenessPct, 100))}%`, background: "#14b8a6" }} /></div>
              </div>
              <div className="mobile-screen-progress-item">
                <div className="mobile-screen-progress-copy">
                  <span>Uniqueness</span>
                  <strong>{uniquenessPct.toFixed(1)}%</strong>
                </div>
                <div className="mobile-screen-track"><span className="mobile-screen-fill" style={{ width: `${Math.max(0, Math.min(uniquenessPct, 100))}%`, background: "#7c3aed" }} /></div>
              </div>
              <div className="mobile-screen-progress-item">
                <div className="mobile-screen-progress-copy">
                  <span>Duplicates</span>
                  <strong>{highlightedDuplicates.toLocaleString()}</strong>
                </div>
                <div className="mobile-screen-track"><span className="mobile-screen-fill" style={{ width: `${highlightedDuplicates === 0 ? 100 : Math.max(10, 100 - Math.min(highlightedDuplicates, 100))}%`, background: "#2563eb" }} /></div>
              </div>
            </div>
            <div className="mobile-screen-actions">
              <ScrollIntentLink
                href={`/analysis?analysisId=${selectedAnalysis.id}`}
                onClick={() => setSelection(selectedAnalysis.id)}
                className="mobile-screen-button mobile-screen-button-primary"
              >
                Open analysis
              </ScrollIntentLink>
              <button
                type="button"
                onClick={handleClearCurrentSelection}
                className="mobile-screen-button mobile-screen-button-secondary"
              >
                Clear selection
              </button>
            </div>
            <div className="mobile-screen-actions">
              <button
                type="button"
                onClick={() => setConfirmAction("selected")}
                className="mobile-screen-button mobile-screen-button-danger"
              >
                Delete current dataset
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="mobile-screen-panel">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Dataset library</p>
            <h2 className="mobile-screen-title">Saved datasets</h2>
            <p className="mobile-screen-lead">Keep reusable runs here, set one active, or open it directly in Analysis.</p>
          </div>
        </div>
        {analyses.length === 0 ? (
          <p className="mobile-screen-empty">No saved runs yet. Upload a CSV to create the first one.</p>
        ) : (
          <div className="mobile-batch-card-list">
            {(showAllUploads ? analyses : analyses.slice(0, 3)).map((analysis) => {
              const selected = analysis.id === selectedAnalysis?.id;
              return (
                <div key={analysis.id} className={`mobile-batch-card${selected ? " mobile-batch-card-active" : ""}`}>
                  <span className="mobile-batch-card-icon" aria-hidden="true">📄</span>
                  <div className="mobile-batch-card-body">
                    <p className="mobile-batch-card-label">{analysis.overview.dataset_name || analysis.source_filename}</p>
                    <p className="mobile-batch-card-meta">
                      {formatDate(analysis.saved_at)} · {analysis.overview.row_count.toLocaleString()} rows · {analysis.overview.column_count} cols
                    </p>
                    <div className="mobile-batch-card-actions">
                      <button
                        type="button"
                        onClick={() => handleSelectSavedUpload(analysis.id)}
                        className="mobile-screen-button mobile-screen-button-secondary"
                      >
                        {selected ? "Selected" : "Set active"}
                      </button>
                      <ScrollIntentLink
                        href={`/analysis?analysisId=${analysis.id}`}
                        onClick={() => setSelection(analysis.id)}
                        className="mobile-screen-button mobile-screen-button-primary"
                      >
                        Open analysis
                      </ScrollIntentLink>
                    </div>
                  </div>
                  <span className="mobile-batch-card-badge" data-tone={selected ? "purple" : analysis.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                    {selected ? "Active" : analysis.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!showAllUploads && analyses.length > 3 ? (
          <div className="mobile-screen-actions">
            <button
              type="button"
              onClick={() => setShowAllUploads(true)}
              className="mobile-screen-button mobile-screen-button-secondary"
            >
              View full library ({analyses.length})
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
