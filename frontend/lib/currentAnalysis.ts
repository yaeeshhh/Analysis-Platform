const CURRENT_ANALYSIS_STORAGE_KEY = "currentAnalysisId";
const CURRENT_ANALYSIS_EVENT = "analysis:current-selection-changed";
const ANALYSES_UPDATED_STORAGE_KEY = "analysisRecordsUpdatedAt";
export const ANALYSES_UPDATED_EVENT = "analysis:records-changed";

type AnalysisStateChangeListener = () => void;

type AnalysisStateSubscriptionOptions = {
  includeCurrentSelectionChanges?: boolean;
};

function normalizeAnalysisId(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.trunc(value);
}

function dispatchWindowEvent(eventName: string, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function getCurrentAnalysisSelection(): number | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(CURRENT_ANALYSIS_STORAGE_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  return normalizeAnalysisId(parsed);
}

export function setCurrentAnalysisSelection(analysisId: number | null) {
  if (typeof window === "undefined") return;

  const normalized = normalizeAnalysisId(analysisId);

  if (normalized === null) {
    localStorage.removeItem(CURRENT_ANALYSIS_STORAGE_KEY);
  } else {
    localStorage.setItem(CURRENT_ANALYSIS_STORAGE_KEY, String(normalized));
  }

  dispatchWindowEvent(CURRENT_ANALYSIS_EVENT, { analysisId: normalized });
}

export function clearCurrentAnalysisSelection() {
  setCurrentAnalysisSelection(null);
}

export function notifyAnalysesChanged() {
  if (typeof window === "undefined") return;

  localStorage.setItem(ANALYSES_UPDATED_STORAGE_KEY, Date.now().toString());
  dispatchWindowEvent(ANALYSES_UPDATED_EVENT);
}

export function isAnalysisStateStorageEvent(event: StorageEvent): boolean {
  return (
    event.key === CURRENT_ANALYSIS_STORAGE_KEY ||
    event.key === ANALYSES_UPDATED_STORAGE_KEY
  );
}

export function subscribeToAnalysisStateChanges(
  listener: AnalysisStateChangeListener,
  options: AnalysisStateSubscriptionOptions = {}
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const { includeCurrentSelectionChanges = false } = options;

  const handleStorage = (event: StorageEvent) => {
    if (!isAnalysisStateStorageEvent(event)) return;
    listener();
  };

  const handleAnalysesChanged = () => {
    listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(ANALYSES_UPDATED_EVENT, handleAnalysesChanged);

  if (includeCurrentSelectionChanges) {
    window.addEventListener(CURRENT_ANALYSIS_EVENT, handleAnalysesChanged);
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ANALYSES_UPDATED_EVENT, handleAnalysesChanged);

    if (includeCurrentSelectionChanges) {
      window.removeEventListener(CURRENT_ANALYSIS_EVENT, handleAnalysesChanged);
    }
  };
}