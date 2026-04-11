import {
  AnalysisInsights,
  AnalysisOverview,
  AnalysisQuality,
  AnalysisSchema,
  AnalysisStatistics,
  AnalysisVisualisations,
  SupervisedResult,
  UnsupervisedResult,
} from "./analysisTypes";

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatChartNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function getTypeMix(schema: AnalysisSchema) {
  return Object.entries(schema.type_counts || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([label, count]) => ({
      label,
      count: Number(count || 0),
      pct: schema.column_count > 0 ? (Number(count || 0) / schema.column_count) * 100 : 0,
    }));
}

export function calculateQualityScore(overview: AnalysisOverview, quality: AnalysisQuality) {
  const rowCount = Math.max(1, overview.row_count);
  const columnCount = Math.max(1, overview.column_count);
  const numericColumnCount = Math.max(0, overview.type_counts.numeric ?? 0);
  const maxMissingPct = Math.max(0, ...quality.missing_by_column.map((item) => item.missing_pct));
  const totalMissingPct = overview.total_missing_values / (rowCount * columnCount);
  const duplicatePct = quality.duplicate_row_count / rowCount;
  const outlierColumnShare = numericColumnCount > 0 ? quality.outlier_columns.length / numericColumnCount : 0;
  const meanOutlierPct =
    quality.outlier_columns.length > 0
      ? quality.outlier_columns.reduce((sum, item) => sum + item.outlier_pct, 0) / quality.outlier_columns.length
      : 0;
  const invalidNumericPenalty = Math.min(
    quality.invalid_numeric_columns.reduce((sum, item) => sum + (1 - item.numeric_parse_ratio) * 6, 0),
    12,
  );

  const penalties = [
    maxMissingPct * 25 + totalMissingPct * 20,
    Math.min(duplicatePct * 40, 20),
    Math.min(quality.constant_columns.length * 8, 16),
    Math.min(quality.near_constant_columns.length * 1.5, 12),
    Math.min(quality.high_cardinality_columns.length * 2, 12),
    invalidNumericPenalty,
    Math.min(outlierColumnShare * 12 + meanOutlierPct * 20, 20),
    Math.min(quality.high_correlations.length * 4, 12),
  ];

  return Math.max(0, Math.min(100, 100 - penalties.reduce((sum, value) => sum + value, 0)));
}

export function getDatasetPosture(
  overview: AnalysisOverview,
  schema: AnalysisSchema,
  quality: AnalysisQuality,
  insights: AnalysisInsights
) {
  const qualityScore = calculateQualityScore(overview, quality);
  const density =
    overview.row_count * overview.column_count > 0
      ? 100 - (overview.total_missing_values / (overview.row_count * overview.column_count)) * 100
      : 100;

  const widthLabel =
    overview.column_count >= 40 ? "Wide dataset" : overview.column_count >= 15 ? "Balanced shape" : "Compact table";
  const targetLabel =
    schema.target_candidates.length > 0
      ? `${schema.target_candidates.length} target candidate${schema.target_candidates.length === 1 ? "" : "s"}`
      : "No clear target inferred";

  return [
    {
      title: widthLabel,
      detail: `${overview.row_count.toLocaleString()} rows by ${overview.column_count.toLocaleString()} columns`,
    },
    {
      title: `Density ${formatPercent(Math.max(0, density), 1)}`,
      detail: `${overview.total_missing_values.toLocaleString()} missing cells across the dataset`,
    },
    {
      title: targetLabel,
      detail: insights.modeling_readiness.is_ready ? "Looks ready for ML if you want to try it." : "Start by reviewing and cleaning the data.",
    },
    {
      title: `Quality score ${qualityScore.toFixed(1)}`,
      detail: quality.duplicate_row_count > 0 ? `${quality.duplicate_row_count.toLocaleString()} duplicate rows flagged` : "No duplicate rows detected",
    },
  ];
}

