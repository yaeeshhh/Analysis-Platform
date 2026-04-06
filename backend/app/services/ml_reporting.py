from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import balanced_accuracy_score, explained_variance_score, r2_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


OUTCOME_NAME_HINTS = (
    "churn",
    "attrition",
    "cancel",
    "cancellation",
    "retention",
    "renewal",
    "default",
    "fraud",
    "response",
    "outcome",
    "target",
    "label",
    "converted",
    "conversion",
)

EXACT_OUTCOME_NAME_HINTS = OUTCOME_NAME_HINTS + (
    "class",
    "status",
    "result",
)
PROBE_MAX_ROWS = 1800
PROBE_TOP_CANDIDATES = 4
PROBE_BLEND_WEIGHT = 0.22
PROBE_MAX_CLASSES = 12
PROBE_MAX_ENCODER_CATEGORIES = 16
PROBE_POSITIVE_LABEL_HINTS = (
    "1",
    "true",
    "yes",
    "y",
    "positive",
    "pos",
    "high",
    "success",
    "passed",
    "pass",
)


def _string_with_missing(series: pd.Series) -> pd.Series:
    return series.astype(object).where(pd.notna(series), "<missing>").astype(str)


def _outcome_name_bonus(name_lower: str) -> float:
    if name_lower in EXACT_OUTCOME_NAME_HINTS:
        return 0.16
    if any(hint in name_lower for hint in OUTCOME_NAME_HINTS):
        return 0.09
    return 0.0


def _feature_name_penalty(name_lower: str) -> float:
    if "plan" in name_lower:
        return 0.08
    if any(hint in name_lower for hint in ("segment", "tier", "band", "bucket", "group")):
        return 0.05
    return 0.0


def _looks_code_like_header(name_lower: str) -> bool:
    return (
        name_lower == "id"
        or name_lower.endswith(" id")
        or name_lower.endswith("_id")
        or name_lower.endswith(" code")
        or "identifier" in name_lower
        or "area code" in name_lower
        or "postal" in name_lower
        or "pincode" in name_lower
        or name_lower.endswith("zip")
    )


