"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AnalysisInsights,
  AnalysisMlCapabilities,
  MlExperimentSummary,
  SupervisedResult,
  TargetRecommendation,
  UnsupervisedResult,
} from "@/lib/analysisTypes";
import {
  getSupervisedNarratives,
  getTopAnomalies,
  getTopClusters,
  getTopFeatures,
  getUnsupervisedNarratives,
} from "@/lib/analysisDerived";
import { commitMobileTextFieldAndCloseKeyboard } from "@/lib/helpers";
import {
  downloadMlExperimentReport,
  downloadMlExperimentSummary,
  getMlExperimentDetail,
  isMissingAnalysisSourceError,
} from "@/lib/analysisApi";
import { triggerElementNavigationScroll, triggerNavigationScroll } from "@/lib/navigationScroll";

type MLTabProps = {
  analysisId: number;
  capabilities: AnalysisMlCapabilities;
  experiments: MlExperimentSummary[];
  readiness: AnalysisInsights["modeling_readiness"];
  initialUnsupervised?: UnsupervisedResult;
  initialSupervised?: SupervisedResult;
  onRunUnsupervised: (nClusters: number) => Promise<UnsupervisedResult>;
  onRunSupervised: (targetColumn: string) => Promise<SupervisedResult>;
  onDeleteExperiment: (experiment: MlExperimentSummary) => Promise<void>;
};

const supervisedModelGuide = [
  {
    name: "Logistic Regression",
    appliesTo: "classification",
    detail:
      "A regularized linear baseline with class balancing. It is fast, interpretable, and still useful for checking whether the target is learnable at all.",
  },
  {
    name: "Random Forest",
    appliesTo: "classification",
    detail:
      "An ensemble of decision trees. It captures nonlinear interactions and mixed feature behavior better than a linear baseline, especially when numeric and categorical fields interact.",
  },
  {
    name: "Extra Trees",
    appliesTo: "classification",
    detail:
      "A more randomized tree ensemble. It often gives a stronger benchmark on noisy tabular data by exploring more aggressive split patterns than a standard forest.",
  },
  {
    name: "Linear Regression",
    appliesTo: "regression",
    detail:
      "A linear baseline for continuous targets. It estimates how the target moves as features change and is useful for a fast directional benchmark.",
  },
  {
    name: "Random Forest",
    appliesTo: "regression",
    detail:
      "A nonlinear tree ensemble for continuous targets. It handles complex interactions and uneven feature effects better than a purely linear fit.",
  },
  {
    name: "Extra Trees",
    appliesTo: "regression",
    detail:
      "A randomized tree ensemble that can outperform a standard forest when the target depends on many uneven or noisy interactions across the feature set.",
  },
  {
    name: "Train/test holdout",
    appliesTo: "all",
    detail:
      "Each supervised benchmark keeps a held-out test slice so the score lane reflects how well the models generalize instead of memorizing the full dataset.",
  },
  {
    name: "Category compression",
    appliesTo: "all",
    detail:
      "Rare categories are compressed before the benchmark so wide datasets stay stable and high-cardinality columns do not overwhelm the run.",
  },
];

const unsupervisedGuide = [
  {
    name: "KMeans clustering",
    detail:
      "Groups rows into clusters by placing them near learned centroids in standardized numeric feature space.",
  },
  {
    name: "Isolation Forest",
    detail:
      "Flags unusual rows by measuring how quickly random tree partitions isolate them compared with the rest of the data.",
  },
  {
    name: "PCA projection",
    detail:
      "Compresses many numeric dimensions into two principal components so segment structure and anomalies are easier to visualize.",
  },
  {
    name: "Normalized result scale",
    detail:
      "Every ML chart is rescaled to the same 0% to 100% range so wide raw values stay readable while the original value range remains visible in the notes.",
  },
];

const defaultChartInitialDimension = { width: 520, height: 288 };
const normalizedRangeTicks = [0, 0.25, 0.5, 0.75, 1];
const sliderTrackClassName =
  "grid min-w-max grid-flow-col auto-cols-[minmax(240px,82vw)] gap-3 sm:auto-cols-[minmax(260px,46vw)] xl:auto-cols-[18rem]";
const verticalBarChartMargin = { top: 12, right: 16, bottom: 12, left: 8 };
const SUPERVISED_RESULTS_TARGET_ID = "ml-supervised-results-start";
const UNSUPERVISED_RESULTS_TARGET_ID = "ml-unsupervised-results-start";

type LabMode = "supervised" | "unsupervised";

type PendingDeleteExperiment = {
  mode: LabMode;
  experiment: MlExperimentSummary;
};

function formatDisplayNumber(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatSliceLabel(label: string) {
  return label.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi, (match) => {
    const value = Number(match);
    return Number.isFinite(value) ? formatDisplayNumber(value) : match;
  });
}

function formatClusterLabel(cluster: number) {
  return `Cluster ${cluster}`;
}

function truncateSummary(text: string, limit = 92) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function getLabReviewWarning(readiness: AnalysisInsights["modeling_readiness"]) {
  const highlightedTargets = readiness.target_candidates.slice(0, 2);

  if (highlightedTargets.length > 0) {
    return `Potential targets like ${highlightedTargets.join(", ")} are still available, but this dataset should be reviewed before you rely on ML results. You can still run the lab.`;
  }

  return "This dataset should be reviewed before you rely on ML results. You can still run the lab.";
}

function formatNormalizedPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatMetricLabel(metricKey: string) {
  return metricKey
    .replace(/^neg_/, "")
    .split(/[_-]/)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function normalizeValue(value: number, minimum: number, maximum: number, invert = false) {
  if (!Number.isFinite(value)) return 0;
  if (maximum === minimum) return 1;
  const scaled = invert ? (maximum - value) / (maximum - minimum) : (value - minimum) / (maximum - minimum);
  return Math.max(0, Math.min(1, scaled));
}

function getPreferredLab(
  experiments: MlExperimentSummary[],
  initialSupervised?: SupervisedResult,
  initialUnsupervised?: UnsupervisedResult,
  capabilities?: AnalysisMlCapabilities
): LabMode {
  if (initialSupervised?.experiment) return "supervised";
  if (initialUnsupervised?.experiment) return "unsupervised";

  const latestExperiment = [...experiments].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )[0];

  if (latestExperiment?.type === "supervised") return "supervised";
  if (latestExperiment?.type === "unsupervised") return "unsupervised";

  return capabilities?.supervised.available ? "supervised" : "unsupervised";
}

function getPreferredTarget(capabilities: AnalysisMlCapabilities) {
  const bestRecommendation = [...(capabilities.supervised.target_recommendations || [])]
    .filter((item) => item.recommended_task !== "none")
    .sort((left, right) => right.score - left.score)[0];

  if (bestRecommendation) {
    return bestRecommendation.column;
  }

  return capabilities.supervised.target_candidates[0] ?? "";
}

function getExperimentClusterInput(experiment?: MlExperimentSummary | null) {
  const value = experiment?.parameters?.n_clusters;
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : "3";
}