export function getStrongestCorrelations(statistics: AnalysisStatistics, limit = 8) {
  const seen = new Set<string>();
  return statistics.correlation_matrix
    .filter((item) => item.x !== item.y)
    .filter((item) => {
      const key = [item.x, item.y].sort().join("::");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
}

export function getSkewedFields(statistics: AnalysisStatistics, limit = 6) {
  return statistics.numeric_summary
    .filter((item) => Math.abs(item.skew) >= 1)
    .sort((a, b) => Math.abs(b.skew) - Math.abs(a.skew))
    .slice(0, limit);
}

export function getDominantCategories(statistics: AnalysisStatistics, limit = 6) {
  return statistics.categorical_summary
    .map((item) => ({
      column: item.column,
      unique_count: item.unique_count,
      top: item.top_values[0],
    }))
    .filter((item) => item.top)
    .sort((a, b) => Number(b.top?.pct || 0) - Number(a.top?.pct || 0))
    .slice(0, limit);
}

export function getVisualStory(visualisations: AnalysisVisualisations) {
  return {
    missingColumns: (visualisations.missingness || []).slice(0, 6),
    histogram: visualisations.histograms?.[0],
    category: visualisations.top_categories?.[0],
    boxplots: (visualisations.boxplots || []).slice(0, 6),
    correlationCells: visualisations.correlation_heatmap || [],
    pairwiseScatter: (visualisations.pairwise_scatter || []).slice(0, 4),
    driftChecks: (visualisations.drift_checks || []).slice(0, 8),
  };
}

export function getVisualNarratives(visualisations: AnalysisVisualisations) {
  const story = getVisualStory(visualisations);
  const correlationPairs = new Map<string, { x: string; y: string; value: number }>();

  story.correlationCells.forEach((cell) => {
    if (cell.x === cell.y) return;
    const key = [cell.x, cell.y].sort().join("::");
    if (!correlationPairs.has(key)) {
      correlationPairs.set(key, cell);
    }
  });

  const uniqueCorrelations = [...correlationPairs.values()];
  const strongestPositive = [...uniqueCorrelations]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)[0];
  const strongestNegative = [...uniqueCorrelations]
    .filter((item) => item.value < 0)
    .sort((left, right) => left.value - right.value)[0];
  const strongestScatter = [...story.pairwiseScatter].sort(
    (left, right) => Math.abs(right.correlation) - Math.abs(left.correlation)
  )[0];
  const strongestDrift = [...story.driftChecks].sort(
    (left, right) => right.change_score - left.change_score
  )[0];
  const dominantCategory = story.category
    ? [...story.category.values].sort((left, right) => right.count - left.count)[0]
    : null;
  const totalCategoryCount = story.category
    ? story.category.values.reduce((sum, item) => sum + item.count, 0)
    : 0;
  const densestBin = story.histogram
    ? [...story.histogram.bins].sort((left, right) => right.count - left.count)[0]
    : null;
  const topMissingColumn = [...story.missingColumns].sort(
    (left, right) => right.missing_pct - left.missing_pct
  )[0];
  const mostOutlierHeavy = [...story.boxplots].sort(
    (left, right) => right.outlier_count - left.outlier_count
  )[0];

  return {
    missingness: topMissingColumn
      ? `${topMissingColumn.column} has the highest missing share at ${topMissingColumn.missing_pct.toFixed(1)}%, so cleanup effort is concentrated there first.`
      : "No missing-value chart was produced because the saved run did not flag notable missingness.",
    histogram: densestBin && story.histogram
      ? `The ${story.histogram.column} distribution is most concentrated between ${densestBin.start.toFixed(2)} and ${densestBin.end.toFixed(2)}, which marks where the bulk of rows sit.`
      : "No numeric histogram was available for this run.",
    category: dominantCategory && story.category
      ? `${story.category.column} is led by ${dominantCategory.label} with ${dominantCategory.count.toLocaleString()} rows, or ${totalCategoryCount > 0 ? ((dominantCategory.count / totalCategoryCount) * 100).toFixed(1) : "0.0"}% of the displayed categories.`
      : "No categorical distribution was available for this run.",
    boxplots: mostOutlierHeavy
      ? `${mostOutlierHeavy.column} shows the heaviest outlier pressure with ${mostOutlierHeavy.outlier_count.toLocaleString()} flagged points across its spread.`
      : "No numeric boxplot summaries were available.",
    correlationHeatmap: strongestPositive || strongestNegative
      ? strongestPositive && strongestNegative
        ? `The strongest positive relationship is ${strongestPositive.x} vs ${strongestPositive.y} at ${strongestPositive.value.toFixed(2)}, while the strongest inverse relationship is ${strongestNegative.x} vs ${strongestNegative.y} at ${strongestNegative.value.toFixed(2)}.`
        : strongestPositive
          ? `The strongest visible relationship is a positive link between ${strongestPositive.x} and ${strongestPositive.y} at ${strongestPositive.value.toFixed(2)}.`
          : `The strongest visible relationship is an inverse link between ${strongestNegative!.x} and ${strongestNegative!.y} at ${strongestNegative!.value.toFixed(2)}.`
      : "Not enough numeric features were present to build a meaningful heatmap.",
    pairwiseScatter: strongestScatter
      ? `${strongestScatter.x} vs ${strongestScatter.y} has the clearest scatter pattern here with correlation ${strongestScatter.correlation.toFixed(3)}.`
      : "No pairwise scatter plots were available because the run did not find enough usable numeric pairs.",
    driftChecks: strongestDrift
      ? strongestDrift.kind === "numeric"
        ? `${strongestDrift.column} shows the largest numeric shift, moving from ${Number(strongestDrift.baseline_value || 0).toFixed(2)} to ${Number(strongestDrift.recent_value || 0).toFixed(2)}.`
        : `${strongestDrift.column} shows the strongest categorical drift, shifting from ${strongestDrift.baseline_top} to ${strongestDrift.recent_top} as the dominant category.`
      : "No drift comparison was produced for this dataset.",
  };
}

export function getVisualGuides(visualisations: AnalysisVisualisations) {
  const story = getVisualStory(visualisations);
  const correlationPairs = new Map<string, { x: string; y: string; value: number }>();

  story.correlationCells.forEach((cell) => {
    if (cell.x === cell.y) return;
    const key = [cell.x, cell.y].sort().join("::");
    if (!correlationPairs.has(key)) {
      correlationPairs.set(key, cell);
    }
  });

  const uniqueCorrelations = [...correlationPairs.values()];
  const strongestPositive = [...uniqueCorrelations]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)[0];
  const strongestNegative = [...uniqueCorrelations]
    .filter((item) => item.value < 0)
    .sort((left, right) => left.value - right.value)[0];
  const strongestScatter = [...story.pairwiseScatter].sort(
    (left, right) => Math.abs(right.correlation) - Math.abs(left.correlation)
  )[0];
  const strongestDrift = [...story.driftChecks].sort(
    (left, right) => right.change_score - left.change_score
  )[0];
  const topMissingColumn = [...story.missingColumns].sort(
    (left, right) => right.missing_pct - left.missing_pct
  )[0];
  const lightestMissingColumn = [...story.missingColumns].sort(
    (left, right) => left.missing_pct - right.missing_pct
  )[0];
  const histogramTotal = story.histogram
    ? story.histogram.bins.reduce((sum, item) => sum + item.count, 0)
    : 0;
  const densestBin = story.histogram
    ? [...story.histogram.bins].sort((left, right) => right.count - left.count)[0]
    : null;
  const firstHistogramBin = story.histogram?.bins[0] ?? null;
  const lastHistogramBin = story.histogram?.bins[story.histogram.bins.length - 1] ?? null;
  const dominantCategory = story.category
    ? [...story.category.values].sort((left, right) => right.count - left.count)[0]
    : null;
  const runnerUpCategory = story.category
    ? [...story.category.values].sort((left, right) => right.count - left.count)[1] ?? null
    : null;
  const totalCategoryCount = story.category
    ? story.category.values.reduce((sum, item) => sum + item.count, 0)
    : 0;
  const mostOutlierHeavy = [...story.boxplots].sort(
    (left, right) => right.outlier_count - left.outlier_count
  )[0];
  const widestBoxplot = [...story.boxplots].sort(
    (left, right) => (right.max - right.min) - (left.max - left.min)
  )[0];
  const heatmapColumns = Array.from(new Set(story.correlationCells.map((item) => item.x)));

  return {
    missingness: topMissingColumn
      ? {
          description: `${story.missingColumns.length} plotted column${story.missingColumns.length === 1 ? "" : "s"} show missingness, led by ${topMissingColumn.column} with ${topMissingColumn.missing_count.toLocaleString()} empty cells (${formatPercent(topMissingColumn.missing_pct)}).${lightestMissingColumn && lightestMissingColumn.column !== topMissingColumn.column ? ` ${lightestMissingColumn.column} is the lightest plotted column at ${formatPercent(lightestMissingColumn.missing_pct)}.` : ""}`,
          reason:
            topMissingColumn.missing_pct >= 20
              ? `${topMissingColumn.column} is missing often enough to change row usability, so it should be cleaned before trusting comparisons or modeling.`
              : `Missingness is visible but still localized, so cleanup only needs to focus on ${topMissingColumn.column} rather than the whole dataset.`,
        }
      : {
          description: "No columns had enough missing values to show a chart.",
          reason: "That usually means missing data isn't the main concern — focus on distributions, relationships, or outliers instead.",
        },
    histogram: densestBin && story.histogram && firstHistogramBin && lastHistogramBin
      ? {
          description: `${story.histogram.column} spans ${formatChartNumber(firstHistogramBin.start)} to ${formatChartNumber(lastHistogramBin.end)} across ${story.histogram.bins.length} buckets, with the busiest bucket holding ${densestBin.count.toLocaleString()} rows between ${formatChartNumber(densestBin.start)} and ${formatChartNumber(densestBin.end)}.`,
          reason:
            histogramTotal > 0 && densestBin.count / histogramTotal >= 0.3
              ? `A large share of rows sit in one narrow band, so values outside that range will stand out in comparisons.`
              : `The counts are spread across multiple buckets, which means this field shows meaningful variation across the dataset.`,
        }
      : {
          description: "No numeric column was available to chart a histogram.",
          reason: "Without a suitable numeric column, check the summary statistics and boxplot for distribution details.",
        },
    category: dominantCategory && story.category
      ? {
          description: `${story.category.column} shows ${story.category.values.length} leading categories. ${dominantCategory.label} is the largest group at ${dominantCategory.count.toLocaleString()} rows${runnerUpCategory ? `, followed by ${runnerUpCategory.label} at ${runnerUpCategory.count.toLocaleString()}` : ""}.`,
          reason:
            totalCategoryCount > 0 && dominantCategory.count / totalCategoryCount >= 0.4
              ? `${dominantCategory.label} carries enough share to steer group-level averages, so minority categories should be checked separately before drawing broad conclusions.`
              : `The visible categories are comparatively balanced, which makes category-level comparisons more trustworthy and less likely to be dominated by a single label.`,
        }
      : {
          description: "No categorical distribution chart was generated for this run.",
          reason: "That usually means the dataset didn't have a categorical column with enough distinct values for a chart.",
        },
    boxplots: mostOutlierHeavy
      ? {
          description: `${mostOutlierHeavy.column} carries the most outliers at ${mostOutlierHeavy.outlier_count.toLocaleString()} points.${widestBoxplot ? ` ${widestBoxplot.column} also spans the widest visible range, from ${formatChartNumber(widestBoxplot.min)} to ${formatChartNumber(widestBoxplot.max)}.` : ""}`,
          reason:
            mostOutlierHeavy.outlier_count >= 20
              ? `This many outliers can shift averages significantly — consider reviewing these rows or adjusting the data before modeling.`
              : `Outliers are present but still relatively contained, so this chart highlights which columns to review before modeling.`,
        }
      : {
          description: "No numeric columns had enough data for a boxplot.",
          reason: "Check the statistics and histogram sections for numeric detail instead.",
        },
    correlationHeatmap: strongestPositive || strongestNegative
      ? {
          description: `The heatmap compares ${heatmapColumns.length} numeric field${heatmapColumns.length === 1 ? "" : "s"}.${strongestPositive ? ` The strongest positive pair is ${strongestPositive.x} vs ${strongestPositive.y} at ${strongestPositive.value.toFixed(2)}.` : ""}${strongestNegative ? ` The strongest inverse pair is ${strongestNegative.x} vs ${strongestNegative.y} at ${strongestNegative.value.toFixed(2)}.` : ""}`,
          reason:
            Math.max(Math.abs(strongestPositive?.value || 0), Math.abs(strongestNegative?.value || 0)) >= 0.9
              ? `At least one pair of columns is so closely related that it may add overlapping information to a model.`
              : `The visible relationships are informative without being near-duplicates, so they reveal patterns without suggesting overlapping columns.`,
        }
      : {
          description: "Not enough numeric structure was available to generate a correlation heatmap.",
          reason: "This dataset doesn't have enough numeric columns for a correlation chart — review column types and categories instead.",
        },
    pairwiseScatter: strongestScatter
      ? {
          description: `${strongestScatter.x} vs ${strongestScatter.y} is the clearest scatter view, using ${strongestScatter.points.length.toLocaleString()} plotted rows with correlation ${strongestScatter.correlation.toFixed(3)}.`,
          reason:
            Math.abs(strongestScatter.correlation) >= 0.85
              ? `That relationship is strong enough that the scatter plot can show whether the pattern is consistent or driven by a few unusual points.`
              : `The relationship is present but not rigid, so the scatter plot is useful for spotting groupings and exceptions that a single number would miss.`,
        }
      : {
          description: "No pairwise scatter chart was available because the run did not find a usable numeric pair to plot.",
          reason: "Without a clear numeric pair, focus on the summaries, relationships, and category breakdowns instead.",
        },
    driftChecks: strongestDrift
      ? {
          description:
            strongestDrift.kind === "numeric"
              ? `${strongestDrift.column} shows the largest ordered shift, moving from ${formatChartNumber(Number(strongestDrift.baseline_value || 0))} in ${strongestDrift.baseline_label} to ${formatChartNumber(Number(strongestDrift.recent_value || 0))} in ${strongestDrift.recent_label}.`
              : `${strongestDrift.column} shows the clearest ordered category change, shifting from ${strongestDrift.baseline_top} in ${strongestDrift.baseline_label} to ${strongestDrift.recent_top} in ${strongestDrift.recent_label}.`,
          reason:
            strongestDrift.change_score >= 0.25
              ? `The earlier and later slices diverge enough to warrant checking whether the file combines data from different time periods or sources.`
              : `The shift is noticeable but not extreme, so it's worth noting for context but not strong enough to indicate a major change in the data.`,
        }
      : {
          description: "No time-based comparison was available for this dataset.",
          reason: "That usually means the dataset is too small or too consistent for a meaningful comparison.",
        },
  };
}

