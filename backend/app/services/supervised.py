from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, ExtraTreesRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    explained_variance_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .ml_reporting import (
    build_supervised_model_summary,
    build_target_feature_slices,
    get_metric_explanations,
)


MAX_SUPERVISED_ROWS = 8000
MAX_ENCODER_CATEGORIES = 18
RANDOM_FOREST_TREES = 96
EXTRA_TREES = 128
MODEL_N_JOBS = 1

GENERIC_POSITIVE_LABEL_HINTS = (
    "1",
    "true",
    "yes",
    "y",
    "positive",
    "pos",
)


def _can_stratify(target: pd.Series) -> bool:
    counts = target.astype(str).value_counts(dropna=False)
    return int(target.nunique(dropna=True)) > 1 and not counts.empty and int(counts.min()) >= 2


def _sample_training_frame(frame: pd.DataFrame, target_column: str, task_type: str) -> tuple[pd.DataFrame, bool]:
    if len(frame) <= MAX_SUPERVISED_ROWS:
        return frame.reset_index(drop=True), False

    stratify = frame[target_column] if task_type == "classification" and _can_stratify(frame[target_column]) else None
    sampled, _ = train_test_split(
        frame,
        train_size=MAX_SUPERVISED_ROWS,
        random_state=42,
        stratify=stratify,
    )
    return sampled.reset_index(drop=True), True


def _infer_task_type(target: pd.Series) -> str:
    non_null = target.dropna()
    if non_null.empty:
        raise ValueError("Selected target column is empty.")
    if pd.api.types.is_numeric_dtype(non_null):
        unique_count = int(non_null.nunique())
        if unique_count <= 10:
            return "classification"
        return "regression"
    return "classification"


def _resolve_binary_positive_label(target: pd.Series, class_labels: list[Any]) -> Any | None:
    if len(class_labels) != 2:
        return None

    normalized_labels: dict[str, Any] = {}
    for label in class_labels:
        normalized = str(label).strip().lower()
        if normalized and normalized not in normalized_labels:
            normalized_labels[normalized] = label

    for hint in GENERIC_POSITIVE_LABEL_HINTS:
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


def _build_supervised_warnings(
    *,
    task_type: str,
    target: pd.Series,
    best_model_name: str,
    comparisons: list[dict[str, Any]],
    sampling_applied: bool,
    rows_available: int,
    rows_used: int,
    test_rows: int,
    high_cardinality_features: int,
) -> list[str]:
    warnings: list[str] = []

    if sampling_applied:
        warnings.append(
            f"Used a representative sample of {rows_used:,} rows from {rows_available:,} available rows to keep supervised benchmarking responsive."
        )

    if high_cardinality_features > 0:
        warnings.append(
            f"{high_cardinality_features} categorical feature(s) were compressed during encoding so rare categories do not dominate runtime or feature space."
        )

    if test_rows < 120:
        warnings.append(
            f"Only {test_rows:,} rows were held out for testing, so the supervised scores may move noticeably between runs."
        )

    best_metrics = next(
        (item.get("metrics", {}) for item in comparisons if item.get("model") == best_model_name),
        comparisons[0].get("metrics", {}) if comparisons else {},
    )

    if task_type == "classification":
        counts = target.astype(str).value_counts(normalize=True, dropna=False)
        dominant_share = float(counts.iloc[0]) if not counts.empty else 1.0
        class_count = int(target.nunique(dropna=True))
        balanced_accuracy = float(best_metrics.get("balanced_accuracy", 0.0) or 0.0)
        weighted_f1 = float(best_metrics.get("f1", 0.0) or 0.0)
        roc_auc = best_metrics.get("roc_auc")

        if dominant_share >= 0.78:
            warnings.append(
                f"The dominant class accounts for {dominant_share * 100:.1f}% of usable target rows, so some models can look accurate while still missing minority cases."
            )

        if class_count > 6:
            warnings.append(
                f"This target spans {class_count} classes, which splits the training signal across many labels and can depress benchmark scores."
            )

        if (roc_auc is not None and float(roc_auc) < 0.67) or balanced_accuracy < 0.6 or weighted_f1 < 0.58:
            warnings.append(
                "Weak target signal: even the strongest held-out model did not separate the target cleanly, so the available features may not explain this outcome very well."
            )
    else:
        r2 = float(best_metrics.get("r2", 0.0) or 0.0)
        if r2 < 0.15:
            warnings.append(
                "Weak target signal: the best regression model explains only a small share of target variation on the held-out rows."
            )
        if r2 < 0:
            warnings.append(
                "Negative R2 means the benchmark performed worse than predicting the target average, so this target is not behaving like a stable regression outcome yet."
            )

    return warnings


