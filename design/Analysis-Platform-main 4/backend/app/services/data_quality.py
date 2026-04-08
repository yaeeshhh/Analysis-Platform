from __future__ import annotations

from typing import Any

import pandas as pd

from .profiling import infer_column_type


def analyze_data_quality(frame: pd.DataFrame) -> dict[str, Any]:
    row_count = int(len(frame))
    column_count = int(len(frame.columns))
    missing_by_column: list[dict[str, Any]] = []
    constant_columns: list[str] = []
    near_constant_columns: list[dict[str, Any]] = []
    high_cardinality_columns: list[dict[str, Any]] = []
    invalid_numeric_columns: list[dict[str, Any]] = []
    outlier_columns: list[dict[str, Any]] = []

    numeric_columns: list[str] = []
    categorical_columns: list[str] = []

    for column in frame.columns:
        series = frame[column]
        non_null = series.dropna()
        missing_count = int(series.isna().sum())
        missing_pct = float(missing_count / max(1, row_count))
        if missing_count > 0:
            missing_by_column.append(
                {
                    "column": str(column),
                    "missing_count": missing_count,
                    "missing_pct": round(missing_pct, 4),
                }
            )

        unique_count = int(non_null.nunique(dropna=True))
        is_constant = unique_count <= 1
        if is_constant:
            constant_columns.append(str(column))

        # Only flag near-constant if not already flagged as constant.
        if not is_constant and len(non_null) > 0:
            top_frequency = float(non_null.astype(str).value_counts(normalize=True, dropna=False).iloc[0])
            if 0.95 <= top_frequency < 1.0:
                near_constant_columns.append(
                    {
                        "column": str(column),
                        "dominant_value_ratio": round(top_frequency, 4),
                    }
                )

        inferred_type = infer_column_type(series)
        if inferred_type == "numeric":
            numeric_columns.append(str(column))
            numeric = pd.to_numeric(series, errors="coerce")
            valid = numeric.dropna()
            # Need at least 10 values for IQR to be statistically meaningful.
            if len(valid) >= 10:
                q1 = float(valid.quantile(0.25))
                q3 = float(valid.quantile(0.75))
                iqr = q3 - q1
                if iqr > 0:
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    outlier_count = int(((valid < lower) | (valid > upper)).sum())
                    if outlier_count > 0:
                        outlier_columns.append(
                            {
                                "column": str(column),
                                "outlier_count": outlier_count,
                                "outlier_pct": round(outlier_count / max(1, len(valid)), 4),
                            }
                        )
        elif inferred_type in {"categorical", "boolean", "text", "unknown"}:
            categorical_columns.append(str(column))
            numeric_ratio = float(pd.to_numeric(non_null, errors="coerce").notna().mean()) if len(non_null) else 0.0
            if 0.2 <= numeric_ratio < 0.9:
                invalid_numeric_columns.append(
                    {
                        "column": str(column),
                        "numeric_parse_ratio": round(numeric_ratio, 4),
                    }
                )
            unique_ratio = unique_count / max(1, row_count)
            if unique_ratio > 0.5 and unique_count > 25:
                high_cardinality_columns.append(
                    {
                        "column": str(column),
                        "unique_count": unique_count,
                        "unique_pct": round(unique_ratio, 4),
                    }
                )

    high_correlations: list[dict[str, Any]] = []
    if len(numeric_columns) >= 2:
        numeric_frame = frame[numeric_columns].apply(pd.to_numeric, errors="coerce")
        corr = numeric_frame.corr()
        for i, col_a in enumerate(corr.columns):
            for col_b in corr.columns[i + 1 :]:
                value = corr.loc[col_a, col_b]
                if pd.notna(value) and abs(float(value)) >= 0.85:
                    high_correlations.append(
                        {
                            "column_a": str(col_a),
                            "column_b": str(col_b),
                            "correlation": round(float(value), 4),
                        }
                    )

    duplicate_row_count = int(frame.duplicated().sum())
    duplicate_pct = float(duplicate_row_count / max(1, row_count))
    max_missing_pct = max((item["missing_pct"] for item in missing_by_column), default=0.0)
    total_missing_pct = float(frame.isna().sum().sum() / max(1, row_count * max(1, column_count)))
    outlier_column_share = float(len(outlier_columns) / max(1, len(numeric_columns))) if numeric_columns else 0.0
    mean_outlier_pct = (
        float(sum(item["outlier_pct"] for item in outlier_columns) / max(1, len(outlier_columns)))
        if outlier_columns
        else 0.0
    )
    invalid_numeric_penalty = min(
        sum((1.0 - float(item["numeric_parse_ratio"])) * 6.0 for item in invalid_numeric_columns),
        12.0,
    )

    # Use severity-weighted penalties so wide datasets with many mildly noisy columns
    # do not collapse to zero purely because several fields share the same issue type.
    # Constant column penalty is proportional to share of total columns to avoid
    # over-penalising legitimate sparse one-hot datasets.
    constant_column_share = len(constant_columns) / max(1, column_count)
    penalties = {
        "missing": (max_missing_pct * 25.0) + (total_missing_pct * 20.0),
        "duplicates": min(duplicate_pct * 40.0, 20.0),
        "constant": min(constant_column_share * 20.0, 16.0),
        "near_constant": min(len(near_constant_columns) * 1.5, 12.0),
        "high_cardinality": min(len(high_cardinality_columns) * 2.0, 12.0),
        "invalid_numeric": invalid_numeric_penalty,
        "outliers": min((outlier_column_share * 12.0) + (mean_outlier_pct * 20.0), 20.0),
        "correlations": min(len(high_correlations) * 4.0, 12.0),
    }
    quality_score = max(0.0, min(100.0, 100.0 - sum(penalties.values())))

    recommendations: list[str] = []
    if missing_by_column:
        recommendations.append("Review columns with missing values above 20% before modeling or downstream reporting.")
    if constant_columns:
        recommendations.append("Drop constant columns because they do not add analytical signal.")
    if high_correlations:
        recommendations.append("Consider removing one variable from highly correlated numeric pairs to reduce redundancy.")
    if outlier_columns:
        recommendations.append("Inspect numeric outliers to distinguish data entry errors from meaningful rare cases.")
    if not recommendations:
        recommendations.append("Dataset quality looks usable for exploratory analysis without major cleaning blockers.")

    return {
        "duplicate_row_count": duplicate_row_count,
        "missing_by_column": sorted(missing_by_column, key=lambda item: item["missing_pct"], reverse=True),
        "constant_columns": constant_columns,
        "near_constant_columns": near_constant_columns,
        "high_cardinality_columns": high_cardinality_columns,
        "invalid_numeric_columns": invalid_numeric_columns,
        "outlier_columns": outlier_columns,
        "high_correlations": high_correlations,
        "quality_score": round(float(quality_score), 2),
        "recommendations": recommendations,
    }