function getMetricPriority(taskType: string) {
  return taskType === "regression"
    ? ["r2", "explained_variance", "neg_root_mean_squared_error", "neg_mean_absolute_error", "rmse", "mae", "mse"]
    : ["roc_auc", "f1", "accuracy", "balanced_accuracy", "precision", "recall", "average_precision"];
}

function getPreferredMetricKey(result?: SupervisedResult) {
  if (!result?.model_comparison.length) {
    return null;
  }

  const availableMetricKeys = new Set(
    result.model_comparison.flatMap((item) => Object.keys(item.metrics || {}))
  );

  for (const metricKey of getMetricPriority(result.task_type)) {
    if (availableMetricKeys.has(metricKey)) {
      return metricKey;
    }
  }

  return Object.keys(result.model_comparison[0]?.metrics || {})[0] ?? null;
}

function getSupervisedMetricChart(result?: SupervisedResult) {
  const metricKey = getPreferredMetricKey(result);
  if (!result || !metricKey) {
    return {
      metricKey: null,
      metricLabel: "",
      rawMinimum: 0,
      rawMaximum: 0,
      data: [] as Array<{ model: string; normalized: number; raw: number }>,
    };
  }

  const rawValues = result.model_comparison.map((item) => Number(item.metrics?.[metricKey] ?? 0));
  const rawMinimum = Math.min(...rawValues);
  const rawMaximum = Math.max(...rawValues);
  const invert = /(rmse|mae|mse|loss|error)/i.test(metricKey) && !/^neg_/i.test(metricKey);

  return {
    metricKey,
    metricLabel: formatMetricLabel(metricKey),
    rawMinimum,
    rawMaximum,
    data: result.model_comparison
      .map((item) => {
        const raw = Number(item.metrics?.[metricKey] ?? 0);
        return {
          model: item.model,
          normalized: normalizeValue(raw, rawMinimum, rawMaximum, invert),
          raw,
        };
      })
      .sort((left, right) => right.normalized - left.normalized),
  };
}

function getSupervisedFailureFactors(
  result?: SupervisedResult,
  recommendation?: TargetRecommendation
) {
  const taskType =
    recommendation?.recommended_task === "regression" || result?.task_type === "regression"
      ? "regression"
      : "classification";
  const warningText = result?.warnings ?? [];
  const signalWarning = warningText.find((item) => /weak target signal|negative r2/i.test(item));
  const balanceWarning = warningText.find((item) => /dominant class|classes|imbalance/i.test(item));

  return [
    {
      title: "Weak signal",
      detail:
        signalWarning ||
        "If the features only weakly connect to the target, even stronger models will stay close to baseline and the score lane will remain modest.",
    },
    {
      title: taskType === "classification" ? "Target balance" : "Target spread",
      detail:
        balanceWarning ||
        recommendation?.reasons?.[0] ||
        (taskType === "classification"
          ? "Uneven classes make minority cases harder to learn and can make plain accuracy look healthier than the model really is."
          : "A numeric target with low spread or weak business signal gives the model very little structure to learn from."),
    },
    {
      title: "Held-out reliability",
      detail:
        result?.diagnostics.test_rows
          ? `${result.diagnostics.test_rows.toLocaleString()} rows are held out for testing, so smaller or noisier test slices make benchmark scores swing more between runs.`
          : "Every supervised run is scored on held-out rows, so small test slices make results less stable.",
    },
    {
      title: "Model assumptions",
      detail:
        "Linear models miss nonlinear patterns, while tree ensembles can still struggle when the target is sparse, noisy, or only loosely tied to the available features.",
    },
  ];
}