export function getTopAnomalies(result?: UnsupervisedResult, limit = 6) {
  if (!result) return [];
  return [...result.preview]
    .sort((a, b) => Number(a.anomaly_score) - Number(b.anomaly_score))
    .slice(0, limit);
}

export function getTopClusters(result?: UnsupervisedResult) {
  if (!result) return [];
  return [...result.cluster_distribution].sort((a, b) => b.count - a.count);
}

export function getTopFeatures(result?: SupervisedResult, limit = 10) {
  if (!result) return [];
  return result.feature_importance.slice(0, limit);
}

export function getUnsupervisedNarratives(result?: UnsupervisedResult) {
  if (!result) {
    return {
      summary: "Run an unsupervised scan to describe cluster balance, anomalies, and PCA coverage.",
      clusterChart: "Cluster distribution will be explained here once a scan is available.",
      anomalies: "The most unusual rows will be described here after a scan.",
    };
  }

  const largestCluster = [...result.cluster_distribution].sort((left, right) => right.count - left.count)[0];
  const topAnomaly = [...result.preview].sort((left, right) => left.anomaly_score - right.anomaly_score)[0];
  const retainedVariance = result.pca_explained_variance.reduce((sum, value) => sum + value, 0) * 100;

  return {
    summary: `${result.cluster_count} clusters were created from ${result.used_numeric_columns.length} numeric columns, and the overview projection captures ${retainedVariance.toFixed(1)}% of the data's variation.` ,
    clusterChart: largestCluster
      ? `Cluster ${largestCluster.cluster} is the largest group with ${largestCluster.count.toLocaleString()} rows — it's the most common pattern in this scan.`
      : "Group sizes will appear here after a scan.",
    anomalies: topAnomaly
      ? `Row ${topAnomaly.row} is the most unusual row found, with a score of ${topAnomaly.anomaly_score.toFixed(4)}.`
      : "Details about unusual rows will appear here after a scan.",
  };
}