def _clamp_unit(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _normalized_entropy(series: pd.Series) -> float:
    if series.empty or int(series.nunique(dropna=False)) <= 1:
        return 0.0

    proportions = series.astype(str).value_counts(normalize=True, dropna=False)
    entropy = float(-(proportions * np.log2(proportions.clip(lower=1e-12))).sum())
    max_entropy = float(np.log2(len(proportions))) if len(proportions) > 1 else 0.0
    if max_entropy <= 0:
        return 0.0

    return _clamp_unit(entropy / max_entropy)


def _probe_task_type(target: pd.Series) -> str:
    non_null = target.dropna()
    if non_null.empty:
        raise ValueError("Target is empty.")
    if pd.api.types.is_numeric_dtype(non_null):
        return "classification" if int(non_null.nunique()) <= 10 else "regression"
    return "classification"


def _can_stratify(target: pd.Series) -> bool:
    counts = target.astype(str).value_counts(dropna=False)
    return int(target.nunique(dropna=True)) > 1 and not counts.empty and int(counts.min()) >= 2


def _sample_probe_frame(frame: pd.DataFrame, target_column: str, task_type: str) -> pd.DataFrame:
    if len(frame) <= PROBE_MAX_ROWS:
        return frame.reset_index(drop=True)

    stratify = frame[target_column] if task_type == "classification" and _can_stratify(frame[target_column]) else None
    sampled, _ = train_test_split(
        frame,
        train_size=PROBE_MAX_ROWS,
        random_state=42,
        stratify=stratify,
    )
    return sampled.reset_index(drop=True)


def _resolve_probe_positive_label(target: pd.Series, class_labels: list[Any]) -> Any | None:
    if len(class_labels) != 2:
        return None

    normalized_labels: dict[str, Any] = {}
    for label in class_labels:
        normalized = str(label).strip().lower()
        if normalized and normalized not in normalized_labels:
            normalized_labels[normalized] = label

    for hint in PROBE_POSITIVE_LABEL_HINTS:
        if hint in normalized_labels:
            return normalized_labels[hint]

    counts = target.value_counts(dropna=True)
    ranked_labels = [
        (int(counts.get(label, 0)), index, label)
        for index, label in enumerate(class_labels)
    ]
    if any(count > 0 for count, _, _ in ranked_labels):
        return min(ranked_labels, key=lambda item: (item[0], item[1]))[2]

    return class_labels[-1]


def _probe_target_learnability(
    frame: pd.DataFrame,
    target_column: str,
    recommended_task: str,
) -> dict[str, Any] | None:
    if target_column not in frame.columns:
        return None

    work = frame.dropna(subset=[target_column]).copy()
    if len(work) < 80:
        return None

    task_type = recommended_task if recommended_task in {"classification", "regression"} else _probe_task_type(work[target_column])
    if task_type == "classification" and int(work[target_column].nunique(dropna=True)) > PROBE_MAX_CLASSES:
        return None

    sampled = _sample_probe_frame(work, target_column, task_type)
    y = sampled[target_column]
    X = sampled.drop(columns=[target_column]).copy()

    datetime_columns = [column for column in X.columns if np.issubdtype(X[column].dtype, np.datetime64)]
    for column in datetime_columns:
        X[column] = pd.to_datetime(X[column], errors="coerce").map(lambda value: value.toordinal() if pd.notna(value) else np.nan)

    X = X.loc[:, X.notna().any(axis=0)].copy()

    numeric_columns = [column for column in X.columns if pd.api.types.is_numeric_dtype(X[column])]
    categorical_columns = [column for column in X.columns if column not in numeric_columns]
    if not numeric_columns and not categorical_columns:
        return None

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_columns,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "encoder",
                            OneHotEncoder(
                                handle_unknown="infrequent_if_exist",
                                max_categories=PROBE_MAX_ENCODER_CATEGORIES,
                            ),
                        ),
                    ]
                ),
                categorical_columns,
            ),
        ]
    )

    stratify = y if task_type == "classification" and _can_stratify(y) else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=stratify,
    )

    if task_type == "classification":
        pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("model", LogisticRegression(max_iter=600, class_weight="balanced", C=0.7)),
            ]
        )
        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)
        balanced_accuracy = float(balanced_accuracy_score(y_test, predictions))
        probe_score = _clamp_unit(balanced_accuracy)
        reason = f"Quick probe: held-out learnability looked like balanced accuracy {balanced_accuracy:.2f}."

        if hasattr(pipeline.named_steps["model"], "predict_proba") and y_test.nunique() == 2:
            class_labels = list(getattr(pipeline.named_steps["model"], "classes_", []))
            positive_label = _resolve_probe_positive_label(y, class_labels)
            if positive_label is not None and positive_label in class_labels:
                positive_index = class_labels.index(positive_label)
                probabilities = pipeline.predict_proba(X_test)[:, positive_index]
                y_binary = (y_test == positive_label).astype(int)
                try:
                    roc_auc = float(roc_auc_score(y_binary, probabilities))
                    probe_score = _clamp_unit((balanced_accuracy + roc_auc) / 2.0)
                    reason = f"Quick probe: held-out learnability looked like balanced accuracy {balanced_accuracy:.2f} and ROC AUC {roc_auc:.2f}."
                except ValueError:
                    pass

        return {"score": probe_score, "reason": reason}

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", LinearRegression()),
        ]
    )
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)
    r2 = float(r2_score(y_test, predictions))
    explained_variance = float(explained_variance_score(y_test, predictions))
    probe_score = _clamp_unit((max(0.0, r2) * 0.7) + (max(0.0, explained_variance) * 0.3))
    return {
        "score": probe_score,
        "reason": f"Quick probe: held-out learnability looked like R2 {r2:.2f} and explained variance {explained_variance:.2f}.",
    }


