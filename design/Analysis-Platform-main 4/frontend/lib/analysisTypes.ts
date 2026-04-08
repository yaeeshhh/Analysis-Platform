type AnalysisTypeCounts = {
  numeric: number;
  categorical: number;
  boolean: number;
  datetime: number;
  text: number;
  unknown: number;
};

export type AnalysisOverview = {
  dataset_name: string;
  row_count: number;
  column_count: number;
  encoding: string;
  duplicate_row_count: number;
  total_missing_values: number;
  type_counts: Partial<AnalysisTypeCounts>;
  preview_rows: Record<string, unknown>[];
};

type SchemaColumnProfile = {
  name: string;
  inferred_type: string;
  semantic_type?: string;
  semantic_confidence?: number;
  likely_role: string;
  non_null_count: number;
  non_null_pct: number;
  missing_count: number;
  missing_pct: number;
  unique_count: number;
  unique_pct: number;
  sample_values: string[];
};

export type AnalysisSchema = {
  row_count: number;
  column_count: number;
  type_counts: Partial<AnalysisTypeCounts>;
  columns: SchemaColumnProfile[];
  identifier_columns: string[];
  target_candidates: string[];
};

export type AnalysisQuality = {
  duplicate_row_count: number;
  missing_by_column: Array<{
    column: string;
    missing_count: number;
    missing_pct: number;
  }>;
  constant_columns: string[];
  near_constant_columns: Array<{
    column: string;
    dominant_value_ratio: number;
  }>;
  high_cardinality_columns: Array<{
    column: string;
    unique_count: number;
    unique_pct: number;
  }>;
  invalid_numeric_columns: Array<{
    column: string;
    numeric_parse_ratio: number;
  }>;
  outlier_columns: Array<{
    column: string;
    outlier_count: number;
    outlier_pct: number;
  }>;
  high_correlations: Array<{
    column_a: string;
    column_b: string;
    correlation: number;
  }>;
  quality_score: number;
  recommendations: string[];
};

export type AnalysisStatistics = {
  numeric_summary: Array<{
    column: string;
    count: number;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    skew: number;
  }>;
  categorical_summary: Array<{
    column: string;
    unique_count: number;
    top_values: Array<{
      value: string;
      count: number;
      pct: number;
    }>;
  }>;
  datetime_summary: Array<{
    column: string;
    min: string;
    max: string;
    span_days: number;
  }>;
  correlation_matrix: Array<{
    x: string;
    y: string;
    value: number;
  }>;
};

export type AnalysisVisualisations = {
  missingness: Array<{
    column: string;
    missing_pct: number;
    missing_count: number;
  }>;
  histograms: Array<{
    column: string;
    bins: Array<{
      start: number;
      end: number;
      count: number;
    }>;
  }>;
  boxplots: Array<{
    column: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outlier_count: number;
  }>;
  top_categories: Array<{
    column: string;
    values: Array<{
      label: string;
      count: number;
    }>;
  }>;
  correlation_heatmap: Array<{
    x: string;
    y: string;
    value: number;
  }>;
  pairwise_scatter: Array<{
    x: string;
    y: string;
    correlation: number;
    points: Array<{
      row: number;
      x: number;
      y: number;
    }>;
  }>;
  drift_checks: Array<{
    column: string;
    kind: string;
    baseline_label: string;
    recent_label: string;
    baseline_value?: number;
    recent_value?: number;
    delta_pct?: number;
    baseline_top?: string;
    recent_top?: string;
    baseline_share?: number;
    recent_share?: number;
    change_score: number;
  }>;
};

export type AnalysisInsights = {
  summary: string;
  findings: string[];
  recommended_next_steps: string[];
  modeling_readiness: {
    is_ready: boolean;
    target_candidates: string[];
  };
};

export type TargetRecommendation = {
  column: string;
  recommended_task: string;
  verdict: string;
  score: number;
  reasons: string[];
};

export type MlExperimentSummary = {
  id: string;
  type: "unsupervised" | "supervised";
  created_at: string;
  parameters: Record<string, unknown>;
  summary: string;
  report_path?: string;
  summary_path?: string;
  download_url?: string;
  summary_download_url?: string;
  delete_url?: string;
};

export type MlExperimentDetail = {
  analysis_id: number;
  experiment_id: string;
  experiment_type: "unsupervised" | "supervised";
  created_at: string;
  parameters: Record<string, unknown>;
  summary: string;
  result: UnsupervisedResult | SupervisedResult;
  report_path?: string;
  summary_path?: string;
};

export type AnalysisMlCapabilities = {
  unsupervised: {
    available: boolean;
    reason: string;
  };
  supervised: {
    available: boolean;
    reason: string;
    target_candidates: string[];
    target_recommendations: TargetRecommendation[];
  };
};

export type UnsupervisedResult = {
  cluster_count: number;
  cluster_distribution: Array<{
    cluster: number;
    count: number;
  }>;
  anomaly_count: number;
  pca_explained_variance: number[];
  preview: Array<{
    row: number;
    cluster: number;
    anomaly_flag: boolean;
    anomaly_score: number;
    pc1: number;
    pc2: number;
    record: Record<string, unknown>;
  }>;
  used_numeric_columns: string[];
  experiment?: MlExperimentSummary;
};

type TargetFeatureSlice = {
  feature: string;
  feature_type: string;
  summary: string;
  rows: Array<{
    label: string;
    count: number;
    target_label: string;
    target_value: number;
    target_class?: string;
  }>;
};

type SupervisedDiagnostics = {
  rows_available: number;
  rows_used: number;
  training_rows: number;
  test_rows: number;
  numeric_features: number;
  categorical_features: number;
  high_cardinality_features: number;
  sampling_applied: boolean;
  target_cardinality: number;
};

export type SupervisedResult = {
  task_type: string;
  target_column: string;
  best_model: string;
  model_summary: string;
  diagnostics: SupervisedDiagnostics;
  warnings: string[];
  model_comparison: Array<{
    model: string;
    metrics: Record<string, number>;
  }>;
  metric_explanations: Record<string, string>;
  target_recommendation?: TargetRecommendation;
  feature_importance: Array<{
    feature: string;
    importance: number;
  }>;
  target_feature_slices: TargetFeatureSlice[];
  predictions_preview: Array<{
    record: Record<string, unknown>;
    actual: unknown;
    prediction: unknown;
  }>;
  experiment?: MlExperimentSummary;
};

export type AnalysisReport = {
  analysis_id: number;
  display_name?: string | null;
  source_filename?: string;
  saved_at?: string;
  analysis_version: string;
  overview: AnalysisOverview;
  schema: AnalysisSchema;
  quality: AnalysisQuality;
  statistics: AnalysisStatistics;
  visualisations: AnalysisVisualisations;
  insights: AnalysisInsights;
  ml_capabilities: AnalysisMlCapabilities;
  ml_results: {
    unsupervised?: UnsupervisedResult;
    supervised?: SupervisedResult;
  };
  ml_experiments: MlExperimentSummary[];
  report_path?: string;
  download_url?: string;
};

export type AnalysisListItem = {
  id: number;
  display_name: string;
  source_filename: string;
  saved_at: string;
  experiment_count: number;
  latest_experiment?: MlExperimentSummary | null;
  status: string;
  overview: AnalysisOverview;
  insights: AnalysisInsights;
};