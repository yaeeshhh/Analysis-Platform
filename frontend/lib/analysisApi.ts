import { fetchWithAuth, getAccessToken, parseJsonSafely } from "./api";
import { getApiBaseUrl } from "./apiBaseUrl";
import {
  AnalysisInsights,
  AnalysisListItem,
  AnalysisMlCapabilities,
  AnalysisOverview,
  AnalysisQuality,
  AnalysisReport,
  AnalysisSchema,
  AnalysisStatistics,
  AnalysisVisualisations,
  MlExperimentDetail,
  MlExperimentSummary,
  SupervisedResult,
  UnsupervisedResult,
} from "./analysisTypes";

const API_BASE_URL = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

const EMPTY_TYPE_COUNTS = {
  numeric: 0,
  categorical: 0,
  boolean: 0,
  datetime: 0,
  text: 0,
  unknown: 0,
};

const EMPTY_OVERVIEW: AnalysisOverview = {
  dataset_name: "Untitled dataset",
  row_count: 0,
  column_count: 0,
  encoding: "unknown",
  duplicate_row_count: 0,
  total_missing_values: 0,
  type_counts: EMPTY_TYPE_COUNTS,
  preview_rows: [],
};

const EMPTY_SCHEMA: AnalysisSchema = {
  row_count: 0,
  column_count: 0,
  type_counts: EMPTY_TYPE_COUNTS,
  columns: [],
  identifier_columns: [],
  target_candidates: [],
};

const EMPTY_QUALITY: AnalysisQuality = {
  duplicate_row_count: 0,
  missing_by_column: [],
  constant_columns: [],
  near_constant_columns: [],
  high_cardinality_columns: [],
  invalid_numeric_columns: [],
  outlier_columns: [],
  high_correlations: [],
  quality_score: 0,
  recommendations: [],
};

const EMPTY_STATISTICS: AnalysisStatistics = {
  numeric_summary: [],
  categorical_summary: [],
  datetime_summary: [],
  correlation_matrix: [],
};

const EMPTY_VISUALISATIONS: AnalysisVisualisations = {
  missingness: [],
  histograms: [],
  boxplots: [],
  top_categories: [],
  correlation_heatmap: [],
  pairwise_scatter: [],
  drift_checks: [],
};

const EMPTY_INSIGHTS: AnalysisInsights = {
  summary: "This saved analysis is missing part of the report payload.",
  findings: [],
  recommended_next_steps: [],
  modeling_readiness: {
    is_ready: false,
    target_candidates: [],
  },
};

const EMPTY_ML_CAPABILITIES: AnalysisMlCapabilities = {
  unsupervised: {
    available: false,
    reason: "Run a fresh upload to compute ML capabilities.",
  },
  supervised: {
    available: false,
    reason: "Run a fresh upload to compute ML capabilities.",
    target_candidates: [],
    target_recommendations: [],
  },
};

const EMPTY_REPORT: AnalysisReport = {
  analysis_id: 0,
  analysis_version: "unknown",
  overview: EMPTY_OVERVIEW,
  schema: EMPTY_SCHEMA,
  quality: EMPTY_QUALITY,
  statistics: EMPTY_STATISTICS,
  visualisations: EMPTY_VISUALISATIONS,
  insights: EMPTY_INSIGHTS,
  ml_capabilities: EMPTY_ML_CAPABILITIES,
  ml_results: {},
  ml_experiments: [],
};

const ANALYSIS_CACHE_WINDOW_MS = 5000;

type CachedAnalysisValue<T> = {
  cacheKey: string;
  expiresAt: number;
  value: T;
};

let cachedAnalyses: CachedAnalysisValue<AnalysisListItem[]> | null = null;
let analysesRequest:
  | {
      cacheKey: string;
      promise: Promise<AnalysisListItem[]>;
    }
  | null = null;
const cachedReports = new Map<string, CachedAnalysisValue<AnalysisReport>>();
const reportRequests = new Map<
  string,
  {
    cacheKey: string;
    promise: Promise<AnalysisReport>;
  }
>();

function getAnalysisCacheKey(): string {
  return getAccessToken() ?? "__anonymous__";
}