export default function MLTab({
  analysisId,
  capabilities,
  experiments,
  readiness,
  initialUnsupervised,
  initialSupervised,
  onRunUnsupervised,
  onRunSupervised,
  onDeleteExperiment,
}: MLTabProps) {
  const targetRecommendations = useMemo(
    () => capabilities.supervised.target_recommendations ?? [],
    [capabilities.supervised.target_recommendations]
  );
  const targetOptions = useMemo(
    () => Array.from(new Set([...capabilities.supervised.target_candidates, ...targetRecommendations.map((item) => item.column)])),
    [capabilities.supervised.target_candidates, targetRecommendations]
  );
  const visibleTargetRecommendations = useMemo(
    () => targetRecommendations.filter((item) => targetOptions.includes(item.column)).slice(0, 6),
    [targetOptions, targetRecommendations]
  );
  const supervisedExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.type === "supervised"),
    [experiments]
  );
  const unsupervisedExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.type === "unsupervised"),
    [experiments]
  );
  const [clusterInput, setClusterInput] = useState("3");
  const [targetColumn, setTargetColumn] = useState(getPreferredTarget(capabilities));
  const [unsupervised, setUnsupervised] = useState<UnsupervisedResult | undefined>(initialUnsupervised);
  const [supervised, setSupervised] = useState<SupervisedResult | undefined>(initialSupervised);
  const [activeLab, setActiveLab] = useState<LabMode>(() =>
    getPreferredLab(experiments, initialSupervised, initialUnsupervised, capabilities)
  );
  const [busy, setBusy] = useState<"unsupervised" | "supervised" | null>(null);
  const [loadingExperimentId, setLoadingExperimentId] = useState<string | null>(null);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<{
    supervised: string | null;
    unsupervised: string | null;
  }>({
    supervised: initialSupervised?.experiment?.id ?? null,
    unsupervised: initialUnsupervised?.experiment?.id ?? null,
  });
  const surfaceRef = useRef<HTMLElement | null>(null);
  const [selectionFlash, setSelectionFlash] = useState<{
    mode: LabMode;
    id: string;
    token: number;
  } | null>(null);

  const clusters = getTopClusters(unsupervised);
  const anomalies = getTopAnomalies(unsupervised);
  const [controlErrors, setControlErrors] = useState<Record<LabMode, string>>({
    supervised: "",
    unsupervised: "",
  });
  const [savedRunErrors, setSavedRunErrors] = useState<Record<LabMode, string>>({
    supervised: "",
    unsupervised: "",
  });
  const [downloadErrors, setDownloadErrors] = useState<Record<LabMode, string>>({
    supervised: "",
    unsupervised: "",
  });
  const [deletingExperimentId, setDeletingExperimentId] = useState<string | null>(null);
  const [pendingDeleteExperiment, setPendingDeleteExperiment] =
    useState<PendingDeleteExperiment | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState("");
  const topFeatures = getTopFeatures(supervised);
  const activeRecommendation = targetRecommendations.find((item) => item.column === targetColumn);
  const supervisedMode =
    activeRecommendation?.recommended_task === "regression" || supervised?.task_type === "regression"
      ? "regression"
      : "classification";
  const currentSupervisedExperiment =
    supervised?.experiment ||
    supervisedExperiments.find((experiment) => experiment.id === selectedExperimentIds.supervised) ||
    supervisedExperiments[0] ||
    null;
  const currentUnsupervisedExperiment =
    unsupervised?.experiment ||
    unsupervisedExperiments.find((experiment) => experiment.id === selectedExperimentIds.unsupervised) ||
    unsupervisedExperiments[0] ||
    null;
  const supervisedNarratives = getSupervisedNarratives(supervised);
  const unsupervisedNarratives = getUnsupervisedNarratives(unsupervised);
  const supervisedFailureFactors = getSupervisedFailureFactors(supervised, activeRecommendation);
  const busiestCluster = clusters[0];
  const shouldWarnAboutReadiness = !readiness.is_ready;
  const readinessWarning = shouldWarnAboutReadiness ? getLabReviewWarning(readiness) : "";
  const busyMessage =
    busy === "supervised"
      ? "Benchmarking candidate models, compressing rare categories, and saving the experiment into history."
      : busy === "unsupervised"
        ? "Clustering numeric features, running anomaly detection, and projecting the result into PCA space."
        : "";

  const clusterTotal = clusters.reduce((sum, item) => sum + item.count, 0);
  const clusterChartData = clusters.map((item) => ({
    label: formatClusterLabel(item.cluster),
    share: clusterTotal > 0 ? item.count / clusterTotal : 0,
    count: item.count,
  }));
  const anomalyScores = anomalies.map((item) => Number(item.anomaly_score));
  const anomalyMinimum = anomalyScores.length ? Math.min(...anomalyScores) : 0;
  const anomalyMaximum = anomalyScores.length ? Math.max(...anomalyScores) : 0;
  const anomalyChartData = anomalies
    .map((item) => ({
      label: `Row ${item.row}`,
      severity: normalizeValue(Number(item.anomaly_score), anomalyMinimum, anomalyMaximum, true),
      anomalyScore: Number(item.anomaly_score),
      clusterLabel: formatClusterLabel(item.cluster),
    }))
    .sort((left, right) => right.severity - left.severity);
  const featureMaximum = topFeatures.length > 0 ? Math.max(...topFeatures.map((item) => item.importance)) : 0;
  const featureChartData = topFeatures.map((item) => ({
    feature: item.feature,
    normalized: featureMaximum > 0 ? item.importance / featureMaximum : 0,
    raw: item.importance,
  }));
  const metricChart = getSupervisedMetricChart(supervised);
  const methodGuideCards = supervisedModelGuide.filter(
    (item) => item.appliesTo === "all" || item.appliesTo === supervisedMode
  );

  function clearModeErrors(mode: LabMode) {
    setControlErrors((current) => ({ ...current, [mode]: "" }));
    setSavedRunErrors((current) => ({ ...current, [mode]: "" }));
    setDownloadErrors((current) => ({ ...current, [mode]: "" }));
  }

  function scrollToResultStart(mode: LabMode) {
    const targetId = mode === "supervised" ? SUPERVISED_RESULTS_TARGET_ID : UNSUPERVISED_RESULTS_TARGET_ID;
    const target = typeof document !== "undefined" ? document.getElementById(targetId) : null;
    let scrollableAncestor: HTMLElement | null = null;
    let current = (target ?? surfaceRef.current)?.parentElement ?? null;

    while (current) {
      const overflowY = window.getComputedStyle(current).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight + 4) {
        scrollableAncestor = current;
        break;
      }
      current = current.parentElement;
    }

    if (scrollableAncestor) {
      triggerElementNavigationScroll(scrollableAncestor, targetId, 80);
      return;
    }

    triggerNavigationScroll(targetId, 80);
  }

  function flashSelectedRun(mode: LabMode, id: string) {
    setSelectionFlash({ mode, id, token: Date.now() });
  }

  function renderInlineError(message: string) {
    if (!message) {
      return null;
    }

    if (isMissingAnalysisSourceError(message)) {
      return (
        <div className="mt-4 rounded-2xl border border-[#ffb079]/20 bg-[#19120f]/92 p-4 text-sm text-[#ffe7d7]">
          <p className="font-semibold text-white">This saved run can still be reviewed, but it cannot rerun ML on the server.</p>
          <p className="mt-2 leading-6 text-white/72">
            The archived report and any saved ML outputs remain available here. To run a fresh ML pass, upload the original CSV again in Uploads and open the new analysis run.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ScrollIntentLink
              href="/batch"
              className="rounded-lg bg-[#ffb079] px-4 py-2 text-sm font-semibold text-[#11273b]"
            >
              Open Uploads
            </ScrollIntentLink>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffd8d8]">
        {message}
      </div>
    );
  }

  useEffect(() => {
    const latestSupervisedExperiment = experiments.find((experiment) => experiment.type === "supervised") || null;
    const latestUnsupervisedExperiment = experiments.find((experiment) => experiment.type === "unsupervised") || null;

    setTargetColumn((current) =>
      current && targetOptions.includes(current) ? current : getPreferredTarget(capabilities)
    );
    setClusterInput(getExperimentClusterInput(initialUnsupervised?.experiment ?? latestUnsupervisedExperiment));
    setUnsupervised(initialUnsupervised);
    setSupervised(initialSupervised);
    setControlErrors({ supervised: "", unsupervised: "" });
    setSavedRunErrors({ supervised: "", unsupervised: "" });
    setDownloadErrors({ supervised: "", unsupervised: "" });
    setBusy(null);
    setLoadingExperimentId(null);
    setDeletingExperimentId(null);
    setPendingDeleteExperiment(null);
    setDeleteDialogError("");
    setSelectedExperimentIds({
      supervised: initialSupervised?.experiment?.id ?? latestSupervisedExperiment?.id ?? null,
      unsupervised: initialUnsupervised?.experiment?.id ?? latestUnsupervisedExperiment?.id ?? null,
    });
    setActiveLab(getPreferredLab(experiments, initialSupervised, initialUnsupervised, capabilities));
  }, [analysisId, capabilities, experiments, initialSupervised, initialUnsupervised, targetOptions]);

  useEffect(() => {
    if (!selectionFlash) return;

    const timeoutId = window.setTimeout(() => {
      setSelectionFlash((current) =>
        current?.token === selectionFlash.token ? null : current
      );
    }, 960);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectionFlash]);

  useEffect(() => {
    if (!pendingDeleteExperiment || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingDeleteExperiment]);

  async function handleOpenExperiment(experiment: MlExperimentSummary, source: "saved" | "downloads" = "saved") {
    const mode = experiment.type;

    try {
      if (source === "saved") {
        setSavedRunErrors((current) => ({ ...current, [mode]: "" }));
      } else {
        setDownloadErrors((current) => ({ ...current, [mode]: "" }));
      }
      setLoadingExperimentId(experiment.id);
      const detail = await getMlExperimentDetail(analysisId, experiment.id);

      if (detail.experiment_type === "supervised") {
        setSupervised(detail.result as SupervisedResult);
        setSelectedExperimentIds((current) => ({ ...current, supervised: experiment.id }));
        setActiveLab("supervised");
        flashSelectedRun("supervised", experiment.id);
        scrollToResultStart("supervised");
      } else {
        setUnsupervised(detail.result as UnsupervisedResult);
        setSelectedExperimentIds((current) => ({ ...current, unsupervised: experiment.id }));
        setClusterInput(getExperimentClusterInput(experiment));
        setActiveLab("unsupervised");
        flashSelectedRun("unsupervised", experiment.id);
        scrollToResultStart("unsupervised");
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to load saved experiment.";
      if (source === "saved") {
        setSavedRunErrors((current) => ({ ...current, [mode]: message }));
      } else {
        setDownloadErrors((current) => ({ ...current, [mode]: message }));
      }
    } finally {
      setLoadingExperimentId(null);
    }
  }

  async function handleExperimentDownload(
    mode: LabMode,
    experiment: MlExperimentSummary,
    kind: "report" | "summary",
    scope: "controls" | "downloads"
  ) {
    try {
      if (scope === "controls") {
        setControlErrors((current) => ({ ...current, [mode]: "" }));
      } else {
        setDownloadErrors((current) => ({ ...current, [mode]: "" }));
      }

      if (kind === "report") {
        await downloadMlExperimentReport(analysisId, experiment);
      } else {
        await downloadMlExperimentSummary(analysisId, experiment);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : `Failed to download ${kind}.`;
      if (scope === "controls") {
        setControlErrors((current) => ({ ...current, [mode]: message }));
      } else {
        setDownloadErrors((current) => ({ ...current, [mode]: message }));
      }
    }
  }

  async function handleDeleteSavedExperiment(mode: LabMode, experiment: MlExperimentSummary) {
    setPendingDeleteExperiment({ mode, experiment });
    setDeleteDialogError("");
  }

  async function confirmDeleteSavedExperiment() {
    if (!pendingDeleteExperiment) {
      return;
    }

    const { mode, experiment } = pendingDeleteExperiment;

    try {
      setDownloadErrors((current) => ({ ...current, [mode]: "" }));
      setDeleteDialogError("");
      setDeletingExperimentId(experiment.id);
      await onDeleteExperiment(experiment);
      if (mode === "supervised" && currentSupervisedExperiment?.id === experiment.id) {
        setSupervised(undefined);
        setSelectedExperimentIds((current) => ({ ...current, supervised: null }));
      }
      if (mode === "unsupervised" && currentUnsupervisedExperiment?.id === experiment.id) {
        setUnsupervised(undefined);
        setSelectedExperimentIds((current) => ({ ...current, unsupervised: null }));
      }
      setPendingDeleteExperiment(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Failed to delete the saved ML run.";
      setDeleteDialogError(message);
    } finally {
      setDeletingExperimentId(null);
    }
  }

  function renderSavedRunsBlock(mode: LabMode, items: MlExperimentSummary[]) {
    const selectedId = mode === "supervised" ? currentSupervisedExperiment?.id : currentUnsupervisedExperiment?.id;

    return (
      <article className="border-b border-white/6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffd76d]">
              {mode === "supervised" ? "Saved supervised runs" : "Saved unsupervised runs"}
            </p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
              {mode === "supervised"
                ? "Open or compare earlier benchmark runs"
                : "Open or compare earlier scan runs"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/64">
              {mode === "supervised"
                ? "Use this strip to reopen earlier supervised benchmarks while the benchmark controls stay focused on the next target you want to test."
                : "Use this strip to reopen earlier clustering and anomaly scans while the control block stays focused on the next segment count you want to test."}
            </p>
          </div>
          <span className="text-xs text-white/50">
            {items.length === 0
              ? "No saved runs yet"
              : items.length > 4
                ? "Four cards stay in view at once. Slide to reveal older runs."
                : `${items.length} saved run${items.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 py-5 text-sm text-white/48">
            No saved {mode} runs yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto pb-2">
            <div className={sliderTrackClassName}>
              {items.map((experiment) => {
                const selected = experiment.id === selectedId;
                const flashing =
                  selectionFlash?.mode === mode && selectionFlash?.id === experiment.id;

                return (
                  <button
                    type="button"
                    key={experiment.id}
                    onClick={() => {
                      void handleOpenExperiment(experiment, "saved");
                    }}
                    className={`ml-run-card snap-start rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-[#7ad6ff]/55 bg-[#7ad6ff]/10"
                        : "border-white/10 bg-black/10 hover:border-white/16 hover:bg-white/[0.06]"
                    } ${selected ? "ml-run-card-selected" : ""} ${flashing ? "ml-run-card-flash" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium capitalize text-white">{experiment.type} run</p>
                      <span className="text-[11px] text-white/48">
                        {new Date(experiment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/62">{experiment.summary}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-white/42">
                      {loadingExperimentId === experiment.id
                        ? "Opening run..."
                        : selected
                          ? "Current result"
                          : "Slide and click to load"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {renderInlineError(savedRunErrors[mode])}
      </article>
    );
  }

  function renderDownloadLibrary(mode: LabMode, items: MlExperimentSummary[]) {
    const selectedId = mode === "supervised" ? currentSupervisedExperiment?.id : currentUnsupervisedExperiment?.id;

    return (
      <article className="border-b border-white/6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffd76d]">
              {mode === "supervised" ? "Supervised downloads" : "Unsupervised downloads"}
            </p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
              {mode === "supervised"
                ? "Download any saved supervised result"
                : "Download any saved unsupervised result"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/64">
              Use this library when you want a report or summary from a specific saved ML run instead of only the currently opened result.
            </p>
          </div>
          <span className="text-xs text-white/50">
            {items.length === 0 ? "No saved runs yet" : `${items.length} saved run${items.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {items.length ? (
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            {items.map((experiment) => {
              const selected = experiment.id === selectedId;

              return (
                <div key={`${mode}-${experiment.id}`} className="border-b border-white/6 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium capitalize text-white">{experiment.type} run</p>
                      <p className="mt-1 text-xs text-white/48">
                        {new Date(experiment.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/55">
                      {selected ? "Current result" : "Saved result"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/62">{experiment.summary}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {!selected ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleOpenExperiment(experiment, "downloads");
                        }}
                        className="ml-action-button ml-action-button-secondary sm:col-span-2"
                      >
                        Open run
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void handleExperimentDownload(mode, experiment, "report", "downloads");
                      }}
                      className="ml-action-button ml-action-button-secondary"
                    >
                      Download report
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleExperimentDownload(mode, experiment, "summary", "downloads");
                      }}
                      className="ml-action-button ml-action-button-secondary"
                    >
                      Download summary
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteSavedExperiment(mode, experiment);
                      }}
                      disabled={deletingExperimentId === experiment.id}
                      className="ml-action-button ml-action-button-danger sm:col-span-2"
                    >
                      {deletingExperimentId === experiment.id ? (
                        <>
                          <span className="button-live-loader" aria-hidden="true" />
                          Deleting...
                        </>
                      ) : "Delete run"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 py-5 text-sm text-white/48">
            Run this lab once to save report and summary downloads here.
          </div>
        )}

        {renderInlineError(downloadErrors[mode])}
      </article>
    );
  }

  return (
    <>
      <section ref={surfaceRef} className="analysis-tab-surface space-y-4">
      {shouldWarnAboutReadiness ? (
        <div className="inline-warning-note">
          <p className="inline-warning-note-title">Review advised</p>
          <p className="inline-warning-note-copy">{readinessWarning}</p>
        </div>
      ) : null}
      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Lab overview</span>
            <p className="mobile-accordion-hint">Modes, runtime guardrails, and what this ML lab runs on</p>
            <div className="phone-only analysis-accordion-summary-preview">
              <div className="analysis-accordion-summary-row">
                <strong>Saved runs</strong>
                <span>{experiments.length} total · {supervisedExperiments.length} supervised · {unsupervisedExperiments.length} unsupervised</span>
              </div>
              <div className="analysis-accordion-summary-row">
                <strong>Supervised lane</strong>
                <span>
                  {capabilities.supervised.available
                    ? `${targetOptions.length} target options are ready for benchmarking.`
                    : truncateSummary(capabilities.supervised.reason, 86)}
                </span>
              </div>
              <div className="analysis-accordion-summary-row">
                <strong>Unsupervised lane</strong>
                <span>
                  {capabilities.unsupervised.available
                    ? `Start from ${clusterInput || "3"} segments and refine the scan after the first run.`
                    : truncateSummary(capabilities.unsupervised.reason, 86)}
                </span>
              </div>
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#7ad6ff]">ML Lab</p>
            <p className="mt-2 text-sm leading-6 text-white/66">
              This lab runs only on the dataset you uploaded for this report.
            </p>
          </div>
          <div className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#ffb079]">Unsupervised mode</p>
            <p className="mt-2 text-sm leading-6 text-white/66">
              Use clustering and anomaly detection when you want patterns without picking a target column.
            </p>
          </div>
          <div className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#8bf1a8]">Supervised mode</p>
            <p className="mt-2 text-sm leading-6 text-white/66">
              Pick a target column and compare baseline models.
            </p>
          </div>
          <div className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#d7b7ff]">Runtime guardrails</p>
            <p className="mt-2 text-sm leading-6 text-white/66">
              Sampling and rare-category compression help wide datasets stay responsive.
            </p>
          </div>
        </div>
        </div>
      </details>

      {busy ? (
        <div className="border-l-2 border-[#7ad6ff]/30 pl-4 text-sm text-[#dff7ff]">
          <p className="font-medium text-white">
            {busy === "supervised" ? "Running supervised benchmark" : "Running unsupervised analysis"}
          </p>
          <p className="mt-2 leading-6 text-white/72">{busyMessage}</p>
        </div>
      ) : null}

      <article className="border-b border-white/6 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Experiment mode</p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
              Supervised and unsupervised modes
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["supervised", "unsupervised"] as LabMode[]).map((mode) => {
              const active = activeLab === mode;
              return (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setActiveLab(mode)}
                  className={`rounded-lg px-4 py-2 text-sm transition ${
                    active
                      ? "bg-white text-[#11273b]"
                      : "border border-white/12 bg-white/5 text-white/75 hover:bg-white/10"
                  }`}
                >
                  {mode === "supervised" ? "Supervised lab" : "Unsupervised lab"}
                </button>
              );
            })}
          </div>
        </div>
      </article>

      {activeLab === "supervised" ? (
        <>
          <details className="mobile-accordion min-w-0 self-start">
            <summary>
              <div className="min-w-0">
                <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Method guide</span>
                <p className="mobile-accordion-hint">Supported supervised models and what each one is best for</p>
                <div className="phone-only analysis-accordion-summary-preview">
                  {methodGuideCards.slice(0, 3).map((item) => (
                    <div key={`method-${item.name}`} className="analysis-accordion-summary-row">
                      <strong>{item.name}</strong>
                      <span>{truncateSummary(item.detail, 88)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </summary>
            <div className="mobile-accordion-body">
              <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                <h3 className="font-[family:var(--font-display)] text-xl text-white">
                  Supported supervised models
                </h3>
                <span className="text-xs text-white/50">Slide to review the method cards</span>
              </div>
              <div className="analysis-guide-scroll mt-4 pb-2" data-swipe-ignore="true">
                <div className="analysis-guide-track">
                  {methodGuideCards.map((item) => (
                    <div key={item.name} className="analysis-guide-card border-b border-white/6 pb-3">
                      <p className="font-medium text-white">{item.name}</p>
                      <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <div className="space-y-4">
            <article className="min-w-0 self-start border-b border-white/6 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#ffcfaa]">Target recommendations</p>
                  <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
                    Suggested targets by fit score
                  </h3>
                </div>
                <span className="text-xs text-white/50">
                  {visibleTargetRecommendations.length > 4 ? "Slide to view more suggestions" : "Recommendations stay synced with the current dataset profile"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Ranked from profiling signals such as missing values, class balance, rows per class, numeric spread, near-identifier risk, inferred column role, and a small outcome-name bonus.
              </p>

              <div className="mt-5 overflow-x-auto pb-2">
                <div className={sliderTrackClassName}>
                  {visibleTargetRecommendations.map((recommendation) => (
                    <button
                      type="button"
                      key={recommendation.column}
                      onClick={() => setTargetColumn(recommendation.column)}
                      className={`border-b border-white/6 pb-3 text-left transition ${
                        targetColumn === recommendation.column
                          ? "border-[#ffb079]/45 bg-[#ffb079]/10"
                          : "border-white/10 bg-black/10 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words font-medium text-white">{recommendation.column}</p>
                        <span className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/65">
                          {(recommendation.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[#ffcfaa]">{recommendation.verdict}</p>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/60">
                        {recommendation.reasons[0]}
                      </p>
                    </button>
                  ))}
                  {visibleTargetRecommendations.length === 0 ? (
                    <div className="py-5 text-sm text-white/48">
                      No strong target recommendations were inferred for this dataset.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 border-b border-white/6 pb-3 text-sm text-white/70">
                <p className="font-medium text-white">Selected target guidance</p>
                <p className="mt-2 text-[#ffcfaa]">
                  {activeRecommendation?.verdict || "Pick a target column to see its fit."}
                </p>
                <p className="mt-2 leading-6 text-white/60">
                  {activeRecommendation?.reasons[0] ||
                    "Saved recommendations explain whether the target looks stable enough for a benchmark."}
                </p>
              </div>
            </article>

            <article className="min-w-0 self-start border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Supervised benchmark</p>
              <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
                Choose a target and start a fresh benchmark
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/65">{capabilities.supervised.reason}</p>

              <div className="mt-5 space-y-4">
                <select
                  value={targetColumn}
                  onChange={(event) => setTargetColumn(event.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#08131e] px-4 py-3 text-sm text-white outline-none [color-scheme:dark]"
                >
                  <option value="" className="bg-[#08131e] text-white">
                    Select target column
                  </option>
                  {targetOptions.map((candidate) => (
                    <option key={candidate} value={candidate} className="bg-[#08131e] text-white">
                      {candidate}
                    </option>
                  ))}
                </select>

                <div className="border-b border-white/6 pb-3 text-sm text-white/70">
                  <p className="font-medium text-white">Current selection</p>
                  <p className="mt-2 text-white">{targetColumn || "No target selected yet."}</p>
                  <p className="mt-2 leading-6 text-white/60">
                    {activeRecommendation?.recommended_task === "regression"
                      ? "The current target looks more like a regression outcome, so the supervised lane will compare continuous-target models."
                      : activeRecommendation?.recommended_task === "classification"
                        ? "The current target looks more like a classification outcome, so the supervised lane will compare class-prediction models."
                        : "You can still pick any inferred target candidate here, even if it was not one of the top-ranked recommendations."}
                  </p>
                </div>

                <div className="border-b border-white/6 pb-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Run setup</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    Launch a new supervised benchmark from the selected target, while the pinned downloads stay attached to the currently opened saved run.
                  </p>
                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      type="button"
                      disabled={!targetColumn || busy !== null}
                      onClick={async () => {
                        if (!targetColumn) {
                          setControlErrors((current) => ({
                            ...current,
                            supervised: "Choose a target column before running a supervised benchmark.",
                          }));
                          return;
                        }

                        try {
                          clearModeErrors("supervised");
                          setBusy("supervised");
                          const result = await onRunSupervised(targetColumn);
                          setSupervised(result);
                          setActiveLab("supervised");
                          if (result.experiment) {
                            setSelectedExperimentIds((current) => ({
                              ...current,
                              supervised: result.experiment?.id || null,
                            }));
                            flashSelectedRun("supervised", result.experiment.id);
                          }
                          scrollToResultStart("supervised");
                        } catch (requestError) {
                          setControlErrors((current) => ({
                            ...current,
                            supervised:
                              requestError instanceof Error
                                ? requestError.message
                                : "Failed to run supervised analysis.",
                          }));
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="ml-action-button ml-action-button-primary sm:max-w-[21rem]"
                    >
                      {busy === "supervised" ? "Benchmarking..." : "Run supervised benchmark"}
                    </button>
                    {currentSupervisedExperiment ? (
                      <div className="grid gap-3 sm:max-w-[28rem] sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleExperimentDownload(
                              "supervised",
                              currentSupervisedExperiment,
                              "report",
                              "controls"
                            );
                          }}
                          className="ml-action-button ml-action-button-secondary"
                        >
                          Download report
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleExperimentDownload(
                              "supervised",
                              currentSupervisedExperiment,
                              "summary",
                              "controls"
                            );
                          }}
                          className="ml-action-button ml-action-button-secondary"
                        >
                          Download summary
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {renderInlineError(controlErrors.supervised)}
                </div>
              </div>
            </article>
          </div>

          {renderSavedRunsBlock("supervised", supervisedExperiments)}

          <details className="mobile-accordion">
            <summary>
              <div className="min-w-0">
                <span className="text-xs uppercase tracking-[0.24em] text-[#ffd76d]">Score interpretation</span>
                <p className="mobile-accordion-hint">Why low scores usually reflect data difficulty, not model failure</p>
                <div className="phone-only analysis-accordion-summary-preview">
                  {supervisedFailureFactors.slice(0, 3).map((item) => (
                    <div key={`factor-${item.title}`} className="analysis-accordion-summary-row">
                      <strong>{item.title}</strong>
                      <span>{truncateSummary(item.detail, 88)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </summary>
            <div className="mobile-accordion-body">
              <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                <h3 className="font-[family:var(--font-display)] text-xl text-white">
                  Low scores usually reflect data difficulty
                </h3>
                <span className="text-xs text-white/50">These notes update with the active supervised run</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {supervisedFailureFactors.map((item) => (
                  <div key={item.title} className="border-b border-white/6 pb-3">
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <div
            id={SUPERVISED_RESULTS_TARGET_ID}
            className="route-scroll-target grid items-start gap-4 lg:grid-cols-2"
          >
            <article className="min-w-0 self-start border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Benchmark summary</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{supervisedNarratives.summary}</p>
              {supervised ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border-b border-white/6 pb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Best model</p>
                    <p className="mt-2 text-lg font-medium text-white">{supervised.best_model}</p>
                  </div>
                  <div className="border-b border-white/6 pb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Rows used</p>
                    <p className="mt-2 text-lg font-medium text-white">
                      {supervised.diagnostics.rows_used.toLocaleString()}
                    </p>
                  </div>
                  <div className="border-b border-white/6 pb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Feature mix</p>
                    <p className="mt-2 text-lg font-medium text-white">
                      {supervised.diagnostics.numeric_features} numeric • {supervised.diagnostics.categorical_features} categorical
                    </p>
                  </div>
                  <div className="border-b border-white/6 pb-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Target cardinality</p>
                    <p className="mt-2 text-lg font-medium text-white">
                      {supervised.diagnostics.target_cardinality}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 py-5 text-sm text-white/48">
                  Run or open a saved supervised benchmark to populate this summary.
                </div>
              )}

              {supervised?.warnings.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#ffd76d]">Reliability flags</p>
                  {supervised.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-xl border border-[#ffd76d]/20 bg-[#ffd76d]/10 px-3 py-3 text-sm text-[#fff2bf]"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="min-w-0 self-start border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#d7b7ff]">Prediction review</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{supervisedNarratives.predictions}</p>
              <div className="mt-4 space-y-3">
                {supervised?.predictions_preview?.slice(0, 5).map((item, index) => (
                  <div key={index} className="border-b border-white/6 pb-3 text-sm text-white/72">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">Sample {index + 1}</p>
                      <span className="text-xs text-white/50">
                        actual {String(item.actual)} → predicted {String(item.prediction)}
                      </span>
                    </div>
                  </div>
                ))}
                {!supervised?.predictions_preview?.length ? (
                  <div className="py-5 text-sm text-white/48">
                    Held-out prediction samples appear here after a supervised benchmark completes.
                  </div>
                ) : null}
              </div>
            </article>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <article className="min-w-0 self-start overflow-hidden border-b border-white/6 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Model score scale</p>
                {metricChart.metricKey ? (
                  <span className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/55">
                    {metricChart.metricLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">{supervisedNarratives.comparison}</p>
              {metricChart.data.length ? (
                <div className="mt-4 border-b border-white/6 pb-3 text-sm text-white/68">
                  Scale: 100% marks the strongest model for {metricChart.metricLabel}. Raw values range from {formatDisplayNumber(metricChart.rawMinimum, 4)} to {formatDisplayNumber(metricChart.rawMaximum, 4)}.
                </div>
              ) : null}
              <div className="mt-5 h-72 min-w-0 overflow-hidden">
                {metricChart.data.length ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
                    <BarChart data={metricChart.data} layout="vertical" margin={verticalBarChartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 1]}
                        ticks={normalizedRangeTicks}
                        tickFormatter={formatNormalizedPercent}
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="model"
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                        width={150}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        formatter={(value) => [`${formatNormalizedPercent(Number(value))}`, "Normalized score"]}
                      />
                      <Bar dataKey="normalized" fill="#7ad6ff" radius={[0, 8, 8, 0]} minPointSize={8} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
                    Run or open a supervised benchmark to compare normalized model scores.
                  </div>
                )}
              </div>
            </article>

            <article className="min-w-0 self-start overflow-hidden border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Feature importance scale</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{supervisedNarratives.featureChart}</p>
              {featureChartData.length ? (
                <div className="mt-4 border-b border-white/6 pb-3 text-sm text-white/68">
                  Scale: 100% marks the strongest feature in the selected run. Raw importances range from {formatDisplayNumber(Math.min(...featureChartData.map((item) => item.raw)), 4)} to {formatDisplayNumber(featureMaximum, 4)}.
                </div>
              ) : null}
              <div className="mt-5 h-72 min-w-0 overflow-hidden">
                {featureChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
                    <BarChart data={featureChartData} layout="vertical" margin={verticalBarChartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 1]}
                        ticks={normalizedRangeTicks}
                        tickFormatter={formatNormalizedPercent}
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="feature"
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                        width={140}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        formatter={(value) => [`${formatNormalizedPercent(Number(value))}`, "Normalized importance"]}
                      />
                      <Bar dataKey="normalized" fill="#9db8ff" radius={[0, 8, 8, 0]} minPointSize={8} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
                    Run or open a supervised benchmark to see normalized feature importance.
                  </div>
                )}
              </div>
            </article>
          </div>

          <article className="min-w-0 self-start border-b border-white/6 pb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Model comparison</p>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Model cards stay in one horizontal block so wide metric sets slide instead of stretching the page.
            </p>
            {supervised?.model_comparison.length ? (
              <div className="mt-4 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3">
                  {supervised.model_comparison.map((result) => {
                    const metrics = Object.entries(result.metrics).slice(0, 4);
                    return (
                      <div key={result.model} className="w-[280px] border-b border-white/6 pb-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-white">{result.model}</p>
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">
                            {supervised.task_type}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {metrics.map(([key, value]) => (
                            <div
                              key={`${result.model}-${key}`}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/76"
                            >
                              {formatMetricLabel(key)} {formatDisplayNumber(value, 4)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 py-5 text-sm text-white/48">
                Open a supervised result to compare model scores here.
              </div>
            )}
          </article>

          {supervised?.target_feature_slices?.length ? (
            <article className="border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Target vs feature slices</p>
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
                {supervised.target_feature_slices.map((slice) => (
                  <div key={slice.feature} className="min-w-0 border-b border-white/6 pb-3">
                    <p className="font-medium text-white">{slice.feature}</p>
                    <p className="mt-1 text-sm text-white/58">{slice.summary}</p>
                    <div className="mt-3 space-y-2">
                      {slice.rows.map((row) => (
                        <div
                          key={`${slice.feature}-${row.label}`}
                          className="grid gap-2 rounded-xl border border-white/8 px-3 py-3 text-sm text-white/72 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <span className="min-w-0 rounded-lg border border-white/10 px-3 py-1 text-white/78">
                            {formatSliceLabel(row.label)}
                          </span>
                          <span className="text-right text-white/64">
                            {row.count.toLocaleString()} rows • {row.target_label} {formatDisplayNumber(row.target_value, 3)}
                            {row.target_class ? ` (${row.target_class})` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {renderDownloadLibrary("supervised", supervisedExperiments)}
        </>
      ) : (
        <>
          <article className="min-w-0 self-start border-b border-white/6 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Unsupervised guide</p>
              <span className="text-xs text-white/50">Slide to review the method cards</span>
            </div>
            <div className="analysis-guide-scroll mt-4 pb-2" data-swipe-ignore="true">
              <div className="analysis-guide-track">
                {unsupervisedGuide.map((item) => (
                  <div key={item.name} className="analysis-guide-card border-b border-white/6 pb-3">
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="min-w-0 self-start border-b border-white/6 pb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Clustering and anomaly scan</p>
            <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">
              Configure and run a clustering scan
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/65">{capabilities.unsupervised.reason}</p>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-stretch">
              <div className="flex h-full min-h-[124px] flex-col border-b border-white/6 pb-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/42">Cluster count</p>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Start with three broad segments, then raise the count only when you need a finer split of the numeric patterns.
                </p>
              </div>
              <label className="flex h-full min-h-[124px] flex-col border-b border-white/6 pb-3">
                <p className="text-xs uppercase tracking-[0.14em] text-white/42">Segments</p>
                <input
                  type="number"
                  enterKeyHint="done"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={2}
                  max={8}
                  value={clusterInput}
                  onKeyDown={commitMobileTextFieldAndCloseKeyboard}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (/^\d*$/.test(nextValue)) {
                      setClusterInput(nextValue);
                    }
                  }}
                  className="mt-auto w-full rounded-lg border border-white/12 bg-[#0b1117] px-4 py-3 text-center text-sm text-white outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                disabled={!capabilities.unsupervised.available || busy !== null}
                onClick={async () => {
                  const parsedClusterCount = Number(clusterInput);

                  if (clusterInput.trim().length === 0 || !Number.isInteger(parsedClusterCount)) {
                    setControlErrors((current) => ({
                      ...current,
                      unsupervised: "Enter a whole-number segment count between 2 and 8.",
                    }));
                    return;
                  }

                  if (parsedClusterCount < 2 || parsedClusterCount > 8) {
                    setControlErrors((current) => ({
                      ...current,
                      unsupervised: "Segment count must stay between 2 and 8.",
                    }));
                    return;
                  }

                  try {
                    clearModeErrors("unsupervised");
                    setBusy("unsupervised");
                    const result = await onRunUnsupervised(parsedClusterCount);
                    setUnsupervised(result);
                    setActiveLab("unsupervised");
                    if (result.experiment) {
                      setSelectedExperimentIds((current) => ({
                        ...current,
                        unsupervised: result.experiment?.id || null,
                      }));
                      flashSelectedRun("unsupervised", result.experiment.id);
                    }
                    scrollToResultStart("unsupervised");
                  } catch (requestError) {
                    setControlErrors((current) => ({
                      ...current,
                      unsupervised:
                        requestError instanceof Error
                          ? requestError.message
                          : "Failed to run unsupervised analysis.",
                    }));
                  } finally {
                    setBusy(null);
                  }
                }}
                className="ml-action-button ml-action-button-primary sm:max-w-[21rem]"
              >
                {busy === "unsupervised" ? "Running..." : "Run unsupervised analysis"}
              </button>
              {currentUnsupervisedExperiment ? (
                <div className="grid gap-3 sm:max-w-[28rem] sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleExperimentDownload(
                        "unsupervised",
                        currentUnsupervisedExperiment,
                        "report",
                        "controls"
                      );
                    }}
                    className="ml-action-button ml-action-button-secondary"
                  >
                    Download report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleExperimentDownload(
                        "unsupervised",
                        currentUnsupervisedExperiment,
                        "summary",
                        "controls"
                      );
                    }}
                    className="ml-action-button ml-action-button-secondary"
                  >
                    Download summary
                  </button>
                </div>
              ) : null}
            </div>

            {renderInlineError(controlErrors.unsupervised)}
          </article>

          {renderSavedRunsBlock("unsupervised", unsupervisedExperiments)}

          <div
            id={UNSUPERVISED_RESULTS_TARGET_ID}
            className="route-scroll-target grid items-start gap-4 lg:grid-cols-2"
          >
            <article className="min-w-0 self-start overflow-hidden border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Cluster distribution</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{unsupervisedNarratives.clusterChart}</p>
              {clusterChartData.length ? (
                <div className="mt-4 border-b border-white/6 pb-3 text-sm text-white/68">
                  Scale: bars show each cluster as a share of scanned rows. Raw cluster counts range from {formatDisplayNumber(Math.min(...clusterChartData.map((item) => item.count)))} to {formatDisplayNumber(Math.max(...clusterChartData.map((item) => item.count)))}.
                </div>
              ) : null}
              <div className="mt-5 h-72 min-w-0 overflow-hidden">
                {clusterChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
                    <BarChart data={clusterChartData} margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                      <YAxis
                        domain={[0, 1]}
                        ticks={normalizedRangeTicks}
                        tickFormatter={formatNormalizedPercent}
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        formatter={(value) => [`${formatNormalizedPercent(Number(value))}`, "Normalized share"]}
                      />
                      <Bar dataKey="share" fill="#7ad6ff" radius={[8, 8, 0, 0]} minPointSize={8} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
                    Run or open an unsupervised scan to see normalized segment distribution.
                  </div>
                )}
              </div>
            </article>

            <article className="min-w-0 self-start overflow-hidden border-b border-white/6 pb-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Anomaly severity scale</p>
              <p className="mt-3 text-sm leading-6 text-white/62">{unsupervisedNarratives.anomalies}</p>
              {anomalyChartData.length ? (
                <div className="mt-4 border-b border-white/6 pb-3 text-sm text-white/68">
                  Scale: 100% marks the strongest anomaly in the visible preview. Raw anomaly scores range from {formatDisplayNumber(anomalyMinimum, 4)} to {formatDisplayNumber(anomalyMaximum, 4)}.
                </div>
              ) : null}
              <div className="mt-5 h-72 min-w-0 overflow-hidden">
                {anomalyChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
                    <BarChart data={anomalyChartData} layout="vertical" margin={verticalBarChartMargin}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 1]}
                        ticks={normalizedRangeTicks}
                        tickFormatter={formatNormalizedPercent}
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                        width={100}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        formatter={(value) => [`${formatNormalizedPercent(Number(value))}`, "Relative severity"]}
                      />
                      <Bar dataKey="severity" fill="#8bf1a8" radius={[0, 8, 8, 0]} minPointSize={8} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
                    Run or open an unsupervised scan to compare anomaly severity.
                  </div>
                )}
              </div>
            </article>
          </div>

          <article className="min-w-0 self-start border-b border-white/6 pb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Scan summary</p>
            <p className="mt-3 text-sm leading-6 text-white/62">{unsupervisedNarratives.summary}</p>
            {unsupervised ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="border-b border-white/6 pb-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Clusters</p>
                  <p className="mt-2 text-lg font-medium text-white">{unsupervised.cluster_count}</p>
                </div>
                <div className="border-b border-white/6 pb-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Anomalies</p>
                  <p className="mt-2 text-lg font-medium text-white">{unsupervised.anomaly_count}</p>
                </div>
                <div className="border-b border-white/6 pb-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">Numeric fields used</p>
                  <p className="mt-2 text-lg font-medium text-white">{unsupervised.used_numeric_columns.length}</p>
                </div>
                <div className="border-b border-white/6 pb-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/42">PCA variance</p>
                  <p className="mt-2 text-lg font-medium text-white">
                    {unsupervised.pca_explained_variance.map((value) => `${(value * 100).toFixed(1)}%`).join(" • ")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 py-5 text-sm text-white/48">
                Run or open a saved unsupervised scan to populate this summary.
              </div>
            )}

            {busiestCluster ? (
              <div className="mt-4 border-b border-white/6 pb-3 text-sm text-white/68">
                Largest segment: <span className="font-medium text-white">{formatClusterLabel(busiestCluster.cluster)}</span> with {busiestCluster.count.toLocaleString()} rows.
              </div>
            ) : null}
          </article>

          <article className="min-w-0 self-start border-b border-white/6 pb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Top anomaly candidates</p>
            <div className="mt-4 grid items-start gap-3 xl:grid-cols-3">
              {anomalies.map((item) => (
                <div key={item.row} className="border-b border-white/6 pb-3 text-sm text-white/72">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">Row {item.row}</p>
                    <span className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/50">
                      {formatClusterLabel(item.cluster)}
                    </span>
                  </div>
                  <p className="mt-2 text-white/60">
                    anomaly score {formatDisplayNumber(item.anomaly_score, 4)} • PCA ({formatDisplayNumber(item.pc1)}, {formatDisplayNumber(item.pc2)})
                  </p>
                </div>
              ))}
              {!anomalies.length ? (
                <div className="py-5 text-sm text-white/48 xl:col-span-3">
                  The strongest anomaly candidates will appear here after a scan completes.
                </div>
              ) : null}
            </div>
          </article>

          {renderDownloadLibrary("unsupervised", unsupervisedExperiments)}
        </>
      )}
      </section>

      {pendingDeleteExperiment ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[#04090d]/75 p-4 backdrop-blur-md"
          onMouseDown={() => {
            if (!deletingExperimentId) {
              setPendingDeleteExperiment(null);
              setDeleteDialogError("");
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#5a2328]/60 bg-[#111821]/95 p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb4ba]">Delete ML run</p>
            <h2 className="mt-2 font-[family:var(--font-display)] text-2xl text-white">
              Delete this saved {pendingDeleteExperiment.experiment.type} run?
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/66">
              This removes the saved report, summary, and pinned result for this experiment from the current analysis.
            </p>

            {deleteDialogError ? (
              <div className="mt-4 border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffd8d8]">
                {deleteDialogError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteExperiment(null);
                  setDeleteDialogError("");
                }}
                disabled={!!deletingExperimentId}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/82 disabled:cursor-not-allowed disabled:opacity-55"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteSavedExperiment();
                }}
                disabled={!!deletingExperimentId}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#5a2328] bg-[#2a1215] px-5 py-3 text-sm font-semibold text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {deletingExperimentId ? (
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
    </>
  );
}
