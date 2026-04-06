"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";
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
import { queueNavigationScroll } from "@/lib/navigationScroll";
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
            <ScrollIntentLink href="/analysis" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
              Open analysis workspace
            </ScrollIntentLink>
            <ScrollIntentLink href="/history" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
              Open history
            </ScrollIntentLink>
          </div>
        }
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
          <div className="py-10 text-center text-sm text-white/40">
            Loading uploads workspace...
          </div>
        ) : null}

        {!loading ? (
          <section id="batch-primary-section" className="route-scroll-target space-y-4">
            {/* ─── Phone: upload form + inline info + section list ─── */}
            <div className="phone-only space-y-3">
              <div className="flex flex-col gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/8 px-4 py-3 text-sm font-medium text-white transition">
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
                  onClick={() => { void handleUpload(); }}
                  className="rounded-lg bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b] disabled:opacity-60"
                >
                  {uploadBusy ? "Processing..." : "Process dataset"}
                </button>
              </div>

              {/* Inline stats strip */}
              <div className="mobile-inline-stats">
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{analyses.length}</span>
                  <span className="mobile-inline-stat-label">Saved runs</span>
                </div>
                {selectedAnalysis ? (
                  <>
                    <div className="mobile-inline-stat">
                      <span className="mobile-inline-stat-value">{selectedAnalysis.overview.row_count?.toLocaleString() ?? "—"}</span>
                      <span className="mobile-inline-stat-label">Rows</span>
                    </div>
                    <div className="mobile-inline-stat">
                      <span className="mobile-inline-stat-value">{selectedAnalysis.overview.column_count ?? "—"}</span>
                      <span className="mobile-inline-stat-label">Columns</span>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Current selection summary */}
              {selectedAnalysis ? (
                <div className="border-b border-white/6 pb-3">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/42">Active dataset</p>
                  <p className="mt-1 font-medium text-white">{selectedAnalysis.overview.dataset_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="info-chip">
                      <span className="pulse-dot" />
                      {selectedAnalysis.insights.modeling_readiness.is_ready ? "ML Ready" : "EDA only"}
                    </span>
                    {selectedAnalysis.overview.total_missing_values > 0 && (
                      <span className="info-chip">{selectedAnalysis.overview.total_missing_values} missing</span>
                    )}
                    {selectedAnalysis.overview.duplicate_row_count > 0 && (
                      <span className="info-chip">{selectedAnalysis.overview.duplicate_row_count} dups</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentAnalysisSelection(selectedAnalysis.id);
                      router.push(`/analysis?analysisId=${selectedAnalysis.id}`);
                    }}
                    className="mt-3 block w-full rounded-lg bg-[#ffb079] px-4 py-2.5 text-center text-sm font-semibold text-[#11273b]"
                  >
                    Open analysis
                  </button>
                </div>
              ) : null}

              <BatchMobileSections
                analyses={analyses}
                selectedAnalysis={selectedAnalysis}
                selectedFile={selectedFile}
                handleSelectSavedUpload={handleSelectSavedUpload}
                handleClearCurrentSelection={handleClearCurrentSelection}
                setConfirmAction={setConfirmAction}
                setCurrentAnalysisSelection={setCurrentAnalysisSelection}
              />
            </div>

            {/* ─── Desktop: clean flowing sections ─── */}
            {!analyses.length && !selectedFile ? (
              <div className="tablet-up border-l-2 border-[#7ad6ff]/30 pl-4 py-2 text-sm text-white/60">
                <p className="font-semibold text-white">No dataset is staged yet.</p>
                <p className="mt-1 leading-6">Upload a CSV to create the first analysis run.</p>
              </div>
            ) : null}

            {analyses.length > 0 && !selectedAnalysis && !selectedFile ? (
              <div className="tablet-up border-l-2 border-[#ffb079]/30 pl-4 py-2 text-sm text-white/60">
                <p className="font-semibold text-white">No current dataset is selected.</p>
                <p className="mt-1 leading-6">Choose a previous upload from Saved runs below or open one from History.</p>
              </div>
            ) : null}

            <div className="tablet-up space-y-0">
              {/* Upload section */}
              <section className="flow-section section-glow">
                <p className="flow-section-label">Dataset upload</p>
                <div className="accent-bar" />
                <p className="mt-2 text-sm leading-6 text-white/55">Upload a CSV to create a saved analysis run. Missing values, duplicates, and structure are checked automatically.</p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
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
                    onClick={() => { void handleUpload(); }}
                    className="rounded-lg bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadBusy ? "Processing dataset..." : "Process dataset"}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAnalysis}
                    onClick={() => setConfirmAction("selected")}
                    className="rounded-lg border border-[#5a2328]/60 px-4 py-2.5 text-sm font-medium text-[#ffb4ba] transition hover:bg-[#2a1215] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Delete current
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAnalysis}
                    onClick={handleClearCurrentSelection}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear selection
                  </button>
                </div>
              </section>

              {/* Selected dataset stats */}
              <section className="flow-section">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flow-section-label">Selected dataset</p>
                  <span className="text-xs text-white/40">{analyses.length} saved run{analyses.length === 1 ? "" : "s"}</span>
                </div>

                {selectedAnalysis ? (
                  <>
                    <p className="mt-2 font-[family:var(--font-display)] text-xl font-bold text-white">{selectedAnalysis.overview.dataset_name}</p>
                    <p className="mt-2 text-sm leading-6 text-white/55">{selectedAnalysis.insights.summary}</p>

                    <div className="stat-row mt-3">
                      <div className="stat-row-item">
                        <p className="stat-row-value">{selectedAnalysis.overview.total_missing_values.toLocaleString()}</p>
                        <p className="stat-row-label">Missing values</p>
                      </div>
                      <div className="stat-row-item">
                        <p className="stat-row-value">{selectedAnalysis.overview.duplicate_row_count.toLocaleString()}</p>
                        <p className="stat-row-label">Duplicates</p>
                      </div>
                      <div className="stat-row-item">
                        <p className="stat-row-value">{selectedAnalysis.overview.column_count}</p>
                        <p className="stat-row-label">Columns</p>
                      </div>
                      <div className="stat-row-item">
                        <p className="stat-row-value">{selectedAnalysis.experiment_count}</p>
                        <p className="stat-row-label">ML experiments</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-white/50">
                      {selectedAnalysis.insights.modeling_readiness.is_ready
                        ? "Looks ready for ML — review Overview and Insights first."
                        : "Needs more exploratory review. Start with Overview and Data Quality."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <ScrollIntentLink
                        href={`/analysis?analysisId=${selectedAnalysis.id}`}
                        targetId="analysis-workspace-navigation"
                        onClick={() => setCurrentAnalysisSelection(selectedAnalysis.id)}
                        className="rounded-lg bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b]"
                      >
                        Open analysis overview
                      </ScrollIntentLink>
                      <button
                        type="button"
                        onClick={() => { void downloadAnalysisReport(selectedAnalysis.id); }}
                        className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/70"
                      >
                        Download report
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 py-4 text-sm text-white/40">
                    <p className="font-medium text-white/60">No dataset selected.</p>
                    <p className="mt-1 leading-6">
                      {analyses.length
                        ? "Pick a saved run below to make it the current dataset."
                        : "Upload a CSV to see quality information here."}
                    </p>
                    {selectedFile ? <p className="mt-2 text-[#ffcfaa]">Ready to analyze: {selectedFile.name}</p> : null}
                  </div>
                )}
              </section>

              {/* Saved runs */}
              <section className="flow-section">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flow-section-label">Saved runs</p>
                  <div className="flex gap-3">
                    <ScrollIntentLink href="/history" className="inline-tag">
                      Full history
                    </ScrollIntentLink>
                    <button
                      type="button"
                      disabled={!selectedAnalysis}
                      onClick={handleClearCurrentSelection}
                      className="inline-tag transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {analyses.map((analysis) => {
                    const selected = analysis.id === selectedAnalysis?.id;
                    return (
                      <button
                        type="button"
                        key={analysis.id}
                        onClick={() => handleSelectSavedUpload(analysis.id)}
                        className={`list-row w-full text-left ${selected ? "bg-[#7ad6ff]/5" : ""}`}
                      >
                        <div className="list-row-content">
                          <div className="flex items-baseline gap-3">
                            <p className="list-row-title truncate">{analysis.overview.dataset_name || analysis.source_filename}</p>
                            {selected ? <span className="text-[0.65rem] font-bold uppercase tracking-wide text-[#7ad6ff]">Selected</span> : null}
                          </div>
                          <p className="list-row-hint">{analysis.insights.summary}</p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/40">
                            <span>{analysis.overview.row_count.toLocaleString()} rows</span>
                            <span>{analysis.overview.total_missing_values.toLocaleString()} missing</span>
                            <span>{analysis.overview.duplicate_row_count.toLocaleString()} dups</span>
                            <span>{analysis.experiment_count} ML</span>
                            <span>{formatDate(analysis.saved_at)}</span>
                          </div>
                        </div>
                        <span className="text-sm text-white/25">›</span>
                      </button>
                    );
                  })}

                  {analyses.length === 0 ? (
                    <p className="py-6 text-sm text-white/40">
                      No saved runs yet. Upload a CSV to create the first analysis run.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </section>
        ) : null}
      </AppShell>

      {confirmAction ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-4 backdrop-blur-md" onMouseDown={() => setConfirmAction(null)}>
          <div
            className="w-full max-w-lg rounded-xl border border-[#5a2328]/60 bg-[#111821]/95 p-6"
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

/* ── Phone-only section list for batch page ── */
function BatchMobileSections({
  analyses,
  selectedAnalysis,
  selectedFile,
  handleSelectSavedUpload,
  handleClearCurrentSelection,
  setConfirmAction,
  setCurrentAnalysisSelection: setSelection,
}: {
  analyses: AnalysisListItem[];
  selectedAnalysis: AnalysisListItem | null;
  selectedFile: File | null;
  handleSelectSavedUpload: (id: number) => void;
  handleClearCurrentSelection: () => void;
  setConfirmAction: (action: ConfirmAction) => void;
  setCurrentAnalysisSelection: (id: number) => void;
}) {
  const sections: MobileSection[] = [
    {
      id: "selected",
      title: selectedAnalysis ? selectedAnalysis.overview.dataset_name : "Selected dataset",
      hint: selectedAnalysis
        ? `${selectedAnalysis.overview.total_missing_values.toLocaleString()} missing • ${selectedAnalysis.overview.duplicate_row_count.toLocaleString()} dups`
        : "No dataset selected yet",
      accent: "#8bf1a8",
      content: selectedAnalysis ? (
        <div className="space-y-0">
          <p className="text-sm leading-6 text-white/55">{selectedAnalysis.insights.summary}</p>
          <div className="stat-row mt-3">
            <div className="stat-row-item">
              <p className="stat-row-value">{selectedAnalysis.overview.total_missing_values.toLocaleString()}</p>
              <p className="stat-row-label">Missing</p>
            </div>
            <div className="stat-row-item">
              <p className="stat-row-value">{selectedAnalysis.overview.duplicate_row_count.toLocaleString()}</p>
              <p className="stat-row-label">Duplicates</p>
            </div>
            <div className="stat-row-item">
              <p className="stat-row-value">{selectedAnalysis.overview.column_count.toLocaleString()}</p>
              <p className="stat-row-label">Columns</p>
            </div>
            <div className="stat-row-item">
              <p className="stat-row-value">{selectedAnalysis.experiment_count}</p>
              <p className="stat-row-label">ML runs</p>
            </div>
          </div>
          <ScrollIntentLink
            href={`/analysis?analysisId=${selectedAnalysis.id}`}
            onClick={() => setSelection(selectedAnalysis.id)}
            className="mt-4 block rounded-lg bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]"
          >
            Open analysis overview
          </ScrollIntentLink>
          <button
            type="button"
            onClick={() => setConfirmAction("selected")}
            className="mt-2 w-full rounded-lg border border-[#5a2328]/60 px-5 py-3 text-sm font-medium text-[#ffb4ba]"
          >
            Delete current dataset
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-white/60">
            {selectedFile ? `Ready to analyze: ${selectedFile.name}` : "Upload a CSV or pick a saved run to see dataset info here."}
          </p>
        </div>
      ),
    },
    {
      id: "runs",
      title: "Saved runs",
      hint: `${analyses.length} saved run${analyses.length === 1 ? "" : "s"}`,
      accent: "#ffb079",
      content: (
        <div className="space-y-3">
          {analyses.length === 0 ? (
            <p className="text-sm text-white/50">No saved runs yet. Upload a CSV to create the first one.</p>
          ) : null}
          {analyses.map((analysis) => {
            const selected = analysis.id === selectedAnalysis?.id;
            return (
              <button
                key={analysis.id}
                type="button"
                onClick={() => handleSelectSavedUpload(analysis.id)}
                className={`w-full border-b border-white/6 py-3 text-left last:border-0 ${selected ? "bg-[#7ad6ff]/5" : ""}`}
              >
                <p className="truncate font-semibold text-white">{analysis.overview.dataset_name || analysis.source_filename}</p>
                <p className="mt-1 text-xs text-white/45">Saved {formatDate(analysis.saved_at)}</p>
                <p className="mt-2 text-sm leading-6 text-white/60">{analysis.insights.summary}</p>
              </button>
            );
          })}
          {selectedAnalysis ? (
            <button
              type="button"
              onClick={handleClearCurrentSelection}
              className="w-full rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82"
            >
              Clear current selection
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return <MobileSectionList sections={sections} />;
}