def run_supervised_analysis(frame: pd.DataFrame, target_column: str) -> dict[str, Any]:
    if target_column not in frame.columns:
        raise ValueError("Target column not found in dataset.")

    work = frame.copy()
    work = work.dropna(subset=[target_column])
    if len(work) < 40:
        raise ValueError("Supervised analysis requires at least 40 rows after dropping missing target values.")

    y = work[target_column]
    task_type = _infer_task_type(y)
    modeling_frame, sampling_applied = _sample_training_frame(work, target_column, task_type)

    y = modeling_frame[target_column]
    X = modeling_frame.drop(columns=[target_column]).copy()

    datetime_columns = [column for column in X.columns if np.issubdtype(X[column].dtype, np.datetime64)]
    for column in datetime_columns:
        X[column] = pd.to_datetime(X[column], errors="coerce").map(lambda value: value.toordinal() if pd.notna(value) else np.nan)

    X = X.loc[:, X.notna().any(axis=0)].copy()

    numeric_columns = [column for column in X.columns if pd.api.types.is_numeric_dtype(X[column])]
    categorical_columns = [column for column in X.columns if column not in numeric_columns]
    high_cardinality_features = sum(int(X[column].nunique(dropna=False)) > MAX_ENCODER_CATEGORIES for column in categorical_columns)
    if not numeric_columns and not categorical_columns:
        raise ValueError("No usable feature columns remain after excluding the target column.")

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
                                max_categories=MAX_ENCODER_CATEGORIES,
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
        test_size=0.2,
        random_state=42,
        stratify=stratify,
    )

    candidates: list[tuple[str, Any]]
    if task_type == "classification":
        candidates = [
            (
                "Logistic Regression",
                LogisticRegression(max_iter=1500, class_weight="balanced", C=0.75),
            ),
            (
                "Random Forest",
                RandomForestClassifier(
                    n_estimators=RANDOM_FOREST_TREES,
                    random_state=42,
                    n_jobs=MODEL_N_JOBS,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    max_features="sqrt",
                ),
            ),
            (
                "Extra Trees",
                ExtraTreesClassifier(
                    n_estimators=EXTRA_TREES,
                    random_state=42,
                    n_jobs=MODEL_N_JOBS,
                    min_samples_leaf=1,
                    class_weight="balanced_subsample",
                    max_features="sqrt",
                ),
            ),
        ]
    else:
        candidates = [
            ("Linear Regression", LinearRegression()),
            (
                "Random Forest",
                RandomForestRegressor(
                    n_estimators=RANDOM_FOREST_TREES,
                    random_state=42,
                    n_jobs=MODEL_N_JOBS,
                    min_samples_leaf=2,
                    max_features=0.8,
                ),
            ),
            (
                "Extra Trees",
                ExtraTreesRegressor(
                    n_estimators=EXTRA_TREES,
                    random_state=42,
                    n_jobs=MODEL_N_JOBS,
                    min_samples_leaf=1,
                    max_features=0.9,
                ),
            ),
        ]

    comparisons: list[dict[str, Any]] = []
    best_pipeline: Pipeline | None = None
    best_model_name = ""
    best_score = float("-inf")

    for label, estimator in candidates:
        pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("model", estimator),
            ]
        )
        pipeline.fit(X_train, y_train)
        predictions = pipeline.predict(X_test)

        if task_type == "classification":
            weighted_f1 = float(f1_score(y_test, predictions, average="weighted", zero_division=0))
            balanced_accuracy = float(balanced_accuracy_score(y_test, predictions))
            metrics = {
                "accuracy": round(float(accuracy_score(y_test, predictions)), 6),
                "balanced_accuracy": round(balanced_accuracy, 6),
                "f1": round(weighted_f1, 6),
                "precision": round(float(precision_score(y_test, predictions, average="weighted", zero_division=0)), 6),
                "recall": round(float(recall_score(y_test, predictions, average="weighted", zero_division=0)), 6),
            }
            score = (weighted_f1 * 0.6) + (balanced_accuracy * 0.4)
            if hasattr(pipeline.named_steps["model"], "predict_proba") and y_test.nunique() == 2:
                class_labels = list(getattr(pipeline.named_steps["model"], "classes_", []))
                positive_label = _resolve_binary_positive_label(y, class_labels)
                if positive_label is not None and positive_label in class_labels:
                    positive_index = class_labels.index(positive_label)
                    probabilities = pipeline.predict_proba(X_test)[:, positive_index]
                    y_binary = (y_test == positive_label).astype(int)
                    roc_auc = float(roc_auc_score(y_binary, probabilities))
                    metrics["roc_auc"] = round(roc_auc, 6)
                    metrics["average_precision"] = round(float(average_precision_score(y_binary, probabilities)), 6)
                    score = (score * 0.6) + (roc_auc * 0.4)
        else:
            rmse = float(np.sqrt(mean_squared_error(y_test, predictions)))
            score = float(r2_score(y_test, predictions))
            metrics = {
                "r2": round(score, 6),
                "explained_variance": round(float(explained_variance_score(y_test, predictions)), 6),
                "mae": round(float(mean_absolute_error(y_test, predictions)), 6),
                "rmse": round(rmse, 6),
            }

        comparisons.append({"model": label, "metrics": metrics})
        if score > best_score:
            best_score = score
            best_pipeline = pipeline
            best_model_name = label

    if best_pipeline is None:
        raise ValueError("Unable to train supervised models.")

    transformed_names = best_pipeline.named_steps["preprocessor"].get_feature_names_out().tolist()
    model = best_pipeline.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        importance_values = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "coef_"):
        coefficients = np.asarray(model.coef_, dtype=float)
        if coefficients.ndim > 1:
            importance_values = np.abs(coefficients).mean(axis=0)
        else:
            importance_values = np.abs(coefficients)
    else:
        importance_values = np.zeros(len(transformed_names), dtype=float)

    ranking = sorted(
        zip(transformed_names, importance_values),
        key=lambda item: float(item[1]),
        reverse=True,
    )[:15]

    preview_frame = X_test.head(100).astype(object).where(pd.notnull(X_test.head(100)), None)
    preview_predictions = best_pipeline.predict(X_test.head(100))
    predictions_preview = []
    for index, (_, row) in enumerate(preview_frame.iterrows()):
        predictions_preview.append(
            {
                "record": row.to_dict(),
                "actual": y_test.iloc[index].item() if hasattr(y_test.iloc[index], "item") else y_test.iloc[index],
                "prediction": preview_predictions[index].item() if hasattr(preview_predictions[index], "item") else preview_predictions[index],
            }
        )

    result = {
        "task_type": task_type,
        "target_column": target_column,
        "best_model": best_model_name,
        "model_comparison": comparisons,
        "feature_importance": [
            {"feature": str(name), "importance": round(float(value), 6)}
            for name, value in ranking
        ],
        "predictions_preview": predictions_preview,
        "diagnostics": {
            "rows_available": int(len(work)),
            "rows_used": int(len(modeling_frame)),
            "training_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "numeric_features": int(len(numeric_columns)),
            "categorical_features": int(len(categorical_columns)),
            "high_cardinality_features": int(high_cardinality_features),
            "sampling_applied": bool(sampling_applied),
            "target_cardinality": int(y.nunique(dropna=True)),
        },
        "warnings": _build_supervised_warnings(
            task_type=task_type,
            target=y,
            best_model_name=best_model_name,
            comparisons=comparisons,
            sampling_applied=sampling_applied,
            rows_available=int(len(work)),
            rows_used=int(len(modeling_frame)),
            test_rows=int(len(X_test)),
            high_cardinality_features=int(high_cardinality_features),
        ),
    }
    result["metric_explanations"] = get_metric_explanations(task_type)
    result["target_feature_slices"] = build_target_feature_slices(work, target_column, task_type)
    result["model_summary"] = build_supervised_model_summary(result)
    return result