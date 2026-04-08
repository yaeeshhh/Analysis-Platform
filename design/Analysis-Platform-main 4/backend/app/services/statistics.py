from __future__ import annotations

from typing import Any

import pandas as pd

from .profiling import profile_schema


def _string_with_missing(series: pd.Series) -> pd.Series:
    return series.astype(object).where(pd.notna(series), "<missing>").astype(str)


def build_statistics(frame: pd.DataFrame, schema_profile: dict[str, Any] | None = None) -> dict[str, Any]:
    schema_profile = schema_profile or profile_schema(frame)
    column_meta = {item["name"]: item for item in schema_profile.get("columns", [])}

    numeric_summary: list[dict[str, Any]] = []
    categorical_summary: list[dict[str, Any]] = []
    datetime_summary: list[dict[str, Any]] = []
    correlation_matrix: list[dict[str, Any]] = []

    numeric_columns = [name for name, meta in column_meta.items() if meta.get("inferred_type") == "numeric"]
    categorical_columns = [name for name, meta in column_meta.items() if meta.get("inferred_type") in {"categorical", "boolean", "text"}]
    datetime_columns = [name for name, meta in column_meta.items() if meta.get("inferred_type") == "datetime"]

    for column in numeric_columns:
        series = pd.to_numeric(frame[column], errors="coerce")
        valid = series.dropna()
        if valid.empty:
            continue
        numeric_summary.append(
            {
                "column": column,
                "count": int(valid.count()),
                "mean": round(float(valid.mean()), 6),
                "median": round(float(valid.median()), 6),
                "std": round(float(valid.std(ddof=0) or 0.0), 6),
                "min": round(float(valid.min()), 6),
                "max": round(float(valid.max()), 6),
                "q1": round(float(valid.quantile(0.25)), 6),
                "q3": round(float(valid.quantile(0.75)), 6),
                "skew": round(float(valid.skew() or 0.0), 6),
            }
        )

    for column in categorical_columns:
        series = _string_with_missing(frame[column])
        counts = series.value_counts(dropna=False).head(10)
        categorical_summary.append(
            {
                "column": column,
                "unique_count": int(series.nunique(dropna=False)),
                "top_values": [
                    {
                        "value": str(index),
                        "count": int(value),
                        "pct": round(float(value / max(1, len(series))), 4),
                    }
                    for index, value in counts.items()
                ],
            }
        )

    for column in datetime_columns:
        series = pd.to_datetime(frame[column], errors="coerce")
        valid = series.dropna()
        if valid.empty:
            continue
        datetime_summary.append(
            {
                "column": column,
                "min": valid.min().isoformat(),
                "max": valid.max().isoformat(),
                "span_days": int((valid.max() - valid.min()).days),
            }
        )

    if len(numeric_columns) >= 2:
        corr = frame[numeric_columns].apply(pd.to_numeric, errors="coerce").corr(numeric_only=True)
        limited = corr.iloc[:12, :12]
        correlation_matrix = [
            {
                "x": str(row_name),
                "y": str(col_name),
                "value": round(float(limited.loc[row_name, col_name]), 4),
            }
            for row_name in limited.index
            for col_name in limited.columns
            if pd.notna(limited.loc[row_name, col_name])
        ]

    return {
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "datetime_summary": datetime_summary,
        "correlation_matrix": correlation_matrix,
    }