function readCachedAnalysisValue<T>(
  entry: CachedAnalysisValue<T> | null | undefined,
  cacheKey: string
): T | undefined {
  if (entry && entry.cacheKey === cacheKey && entry.expiresAt > Date.now()) {
    return entry.value;
  }

  return undefined;
}

function storeCachedAnalysisValue<T>(value: T): CachedAnalysisValue<T> {
  return {
    cacheKey: getAnalysisCacheKey(),
    expiresAt: Date.now() + ANALYSIS_CACHE_WINDOW_MS,
    value,
  };
}

export function invalidateAnalysisCache(id?: number | string): void {
  cachedAnalyses = null;
  analysesRequest = null;

  if (id === undefined) {
    cachedReports.clear();
    reportRequests.clear();
    return;
  }

  const reportKey = String(id);
  cachedReports.delete(reportKey);
  reportRequests.delete(reportKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTypeCounts(value: unknown) {
  return {
    ...EMPTY_TYPE_COUNTS,
    ...(isRecord(value) ? value : {}),
  };
}

function normalizeOverview(value: unknown, fallbackName: string): AnalysisOverview {
  const input = isRecord(value) ? value : {};
  return {
    ...EMPTY_OVERVIEW,
    ...input,
    dataset_name:
      typeof input.dataset_name === "string" && input.dataset_name.trim().length > 0
        ? input.dataset_name
        : fallbackName,
    type_counts: normalizeTypeCounts(input.type_counts),
    preview_rows: Array.isArray(input.preview_rows)
      ? input.preview_rows.filter((row): row is Record<string, unknown> => isRecord(row))
      : [],
  };
}

function normalizeSchema(value: unknown): AnalysisSchema {
  const input = isRecord(value) ? value : {};
  return {
    ...EMPTY_SCHEMA,
    ...input,
    type_counts: normalizeTypeCounts(input.type_counts),
    columns: Array.isArray(input.columns) ? input.columns : [],
    identifier_columns: Array.isArray(input.identifier_columns) ? input.identifier_columns : [],
    target_candidates: Array.isArray(input.target_candidates) ? input.target_candidates : [],
  };
}

function normalizeQuality(value: unknown): AnalysisQuality {
  const input = isRecord(value) ? value : {};
  return {
    ...EMPTY_QUALITY,
    ...input,
    missing_by_column: Array.isArray(input.missing_by_column) ? input.missing_by_column : [],
    constant_columns: Array.isArray(input.constant_columns) ? input.constant_columns : [],
    near_constant_columns: Array.isArray(input.near_constant_columns) ? input.near_constant_columns : [],
    high_cardinality_columns: Array.isArray(input.high_cardinality_columns)
      ? input.high_cardinality_columns
      : [],
    invalid_numeric_columns: Array.isArray(input.invalid_numeric_columns) ? input.invalid_numeric_columns : [],
    outlier_columns: Array.isArray(input.outlier_columns) ? input.outlier_columns : [],
    high_correlations: Array.isArray(input.high_correlations) ? input.high_correlations : [],
    recommendations: Array.isArray(input.recommendations) ? input.recommendations : [],
  };
}

function normalizeStatistics(value: unknown): AnalysisStatistics {
  const input = isRecord(value) ? value : {};
  return {
    ...EMPTY_STATISTICS,
    ...input,
    numeric_summary: Array.isArray(input.numeric_summary) ? input.numeric_summary : [],
    categorical_summary: Array.isArray(input.categorical_summary) ? input.categorical_summary : [],
    datetime_summary: Array.isArray(input.datetime_summary) ? input.datetime_summary : [],
    correlation_matrix: Array.isArray(input.correlation_matrix) ? input.correlation_matrix : [],
  };
}

function normalizeVisualisations(value: unknown): AnalysisVisualisations {
  const input = isRecord(value) ? value : {};
  return {
    ...EMPTY_VISUALISATIONS,
    ...input,
    missingness: Array.isArray(input.missingness) ? input.missingness : [],
    histograms: Array.isArray(input.histograms) ? input.histograms : [],
    boxplots: Array.isArray(input.boxplots) ? input.boxplots : [],
    top_categories: Array.isArray(input.top_categories) ? input.top_categories : [],
    correlation_heatmap: Array.isArray(input.correlation_heatmap) ? input.correlation_heatmap : [],
    pairwise_scatter: Array.isArray(input.pairwise_scatter) ? input.pairwise_scatter : [],
    drift_checks: Array.isArray(input.drift_checks) ? input.drift_checks : [],
  };
}

function normalizeInsights(value: unknown): AnalysisInsights {
  const input = isRecord(value) ? value : {};
  const modelingReadiness = isRecord(input.modeling_readiness) ? input.modeling_readiness : {};
  return {
    ...EMPTY_INSIGHTS,
    ...input,
    findings: Array.isArray(input.findings) ? input.findings : [],
    recommended_next_steps: Array.isArray(input.recommended_next_steps) ? input.recommended_next_steps : [],
    modeling_readiness: {
      ...EMPTY_INSIGHTS.modeling_readiness,
      ...modelingReadiness,
      target_candidates: Array.isArray(modelingReadiness.target_candidates)
        ? modelingReadiness.target_candidates
        : [],
    },
  };
}

function normalizeExperimentSummary(value: unknown): MlExperimentSummary {
  const input = isRecord(value) ? value : {};
  return {
    id: typeof input.id === "string" ? input.id : "",
    type: input.type === "supervised" ? "supervised" : "unsupervised",
    created_at: typeof input.created_at === "string" ? input.created_at : "",
    parameters: isRecord(input.parameters) ? input.parameters : {},
    summary: typeof input.summary === "string" ? input.summary : "ML experiment summary unavailable.",
    report_path: typeof input.report_path === "string" ? input.report_path : undefined,
    summary_path: typeof input.summary_path === "string" ? input.summary_path : undefined,
    download_url: typeof input.download_url === "string" ? input.download_url : undefined,
    summary_download_url: typeof input.summary_download_url === "string" ? input.summary_download_url : undefined,
    delete_url: typeof input.delete_url === "string" ? input.delete_url : undefined,
  };
}

function normalizeMlCapabilities(value: unknown): AnalysisMlCapabilities {
  const input = isRecord(value) ? value : {};
  const unsupervised = isRecord(input.unsupervised) ? input.unsupervised : {};
  const supervised = isRecord(input.supervised) ? input.supervised : {};

  return {
    unsupervised: {
      ...EMPTY_ML_CAPABILITIES.unsupervised,
      ...unsupervised,
    },
    supervised: {
      ...EMPTY_ML_CAPABILITIES.supervised,
      ...supervised,
      target_candidates: Array.isArray(supervised.target_candidates) ? supervised.target_candidates : [],
      target_recommendations: Array.isArray(supervised.target_recommendations)
        ? supervised.target_recommendations
        : [],
    },
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => typeof entryValue === "string")
      .map(([key, entryValue]) => [key, entryValue])
  ) as Record<string, string>;
}

function normalizeUnsupervisedResult(value: unknown): UnsupervisedResult {
  const input = isRecord(value) ? value : {};
  return {
    cluster_count: typeof input.cluster_count === "number" ? input.cluster_count : 0,
    cluster_distribution: Array.isArray(input.cluster_distribution) ? input.cluster_distribution : [],
    anomaly_count: typeof input.anomaly_count === "number" ? input.anomaly_count : 0,
    pca_explained_variance: Array.isArray(input.pca_explained_variance) ? input.pca_explained_variance : [],
    preview: Array.isArray(input.preview) ? input.preview : [],
    used_numeric_columns: Array.isArray(input.used_numeric_columns) ? input.used_numeric_columns : [],
    experiment: input.experiment ? normalizeExperimentSummary(input.experiment) : undefined,
  };
}

function normalizeSupervisedResult(value: unknown): SupervisedResult {
  const input = isRecord(value) ? value : {};
  const diagnostics = isRecord(input.diagnostics) ? input.diagnostics : {};
  return {
    task_type: typeof input.task_type === "string" ? input.task_type : "unknown",
    target_column: typeof input.target_column === "string" ? input.target_column : "",
    best_model: typeof input.best_model === "string" ? input.best_model : "",
    model_summary: typeof input.model_summary === "string" ? input.model_summary : "",
    diagnostics: {
      rows_available: typeof diagnostics.rows_available === "number" ? diagnostics.rows_available : 0,
      rows_used: typeof diagnostics.rows_used === "number" ? diagnostics.rows_used : 0,
      training_rows: typeof diagnostics.training_rows === "number" ? diagnostics.training_rows : 0,
      test_rows: typeof diagnostics.test_rows === "number" ? diagnostics.test_rows : 0,
      numeric_features: typeof diagnostics.numeric_features === "number" ? diagnostics.numeric_features : 0,
      categorical_features:
        typeof diagnostics.categorical_features === "number" ? diagnostics.categorical_features : 0,
      high_cardinality_features:
        typeof diagnostics.high_cardinality_features === "number" ? diagnostics.high_cardinality_features : 0,
      sampling_applied: Boolean(diagnostics.sampling_applied),
      target_cardinality: typeof diagnostics.target_cardinality === "number" ? diagnostics.target_cardinality : 0,
    },
    warnings: Array.isArray(input.warnings) ? input.warnings.filter((item): item is string => typeof item === "string") : [],
    model_comparison: Array.isArray(input.model_comparison) ? input.model_comparison : [],
    metric_explanations: normalizeStringRecord(input.metric_explanations),
    target_recommendation: input.target_recommendation
      ? (input.target_recommendation as SupervisedResult["target_recommendation"])
      : undefined,
    feature_importance: Array.isArray(input.feature_importance) ? input.feature_importance : [],
    target_feature_slices: Array.isArray(input.target_feature_slices) ? input.target_feature_slices : [],
    predictions_preview: Array.isArray(input.predictions_preview) ? input.predictions_preview : [],
    experiment: input.experiment ? normalizeExperimentSummary(input.experiment) : undefined,
  };
}

function normalizeMlExperimentDetail(value: unknown): MlExperimentDetail {
  const input = isRecord(value) ? value : {};
  const experimentType = input.experiment_type === "supervised" ? "supervised" : "unsupervised";

  return {
    analysis_id: typeof input.analysis_id === "number" ? input.analysis_id : 0,
    experiment_id: typeof input.experiment_id === "string" ? input.experiment_id : "",
    experiment_type: experimentType,
    created_at: typeof input.created_at === "string" ? input.created_at : "",
    parameters: isRecord(input.parameters) ? input.parameters : {},
    summary: typeof input.summary === "string" ? input.summary : "ML experiment summary unavailable.",
    result:
      experimentType === "supervised"
        ? normalizeSupervisedResult(input.result)
        : normalizeUnsupervisedResult(input.result),
    report_path: typeof input.report_path === "string" ? input.report_path : undefined,
    summary_path: typeof input.summary_path === "string" ? input.summary_path : undefined,
  };
}

function normalizeMlResults(value: unknown): AnalysisReport["ml_results"] {
  const input = isRecord(value) ? value : {};
  return {
    unsupervised: input.unsupervised ? normalizeUnsupervisedResult(input.unsupervised) : undefined,
    supervised: input.supervised ? normalizeSupervisedResult(input.supervised) : undefined,
  };
}

function normalizeAnalysisListItem(value: unknown): AnalysisListItem {
  const input = isRecord(value) ? value : {};
  const displayName = typeof input.display_name === "string" ? input.display_name : "";
  const sourceFilename = typeof input.source_filename === "string" ? input.source_filename : "";
  const savedAt = typeof input.saved_at === "string" ? input.saved_at : "";
  const experimentCount = typeof input.experiment_count === "number" ? input.experiment_count : 0;
  const latestExperiment = input.latest_experiment ? normalizeExperimentSummary(input.latest_experiment) : null;
  const fallbackName = displayName || sourceFilename || "Untitled dataset";

  return {
    id: typeof input.id === "number" ? input.id : 0,
    display_name: displayName || fallbackName,
    source_filename: sourceFilename,
    status: typeof input.status === "string" ? input.status : "unknown",
    saved_at: savedAt,
    overview: normalizeOverview(input.overview, fallbackName),
    insights: normalizeInsights(input.insights),
    experiment_count: experimentCount,
    latest_experiment: latestExperiment,
  };
}

function normalizeAnalysisReport(value: unknown): AnalysisReport {
  const input = isRecord(value) ? value : {};
  const analysisId = typeof input.analysis_id === "number" ? input.analysis_id : 0;
  const displayName = typeof input.display_name === "string" ? input.display_name : undefined;
  const sourceFilename = typeof input.source_filename === "string" ? input.source_filename : undefined;
  const savedAt = typeof input.saved_at === "string" ? input.saved_at : undefined;
  const fallbackName = displayName || sourceFilename || (analysisId ? `Dataset ${analysisId}` : EMPTY_OVERVIEW.dataset_name);

  return {
    ...EMPTY_REPORT,
    ...input,
    analysis_id: analysisId,
    display_name: displayName,
    source_filename: sourceFilename,
    saved_at: savedAt,
    analysis_version: typeof input.analysis_version === "string" ? input.analysis_version : EMPTY_REPORT.analysis_version,
    overview: normalizeOverview(input.overview, fallbackName),
    schema: normalizeSchema(input.schema),
    quality: normalizeQuality(input.quality),
    statistics: normalizeStatistics(input.statistics),
    visualisations: normalizeVisualisations(input.visualisations),
    insights: normalizeInsights(input.insights),
    ml_capabilities: normalizeMlCapabilities(input.ml_capabilities),
    ml_results: normalizeMlResults(input.ml_results),
    ml_experiments: Array.isArray(input.ml_experiments)
      ? input.ml_experiments.map((experiment) => normalizeExperimentSummary(experiment))
      : [],
    report_path: typeof input.report_path === "string" ? input.report_path : undefined,
    download_url: typeof input.download_url === "string" ? input.download_url : undefined,
  };
}

export const MISSING_ANALYSIS_SOURCE_ERROR_DETAIL =
  "The original CSV for this saved run is no longer available on the server. Re-upload the dataset to run ML again.";

export function isMissingAnalysisSourceError(message: string) {
  return message.includes(MISSING_ANALYSIS_SOURCE_ERROR_DETAIL);
}

function resolveAnalysisError(response: Response, payload: unknown, fallback: string) {
  const detail = typeof payload === "object" && payload && "detail" in payload ? String(payload.detail) : "";

  if (response.status === 404 && detail === "Not Found") {
    return "Analysis API route not found. Make sure the backend with the analysis endpoints is the one currently running or deployed.";
  }

  if (response.status === 404 && detail) {
    return detail;
  }

  return detail || fallback;
}

async function downloadBlob(url: string, filename: string) {
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    throw new Error(resolveAnalysisError(response, payload, "Download failed."));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function getAnalyses(): Promise<AnalysisListItem[]> {
  const cacheKey = getAnalysisCacheKey();
  const cachedValue = readCachedAnalysisValue(cachedAnalyses, cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  if (analysesRequest?.cacheKey === cacheKey) {
    return analysesRequest.promise;
  }

  const request = (async () => {
    const response = await fetchWithAuth(`${API_BASE_URL}/analysis`, {
      cache: "no-store",
      suppressAuthRedirect: true,
    });
    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(resolveAnalysisError(response, payload, "Failed to load analysis history."));
    }

    const normalized = Array.isArray(payload)
      ? payload.map((item) => normalizeAnalysisListItem(item))
      : [];
    cachedAnalyses = storeCachedAnalysisValue(normalized);
    return normalized;
  })();

  analysesRequest = { cacheKey, promise: request };

  try {
    return await request;
  } finally {
    if (analysesRequest?.promise === request) {
      analysesRequest = null;
    }
  }
}

export async function getAnalysisById(id: number | string): Promise<AnalysisReport> {
  const reportKey = String(id);
  const cacheKey = getAnalysisCacheKey();
  const cachedValue = readCachedAnalysisValue(cachedReports.get(reportKey), cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const inFlightRequest = reportRequests.get(reportKey);
  if (inFlightRequest?.cacheKey === cacheKey) {
    return inFlightRequest.promise;
  }

  const request = (async () => {
    const response = await fetchWithAuth(`${API_BASE_URL}/analysis/${id}`, {
      cache: "no-store",
    });
    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(resolveAnalysisError(response, payload, "Failed to load analysis."));
    }

    const normalized = normalizeAnalysisReport(payload);
    cachedReports.set(reportKey, storeCachedAnalysisValue(normalized));
    return normalized;
  })();

  reportRequests.set(reportKey, { cacheKey, promise: request });

  try {
    return await request;
  } finally {
    if (reportRequests.get(reportKey)?.promise === request) {
      reportRequests.delete(reportKey);
    }
  }
}

export async function uploadAnalysisCsv(file: File): Promise<AnalysisReport> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`${API_BASE_URL}/analysis/upload`, {
    method: "POST",
    body: formData,
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to upload dataset."));
  }
  invalidateAnalysisCache();
  return normalizeAnalysisReport(payload);
}

export async function runUnsupervisedAnalysis(
  id: number | string,
  nClusters: number
): Promise<UnsupervisedResult> {
  const response = await fetchWithAuth(`${API_BASE_URL}/analysis/${id}/ml/unsupervised`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ n_clusters: nClusters }),
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to run unsupervised analysis."));
  }
  invalidateAnalysisCache(id);
  return normalizeUnsupervisedResult(payload);
}