export function getSupervisedNarratives(result?: SupervisedResult) {
  if (!result) {
    return {
      summary: "Run a supervised experiment to compare models, find the most important columns, and preview predictions.",
      comparison: "Model comparison details will appear here after an experiment.",
      featureChart: "Column importance details will appear here after an experiment.",
      predictions: "Prediction samples will appear here after an experiment.",
    };
  }

  const bestComparison =
    result.model_comparison.find((item) => item.model === result.best_model) || result.model_comparison[0];
  const topFeature = result.feature_importance[0];
  const exactMatches = result.predictions_preview.filter(
    (item) => String(item.actual) === String(item.prediction)
  ).length;
  const previewCount = result.predictions_preview.length;
  const primaryMetric = bestComparison
    ? Object.entries(bestComparison.metrics).sort((left, right) => right[1] - left[1])[0]
    : null;

  return {
    summary: `${result.best_model} is the top-performing ${result.task_type} model using ${result.diagnostics.rows_used.toLocaleString()} rows and ${result.diagnostics.numeric_features + result.diagnostics.categorical_features} input columns.` ,
    comparison: primaryMetric && bestComparison
      ? `${bestComparison.model} leads this run with ${primaryMetric[0]} at ${primaryMetric[1].toFixed(3)}.`
      : "Model comparison will appear here once scores are available.",
    featureChart: topFeature
      ? `${topFeature.feature} is the most important column in this run with importance ${topFeature.importance.toFixed(3)}.`
      : "Column importance will appear here after the experiment finishes.",
    predictions: previewCount > 0
      ? `${exactMatches} of the ${previewCount} preview rows match the actual value exactly in this sample view.`
      : "Prediction samples will appear here after the experiment finishes.",
  };
}