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
import { clearCurrentAnalysisSelection, getCurrentAnalysisSelection, isAnalysisStateStorageEvent, notifyAnalysesChanged, setCurrentAnalysisSelection } from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { queueNavigationScroll, useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";

type ConfirmAction = "selected" | null;

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

  useApplyNavigationScroll("/batch", !loading);

  async function refreshAnalyses(preferredId?: number | null) {
    const items = await getAnalyses();
    setAnalyses(items);
    const nextSelected = typeof preferredId === "number" && items.some((item) => item.id === preferredId) ? preferredId : null;
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
        const nextSelected = currentAnalysisId && items.some((item) => item.id === currentAnalysisId) ? currentAnalysisId : null;
        if (currentAnalysisId && !nextSelected) {
          clearCurrentAnalysisSelection();
        }
        setSelectedAnalysisId(nextSelected);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load saved runs.");
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

  async function processSelectedFile(file: File) {
    try {
      setUploadBusy(true);
      setError("");
      setNotice("");
      const payload = await uploadAnalysisCsv(file);
      setCurrentAnalysisSelection(payload.analysis_id);
      notifyAnalysesChanged();
      await refreshAnalyses(payload.analysis_id);
      queueNavigationScroll("/analysis", "analysis-workspace-navigation", undefined, true);
      router.push(`/analysis?analysisId=${payload.analysis_id}`, { scroll: false });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to analyze upload.");
    } finally {
      setUploadBusy(false);
      setResumeUploadAfterLogin(false);
    }
  }

  const stats = [
    {
      label: "Saved runs",
      value: analyses.length.toLocaleString(),
      hint: selectedAnalysis ? selectedAnalysis.overview.dataset_name : analyses.length ? "No current dataset selected" : "No saved runs yet",
    },
    {
      label: "Missing values",
      value: selectedAnalysis ? selectedAnalysis.overview.total_missing_values.toLocaleString() : "0",
      hint: selectedAnalysis ? "From the selected upload" : "Upload a CSV to inspect quality",
    },
    {
      label: "Duplicates",
      value: selectedAnalysis ? selectedAnalysis.overview.duplicate_row_count.toLocaleString() : "0",
      hint: selectedAnalysis?.insights.modeling_readiness.is_ready ? "ML-ready candidate" : "Review quality first",
    },
  ];

  async function handleUpload() {
    if (!selectedFile) return;

    const user = await resolveAuthenticatedUser();
    if (!user) {
      setResumeUploadAfterLogin(true);
      setLoginRequired(true);
      return;
    }

    await processSelectedFile(selectedFile);
  }

  async function handleConfirmClear() {
    if (!confirmAction) return;

    try {
      setClearBusy(true);
      setError("");
      setNotice("");

      if (confirmAction === "selected") {
        if (!selectedAnalysis) {
          setConfirmAction(null);
          return;
        }
        await deleteAnalysis(selectedAnalysis.id);
        clearCurrentAnalysisSelection();
        await refreshAnalyses(null);
        notifyAnalysesChanged();
        setNotice("Current dataset deleted. No dataset is selected now.");
      }

      setConfirmAction(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to clear saved runs.");
    } finally {
      setClearBusy(false);
    }
  }

  function handleSelectSavedUpload(analysisId: number) {
    setNotice("");
    setSelectedAnalysisId(analysisId);
    setCurrentAnalysisSelection(analysisId);
  }

  function handleClearCurrentSelection() {
    setNotice("");
    setSelectedAnalysisId(null);
    clearCurrentAnalysisSelection();
  }

  return (
    <>
      <AppShell
        eyebrow="Uploads Workspace"
        title="Dataset Intake"
        description="Upload a dataset, review initial validation checks, and open the full analysis report."
        stats={stats}
        actions={
          <div className="flex flex-wrap gap-3">
            <ScrollIntentLink href="/analysis" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
              Open analysis workspace
            </ScrollIntentLink>
            <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
              Open history
            </ScrollIntentLink>
          </div>
        }
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
            Loading uploads workspace...
          </div>
        ) : null}

        {!loading ? (
          <section id="batch-primary-section" className="route-scroll-target space-y-4">
            {!analyses.length && !selectedFile ? (
              <div className="rounded-[28px] border border-dashed border-[#7ad6ff]/30 bg-[#7ad6ff]/10 px-5 py-6 text-sm text-[#def7ff]">
                <p className="font-semibold text-white">No dataset is staged yet.</p>
                <p className="mt-2 max-w-3xl leading-6 text-white/74">
                  This page remains empty until a CSV is chosen and processed. After the first upload completes, the saved dataset snapshot appears here for review.
                </p>
              </div>
            ) : null}

            {analyses.length > 0 && !selectedAnalysis && !selectedFile ? (
              <div className="rounded-[28px] border border-dashed border-[#ffb079]/30 bg-[#ffb079]/10 px-5 py-6 text-sm text-[#ffe7d7]">
                <p className="font-semibold text-white">No current dataset is selected.</p>
                <p className="mt-2 max-w-3xl leading-6 text-white/74">
                  Choose a previous upload from Saved runs below or open one from History to continue working in Analysis.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
              <details className="mobile-accordion">
                <summary>
                  <div className="min-w-0">
                    <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Dataset upload</span>
                    <p className="mobile-accordion-hint">Upload a CSV to create a new analysis run and view initial validation check results</p>
                  </div>
                </summary>
                <div className="mobile-accordion-body">
                <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-white">
                  Upload and Validate Dataset
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/66">
                  Upload a CSV to create a saved analysis run. The following checks are performed automatically after upload.
                </p>

                <div className="mt-4 rounded-[22px] border border-white/10 bg-black/10 p-4 text-sm text-white/72">
                  <p className="font-medium text-white">What is checked during upload</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                    <li>Missing values across the dataset</li>
                    <li>Duplicate rows in the uploaded file</li>
                    <li>Column types and structure consistency</li>
                    <li>Basic modeling readiness indicators</li>
                  </ul>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 text-sm text-white/70">
                    <p className="font-medium text-white">1. Select file</p>
                    <p className="mt-2 leading-6">Choose the CSV you want to process.</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 text-sm text-white/70">
                    <p className="font-medium text-white">2. Review validation</p>
                    <p className="mt-2 leading-6">Check missing values, duplicates, and structure signals.</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4 text-sm text-white/70">
                    <p className="font-medium text-white">3. Open report</p>
                    <p className="mt-2 leading-6">Continue to the full analysis report.</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/12">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    />
                    {selectedFile ? selectedFile.name : "Choose dataset CSV"}
                  </label>
                  <button
                    type="button"
                    disabled={!selectedFile || uploadBusy}
                    onClick={() => {
                      void handleUpload();
                    }}
                    className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadBusy ? "Processing dataset..." : "Process dataset"}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAnalysis}
                    onClick={() => setConfirmAction("selected")}
                    className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-medium text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Delete current dataset
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAnalysis}
                    onClick={handleClearCurrentSelection}
                    className="rounded-full border border-white/12 px-5 py-3 text-sm font-medium text-white/82 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear dataset
                  </button>
                </div>
                </div>
              </details>

              <details className="mobile-accordion">
                <summary>
                  <div className="min-w-0">
                    <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Selected dataset</span>
                    <p className="mobile-accordion-hint">Quick quality summary for the currently staged dataset</p>
                  </div>
                </summary>
                <div className="mobile-accordion-body">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
                    {selectedAnalysis ? selectedAnalysis.overview.dataset_name : "No saved run selected"}
                  </h2>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">
                    {analyses.length} saved run{analyses.length === 1 ? "" : "s"}
                  </span>
                </div>

                {selectedAnalysis ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-white/66">{selectedAnalysis.insights.summary}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/42">Missing values</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {selectedAnalysis.overview.total_missing_values.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/42">Duplicate rows</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {selectedAnalysis.overview.duplicate_row_count.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/42">Columns</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {selectedAnalysis.overview.column_count.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-white/42">Saved ML runs</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{selectedAnalysis.experiment_count}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[#8bf1a8]/20 bg-[#8bf1a8]/10 p-4 text-sm text-[#def9e7]">
                      {selectedAnalysis.insights.modeling_readiness.is_ready
                        ? "This dataset looks ready enough to continue into the ML tab after you review Overview and Insights."
                        : "This dataset needs more exploratory review first. Start with Overview, Insights, and Data Quality after opening the run."}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <ScrollIntentLink
                        href={`/analysis?analysisId=${selectedAnalysis.id}`}
                        targetId="analysis-workspace-navigation"
                        onClick={() => setCurrentAnalysisSelection(selectedAnalysis.id)}
                        className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]"
                      >
                        Open analysis overview
                      </ScrollIntentLink>
                      <button
                        type="button"
                        onClick={() => {
                          void downloadAnalysisReport(selectedAnalysis.id);
                        }}
                        className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82"
                      >
                        Download report
                      </button>
                      <ScrollIntentLink href="/dashboard" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
                        Back to dashboard
                      </ScrollIntentLink>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-white/12 px-4 py-6 text-sm text-white/50">
                    <p className="font-medium text-white">No dataset is selected yet.</p>
                    <p className="mt-2 leading-6 text-white/68">
                      {analyses.length
                        ? "Pick a saved run below to make it the current dataset, or open a specific run from History in its own popup."
                        : "Upload a CSV or reopen a saved run to see quick dataset quality information here."}
                    </p>
                    {selectedFile ? <p className="mt-3 text-[#ffcfaa]">Ready to analyze: {selectedFile.name}</p> : null}
                  </div>
                )}  
                </div>
              </details>
            </div>

            <details className="mobile-accordion">
              <summary>
                <div className="min-w-0">
                  <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Saved runs</span>
                  <p className="mobile-accordion-hint">All previous uploads — tap to select one as the current dataset</p>
                </div>
              </summary>
              <div className="mobile-accordion-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="mt-0 font-[family:var(--font-display)] text-xl text-white">Recent datasets</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
                    Select a saved run to inspect its quick summary here, or open it in Analysis when you need the full tabbed report.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82">
                    See full history
                  </ScrollIntentLink>
                  <button
                    type="button"
                    disabled={!selectedAnalysis}
                    onClick={handleClearCurrentSelection}
                    className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear current selection
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {analyses.map((analysis) => {
                  const selected = analysis.id === selectedAnalysis?.id;
                  return (
                    <button
                      type="button"
                      key={analysis.id}
                      onClick={() => handleSelectSavedUpload(analysis.id)}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${selected ? "border-[#7ad6ff]/60 bg-[#7ad6ff]/10" : "border-white/10 bg-black/10 hover:bg-white/8"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white">
                            {analysis.overview.dataset_name || analysis.source_filename}
                          </p>
                          <p className="mt-1 text-xs text-white/45">Saved {formatDate(analysis.saved_at)}</p>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/58">
                          {selected ? "Selected" : "Saved"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/66">{analysis.insights.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {analysis.overview.row_count.toLocaleString()} rows
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {analysis.overview.total_missing_values.toLocaleString()} missing
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {analysis.overview.duplicate_row_count.toLocaleString()} duplicates
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          {analysis.experiment_count} ML runs
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-medium text-[#bfefff]">
                        {selected ? "Current dataset selected" : "Select this dataset"}
                      </p>
                    </button>
                  );
                })}

                {analyses.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-white/12 px-4 py-6 text-sm text-white/50">
                    No saved runs yet. This section stays empty until the first upload is analyzed, then each saved dataset appears here for quick reopening.
                  </div>
                ) : null}
              </div>
              </div>
            </details>
          </section>
        ) : null}
      </AppShell>

      {confirmAction ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-4 backdrop-blur-md" onMouseDown={() => setConfirmAction(null)}>
          <div
            className="w-full max-w-lg rounded-[28px] border border-[#5a2328] bg-[#111821]/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb4ba]">Clear datasets</p>
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
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/82"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmClear();
                }}
                disabled={clearBusy}
                className="rounded-full border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
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