export async function runSupervisedAnalysis(
  id: number | string,
  targetColumn: string
): Promise<SupervisedResult> {
  const response = await fetchWithAuth(`${API_BASE_URL}/analysis/${id}/ml/supervised`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target_column: targetColumn }),
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to run supervised analysis."));
  }
  invalidateAnalysisCache(id);
  return normalizeSupervisedResult(payload);
}

export async function deleteAnalysis(id: number | string): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE_URL}/analysis/${id}`, {
    method: "DELETE",
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to delete saved run."));
  }

  invalidateAnalysisCache(id);
}

export async function deleteAllAnalyses(): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE_URL}/analysis`, {
    method: "DELETE",
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to clear saved runs."));
  }

  invalidateAnalysisCache();
}

export async function deleteMlExperiment(
  analysisId: number | string,
  experiment: MlExperimentSummary | string
): Promise<void> {
  const experimentId = typeof experiment === "string" ? experiment : experiment.id;
  const deletePath = typeof experiment === "string" ? null : experiment.delete_url;
  const url = deletePath ? `${API_BASE_URL}${deletePath}` : `${API_BASE_URL}/analysis/${analysisId}/ml/experiments/${experimentId}`;

  const response = await fetchWithAuth(url, {
    method: "DELETE",
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to delete saved ML run."));
  }

  invalidateAnalysisCache(analysisId);
}

export async function getMlExperimentDetail(
  analysisId: number | string,
  experimentId: string
): Promise<MlExperimentDetail> {
  const response = await fetchWithAuth(`${API_BASE_URL}/analysis/${analysisId}/ml/experiments/${experimentId}`, {
    cache: "no-store",
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(resolveAnalysisError(response, payload, "Failed to load ML experiment."));
  }
  return normalizeMlExperimentDetail(payload);
}

function getAnalysisDownloadUrl(id: number | string) {
  return `${API_BASE_URL}/analysis/${id}/download`;
}

export async function downloadAnalysisReport(id: number | string): Promise<void> {
  await downloadBlob(getAnalysisDownloadUrl(id), `analysis_${id}.txt`);
}

export async function downloadMlExperimentReport(
  analysisId: number | string,
  experiment: MlExperimentSummary
): Promise<void> {
  const url = experiment.download_url
    ? `${API_BASE_URL}${experiment.download_url}`
    : `${API_BASE_URL}/analysis/${analysisId}/ml/experiments/${experiment.id}/download`;
  await downloadBlob(url, `analysis_${analysisId}_${experiment.id}.txt`);
}

export async function downloadMlExperimentSummary(
  analysisId: number | string,
  experiment: MlExperimentSummary
): Promise<void> {
  const url = experiment.summary_download_url
    ? `${API_BASE_URL}${experiment.summary_download_url}`
    : `${API_BASE_URL}/analysis/${analysisId}/ml/experiments/${experiment.id}/summary`;
  await downloadBlob(url, `analysis_${analysisId}_${experiment.id}_summary.txt`);
}