def _rerank_with_probe(frame: pd.DataFrame, recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(recommendations, key=lambda item: (-float(item.get("score", 0.0)), str(item.get("column", "")).lower()))
    probed = 0

    for item in ordered:
        if item.get("recommended_task") == "none" or float(item.get("score", 0.0)) < 0.52:
            continue
        if probed >= PROBE_TOP_CANDIDATES:
            break

        probe = _probe_target_learnability(frame, str(item.get("column", "")), str(item.get("recommended_task", "none")))
        if not probe:
            continue

        heuristic_score = float(item.get("score", 0.0))
        item["heuristic_score"] = round(heuristic_score, 4)
        item["probe_score"] = round(float(probe["score"]), 4)
        item["score"] = round(
            _clamp_unit((heuristic_score * (1.0 - PROBE_BLEND_WEIGHT)) + (float(probe["score"]) * PROBE_BLEND_WEIGHT)),
            4,
        )
        item.setdefault("reasons", []).append(str(probe["reason"]))
        probed += 1

    return ordered


def build_target_recommendations(
    frame: pd.DataFrame,
    schema: dict[str, Any],
    limit: int = 8,
) -> list[dict[str, Any]]:
    row_count = max(1, int(len(frame)))
    recommendations: list[dict[str, Any]] = []

    for column in schema.get("columns", []):
        name = str(column.get("name", ""))
        name_lower = name.strip().lower()
        outcome_name_bonus = _outcome_name_bonus(name_lower)
        feature_name_penalty = _feature_name_penalty(name_lower)
        series = frame[name] if name in frame.columns else pd.Series(dtype="object")
        non_null = series.dropna()
        non_null_count = int(len(non_null))
        inferred_type = str(column.get("inferred_type", "unknown"))
        semantic_type = str(column.get("semantic_type", inferred_type or "unknown"))
        likely_role = str(column.get("likely_role", "unknown"))
        unique_count = int(column.get("unique_count", 0))
        unique_pct = float(column.get("unique_pct", 0.0))
        missing_pct = float(column.get("missing_pct", 0.0))
        reasons: list[str] = []
        recommended_task = "none"
        verdict = "bad target"
        score = 0.0
        coverage_score = _clamp_unit(1.0 - (missing_pct * 1.6))
        dataset_support_score = _clamp_unit(non_null_count / 500.0)

        if likely_role == "identifier" or unique_pct >= 0.95:
            reasons.append("Almost every row has a unique value, so the column behaves like an identifier.")
        elif unique_count < 2:
            reasons.append("The column has fewer than two distinct values, so it cannot act as a useful target.")
        elif missing_pct > 0.35:
            reasons.append("Too many target values are missing for a stable supervised workflow.")
        elif inferred_type in {"boolean", "categorical"} or (
            inferred_type == "numeric" and 2 <= unique_count <= 10
        ):
            value_counts = non_null.astype(str).value_counts(dropna=False)
            dominant_share = float(value_counts.iloc[0] / max(1, non_null_count)) if non_null_count else 1.0
            rows_per_class = float(non_null_count / max(1, unique_count))
            balance_score = _normalized_entropy(non_null)
            support_per_class_score = _clamp_unit(rows_per_class / 180.0)
            compact_class_score = _clamp_unit(1.0 - (max(0.0, unique_count - 2) / 18.0))

            recommended_task = "classification"
            score = (
                0.08
                + coverage_score * 0.18
                + balance_score * 0.22
                + support_per_class_score * 0.14
                + compact_class_score * 0.12
                + dataset_support_score * 0.06
            )
            reasons.append("The column has a limited number of classes, which fits classification.")
            if inferred_type == "boolean":
                score += 0.04
                reasons.append("Binary outcomes are usually easier to benchmark clearly than multi-class targets.")
            if semantic_type == "ordinal_category":
                score += 0.03
                reasons.append("The values look ordered, which can still produce a clean classification target even without numeric encoding.")
            if outcome_name_bonus > 0:
                score += outcome_name_bonus
                reasons.append("The header reads like a business outcome, so it is more likely to be the target you want to predict.")
            if feature_name_penalty > 0:
                score -= feature_name_penalty
                reasons.append("The header reads like a feature flag or grouping field, which often works better as an input than as the outcome to predict.")
            if semantic_type in {"email", "phone", "url", "identifier", "postal_code"}:
                score -= 0.28
                reasons.append("The semantic profile reads more like contact, routing, or identifier data than a business outcome.")
            if semantic_type in {"latitude", "longitude", "free_text"}:
                score -= 0.16
                reasons.append("The semantic profile reads more like descriptive or coordinate data than a stable supervised target.")
            if semantic_type == "location_label":
                score -= 0.05
                reasons.append("Location labels are often better used as inputs unless the dataset is explicitly about regional classification.")
            if missing_pct > 0.15:
                reasons.append("Missing target values will reduce usable training rows.")
            if dominant_share > 0.7:
                score -= min(0.22, (dominant_share - 0.7) * 0.55)
                reasons.append(
                    f"The largest class represents {dominant_share * 100:.1f}% of usable rows, so minority recall may be harder to learn."
                )
            else:
                reasons.append("Class balance looks stable enough for a benchmark to be informative.")
            if rows_per_class < 40:
                score -= min(0.18, ((40.0 - rows_per_class) / 40.0) * 0.18)
                reasons.append(
                    f"Average support is only about {rows_per_class:.0f} rows per class, which makes the holdout scores less stable."
                )
            if unique_count > max(8, int(row_count * 0.08)):
                score -= min(0.14, (unique_count - max(8, int(row_count * 0.08))) * 0.015)
                reasons.append("There are enough classes that class imbalance or sparsity may become a problem.")
            if likely_role not in {"target-candidate", "boolean"}:
                score -= 0.18
                reasons.append("The profiling pass reads this more like an input feature than a direct business outcome.")
            if _looks_code_like_header(name_lower):
                score -= 0.32
                reasons.append("The header looks like a routing or code field, which is often metadata rather than the business outcome you want to predict.")
            verdict = (
                "good classification target"
                if score >= 0.78
                else "usable classification target"
                if score >= 0.62
                else "weak target"
            )
        elif inferred_type == "numeric":
            numeric = pd.to_numeric(non_null, errors="coerce").dropna()
            numeric_count = int(len(numeric))
            unique_support_score = _clamp_unit(unique_count / max(30.0, numeric_count * 0.45))
            resolution_score = _clamp_unit(unique_pct / 0.85)
            q10 = float(numeric.quantile(0.10)) if numeric_count else 0.0
            q90 = float(numeric.quantile(0.90)) if numeric_count else 0.0
            spread_score = 1.0 if q90 > q10 else 0.0
            dominant_value_share = (
                float(numeric.value_counts(dropna=False).iloc[0] / max(1, numeric_count))
                if numeric_count
                else 1.0
            )

            recommended_task = "regression"
            score = (
                0.1
                + coverage_score * 0.2
                + unique_support_score * 0.14
                + resolution_score * 0.18
                + spread_score * 0.16
                + dataset_support_score * 0.1
            )
            reasons.append("The column is numeric with enough spread to support regression.")
            if unique_count < 12:
                score -= min(0.22, ((12.0 - unique_count) / 12.0) * 0.22)
                reasons.append("Low numeric variety may make regression unstable or unnecessary.")
            if outcome_name_bonus > 0:
                score += min(0.12, outcome_name_bonus)
                reasons.append("The header reads like a business outcome, so it is more likely to be the target you want to predict.")
            if semantic_type in {"currency", "percentage", "count", "duration"}:
                score += 0.03
                reasons.append("The semantic profile matches a numeric business measure, which is a more natural fit for regression.")
            if feature_name_penalty > 0:
                score -= min(0.06, feature_name_penalty)
                reasons.append("The header reads like a feature flag or grouping field, which often works better as an input than as the outcome to predict.")
            if semantic_type in {"email", "phone", "url", "identifier", "postal_code"}:
                score -= 0.28
                reasons.append("The semantic profile reads more like contact, routing, or identifier data than a numeric business outcome.")
            if unique_pct > 0.9:
                score -= min(0.16, (unique_pct - 0.9) * 1.2)
                reasons.append("Very high uniqueness can indicate a near-identifier rather than a business target.")
            if missing_pct > 0.15:
                reasons.append("Missing target values will reduce usable training rows.")
            if numeric_count < 80:
                score -= min(0.14, ((80.0 - numeric_count) / 80.0) * 0.14)
                reasons.append("There are not many usable target rows, so regression scores may move more between runs.")
            if q90 <= q10:
                score -= 0.18
                reasons.append("The target shows limited spread across the middle of the distribution, which reduces learnable signal.")
            if dominant_value_share > 0.08:
                score -= min(0.12, (dominant_value_share - 0.08) * 0.8)
                reasons.append("A repeated dominant value takes up a noticeable share of rows, which makes the target less informative for regression.")
            if likely_role not in {"target-candidate", "boolean"}:
                score -= 0.18
                reasons.append("The profiling pass reads this more like an input feature than a direct business outcome.")
            if _looks_code_like_header(name_lower):
                score -= 0.3
                reasons.append("The header looks like a routing or code field, which is often metadata rather than the business outcome you want to predict.")
            if semantic_type in {"latitude", "longitude", "free_text"}:
                score -= 0.16
                reasons.append("The semantic profile reads more like descriptive or coordinate data than a stable numeric target.")
            if semantic_type == "location_label":
                score -= 0.05
                reasons.append("Location labels are often better used as inputs unless the dataset is explicitly about regional forecasting.")
            verdict = (
                "good regression target"
                if score >= 0.74
                else "usable regression target"
                if score >= 0.58
                else "weak target"
            )
        else:
            reasons.append("The column type is not a strong fit for direct supervised learning.")

        recommendations.append(
            {
                "column": name,
                "recommended_task": recommended_task,
                "semantic_type": semantic_type,
                "verdict": verdict,
                "score": round(_clamp_unit(score), 4),
                "reasons": reasons,
            }
        )

    reranked = _rerank_with_probe(frame, recommendations)
    return sorted(reranked, key=lambda item: (-float(item["score"]), str(item["column"]).lower()))[:limit]


def get_metric_explanations(task_type: str) -> dict[str, str]:
    if task_type == "classification":
        return {
            "accuracy": "Overall share of predictions that match the true label. Useful, but it can hide poor minority-class performance.",
            "balanced_accuracy": "Average recall across classes. It is more trustworthy than plain accuracy when one class dominates the dataset.",
            "f1": "Balances precision and recall, so it is a better single score when classes are uneven or false negatives matter.",
            "precision": "Of the rows predicted as a class, how many were actually correct. Higher precision means fewer false alarms.",
            "recall": "Of the rows that truly belong to a class, how many the model actually found. Higher recall means fewer missed cases.",
            "roc_auc": "Measures how well the model ranks positive cases above negative ones. Values closer to 1.0 indicate stronger separation.",
            "average_precision": "Summarizes precision-recall performance for imbalanced binary targets. Higher values mean the positive class is ranked more cleanly.",
        }

    return {
        "r2": "Share of target variation explained by the model. Higher is better, and values below 0 mean the model is worse than predicting the average.",
        "explained_variance": "Shows how much of the target spread the model captures, without penalizing constant offset errors as strongly as R2.",
        "mae": "Average absolute prediction error in the original target units. Lower is easier to interpret and generally better.",
        "rmse": "Root mean squared error in the original target units. Lower is better, and it penalizes large mistakes more heavily than MAE.",
    }


def build_supervised_model_summary(result: dict[str, Any]) -> str:
    comparisons = result.get("model_comparison", []) or []
    best_model = str(result.get("best_model", "best model"))
    task_type = str(result.get("task_type", "supervised"))
    target_column = str(result.get("target_column", "target"))
    best = next((item for item in comparisons if item.get("model") == best_model), comparisons[0] if comparisons else None)
    if not best:
        return f"{best_model} produced the strongest {task_type} result for {target_column}."

    metric_bits = []
    for name, value in (best.get("metrics") or {}).items():
        try:
            metric_bits.append(f"{name}={float(value):.3f}")
        except (TypeError, ValueError):
            continue

    metrics_text = ", ".join(metric_bits) if metric_bits else "no metrics available"
    return f"{best_model} performed best for the {task_type} target '{target_column}' with {metrics_text}."


def build_unsupervised_summary(result: dict[str, Any]) -> str:
    cluster_count = int(result.get("cluster_count", 0))
    anomaly_count = int(result.get("anomaly_count", 0))
    variance = sum(float(value) for value in result.get("pca_explained_variance", [])[:2]) * 100
    return (
        f"Unsupervised analysis found {cluster_count} clusters, flagged {anomaly_count} anomaly candidates, "
        f"and the first two PCA components explain {variance:.1f}% of variance."
    )


def build_target_feature_slices(
    frame: pd.DataFrame,
    target_column: str,
    task_type: str,
    limit: int = 4,
) -> list[dict[str, Any]]:
    if target_column not in frame.columns:
        return []

    work = frame.dropna(subset=[target_column]).copy()
    if len(work) < 20:
        return []

    target = work[target_column]
    features = work.drop(columns=[target_column])
    numeric_columns = [column for column in features.columns if pd.api.types.is_numeric_dtype(features[column])]
    categorical_columns = [column for column in features.columns if column not in numeric_columns]
    slices: list[dict[str, Any]] = []

    binary_positive_label: str | None = None
    target_numeric: pd.Series | None = None
    if task_type == "regression":
        target_numeric = pd.to_numeric(target, errors="coerce")
    elif int(target.nunique(dropna=True)) == 2:
        labels = sorted(str(value) for value in target.dropna().unique().tolist())
        binary_positive_label = labels[-1] if labels else None

    numeric_scores: list[tuple[str, float]] = []
    for column in numeric_columns:
        series = pd.to_numeric(features[column], errors="coerce")
        valid = series.notna()
        if valid.sum() < 20:
            continue
        if task_type == "regression" and target_numeric is not None:
            valid = valid & target_numeric.notna()
            if valid.sum() < 20:
                continue
            score = abs(float(series[valid].corr(target_numeric[valid]) or 0.0))
        elif binary_positive_label is not None:
            encoded = (target.astype(str) == binary_positive_label).astype(float)
            score = abs(float(series[valid].corr(encoded[valid]) or 0.0))
        else:
            score = float(series.std(ddof=0) or 0.0)
        numeric_scores.append((column, score))

    for column, _ in sorted(numeric_scores, key=lambda item: item[1], reverse=True)[:limit]:
        series = pd.to_numeric(features[column], errors="coerce")
        valid = work[[column, target_column]].dropna().copy()
        if len(valid) < 20:
            continue
        try:
            valid["bucket"] = pd.qcut(valid[column], q=min(5, valid[column].nunique()), duplicates="drop")
        except ValueError:
            continue
        rows = []
        for bucket, bucket_frame in valid.groupby("bucket", observed=False):
            bucket_label = str(bucket)
            item: dict[str, Any] = {"label": bucket_label, "count": int(len(bucket_frame))}
            if task_type == "regression":
                item["target_label"] = f"Average {target_column}"
                item["target_value"] = round(float(pd.to_numeric(bucket_frame[target_column], errors="coerce").mean()), 6)
            elif binary_positive_label is not None:
                positive_rate = float((bucket_frame[target_column].astype(str) == binary_positive_label).mean())
                item["target_label"] = f"{binary_positive_label} rate"
                item["target_value"] = round(positive_rate, 6)
            else:
                mode = bucket_frame[target_column].astype(str).mode().iloc[0]
                share = float((bucket_frame[target_column].astype(str) == mode).mean())
                item["target_label"] = "Dominant class share"
                item["target_value"] = round(share, 6)
                item["target_class"] = mode
            rows.append(item)

        if rows:
            slices.append(
                {
                    "feature": column,
                    "feature_type": "numeric",
                    "summary": f"{target_column} behavior across {column} value bands.",
                    "rows": rows,
                }
            )

    for column in categorical_columns:
        series = _string_with_missing(features[column])
        if series.nunique(dropna=False) < 2:
            continue
        counts = series.value_counts(dropna=False)
        top_values = counts.head(6).index.tolist()
        rows = []
        for value in top_values:
            mask = series == value
            if int(mask.sum()) < 5:
                continue
            item: dict[str, Any] = {"label": str(value), "count": int(mask.sum())}
            subset = work.loc[mask, target_column]
            if task_type == "regression":
                item["target_label"] = f"Average {target_column}"
                item["target_value"] = round(float(pd.to_numeric(subset, errors="coerce").mean()), 6)
            elif binary_positive_label is not None:
                positive_rate = float((subset.astype(str) == binary_positive_label).mean())
                item["target_label"] = f"{binary_positive_label} rate"
                item["target_value"] = round(positive_rate, 6)
            else:
                mode = subset.astype(str).mode().iloc[0]
                share = float((subset.astype(str) == mode).mean())
                item["target_label"] = "Dominant class share"
                item["target_value"] = round(share, 6)
                item["target_class"] = mode
            rows.append(item)

        if rows:
            slices.append(
                {
                    "feature": column,
                    "feature_type": "categorical",
                    "summary": f"{target_column} behavior across the most common {column} categories.",
                    "rows": rows,
                }
            )
        if len(slices) >= limit + 2:
            break

    return slices[: limit + 2]