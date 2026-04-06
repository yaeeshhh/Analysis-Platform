from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .profiling import profile_schema


def _string_with_missing(series: pd.Series) -> pd.Series:
    return series.astype(object).where(pd.notna(series), "<missing>").astype(str)


def build_visualisations(frame: pd.DataFrame, schema_profile: dict[str, Any] | None = None) -> dict[str, Any]:
    schema_profile = schema_profile or profile_schema(frame)
    column_meta = {item["name"]: item for item in schema_profile.get("columns", [])}
    numeric_columns = [name for name, meta in column_meta.items() if meta.get("inferred_type") == "numeric"]
    categorical_columns = [name for name, meta in column_meta.items() if meta.get("inferred_type") in {"categorical", "boolean", "text"}]

    missingness = [
        {
            "column": item["name"],
            "missing_pct": round(float(item.get("missing_pct", 0.0)) * 100, 2),
            "missing_count": int(item.get("missing_count", 0)),
        }
        for item in sorted(schema_profile.get("columns", []), key=lambda value: value.get("missing_pct", 0.0), reverse=True)
        if float(item.get("missing_pct", 0.0)) > 0
    ][:20]

    histograms: list[dict[str, Any]] = []
    boxplots: list[dict[str, Any]] = []
    for column in numeric_columns[:8]:
        series = pd.to_numeric(frame[column], errors="coerce").dropna()
        if series.empty:
            continue
        counts, edges = np.histogram(series, bins=min(12, max(4, int(np.sqrt(len(series))))))
        histograms.append(
            {
                "column": column,
                "bins": [
                    {
                        "start": round(float(edges[index]), 6),
                        "end": round(float(edges[index + 1]), 6),
                        "count": int(counts[index]),
                    }
                    for index in range(len(counts))
                ],
            }
        )
        q1 = float(series.quantile(0.25))
        q3 = float(series.quantile(0.75))
        median = float(series.median())
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        outlier_count = int(((series < lower) | (series > upper)).sum()) if iqr > 0 else 0
        boxplots.append(
            {
                "column": column,
                "min": round(float(series.min()), 6),
                "q1": round(q1, 6),
                "median": round(median, 6),
                "q3": round(q3, 6),
                "max": round(float(series.max()), 6),
                "outlier_count": outlier_count,
            }
        )

    top_categories: list[dict[str, Any]] = []
    for column in categorical_columns[:6]:
        series = _string_with_missing(frame[column])
        counts = series.value_counts(dropna=False).head(10)
        top_categories.append(
            {
                "column": column,
                "values": [
                    {
                        "label": str(index),
                        "count": int(value),
                    }
                    for index, value in counts.items()
                ],
            }
        )

    correlation_heatmap: list[dict[str, Any]] = []
    pairwise_scatter: list[dict[str, Any]] = []
    drift_checks: list[dict[str, Any]] = []
    if len(numeric_columns) >= 2:
        numeric_frame = frame[numeric_columns].apply(pd.to_numeric, errors="coerce")
        corr = numeric_frame.corr(numeric_only=True).iloc[:10, :10]
        correlation_heatmap = [
            {
                "x": str(row_name),
                "y": str(col_name),
                "value": round(float(corr.loc[row_name, col_name]), 4),
            }
            for row_name in corr.index
            for col_name in corr.columns
            if pd.notna(corr.loc[row_name, col_name])
        ]

        seen_pairs: set[tuple[str, str]] = set()
        ranked_pairs: list[tuple[str, str, float]] = []
        for row_name in corr.index:
            for col_name in corr.columns:
                if row_name == col_name or pd.isna(corr.loc[row_name, col_name]):
                    continue
                key = tuple(sorted((str(row_name), str(col_name))))
                if key in seen_pairs:
                    continue
                seen_pairs.add(key)
                ranked_pairs.append((str(row_name), str(col_name), float(corr.loc[row_name, col_name])))

        for x_column, y_column, corr_value in sorted(ranked_pairs, key=lambda item: abs(item[2]), reverse=True)[:4]:
            subset = numeric_frame[[x_column, y_column]].dropna().head(220).reset_index(drop=True)
            if len(subset) < 10:
                continue
            pairwise_scatter.append(
                {
                    "x": x_column,
                    "y": y_column,
                    "correlation": round(corr_value, 4),
                    "points": [
                        {
                            "row": int(index + 1),
                            "x": round(float(row[x_column]), 6),
                            "y": round(float(row[y_column]), 6),
                        }
                        for index, row in subset.iterrows()
                    ],
                }
            )

        midpoint = max(1, len(numeric_frame) // 2)
        baseline_numeric = numeric_frame.iloc[:midpoint]
        recent_numeric = numeric_frame.iloc[midpoint:]
        if not recent_numeric.empty:
            for column in numeric_columns[:8]:
                baseline = baseline_numeric[column].dropna()
                recent = recent_numeric[column].dropna()
                if baseline.empty or recent.empty:
                    continue
                baseline_mean = float(baseline.mean())
                recent_mean = float(recent.mean())
                denominator = max(abs(baseline_mean), 1e-6)
                delta_pct = ((recent_mean - baseline_mean) / denominator) * 100.0
                change_score = abs(recent_mean - baseline_mean) / max(float(numeric_frame[column].std(ddof=0) or 1.0), 1e-6)
                drift_checks.append(
                    {
                        "column": column,
                        "kind": "numeric",
                        "baseline_label": "First half mean",
                        "recent_label": "Second half mean",
                        "baseline_value": round(baseline_mean, 6),
                        "recent_value": round(recent_mean, 6),
                        "delta_pct": round(delta_pct, 4),
                        "change_score": round(change_score, 4),
                    }
                )

    midpoint = max(1, len(frame) // 2)
    baseline_frame = frame.iloc[:midpoint]
    recent_frame = frame.iloc[midpoint:]
    if not recent_frame.empty:
        for column in categorical_columns[:6]:
            baseline = _string_with_missing(baseline_frame[column])
            recent = _string_with_missing(recent_frame[column])
            if baseline.empty or recent.empty:
                continue
            baseline_top = baseline.value_counts(dropna=False).head(1)
            recent_top = recent.value_counts(dropna=False).head(1)
            if baseline_top.empty or recent_top.empty:
                continue
            baseline_value = str(baseline_top.index[0])
            recent_value = str(recent_top.index[0])
            baseline_share = float(baseline_top.iloc[0] / max(1, len(baseline)))
            recent_share = float(recent_top.iloc[0] / max(1, len(recent)))
            drift_checks.append(
                {
                    "column": column,
                    "kind": "categorical",
                    "baseline_label": "First half top category",
                    "recent_label": "Second half top category",
                    "baseline_top": baseline_value,
                    "recent_top": recent_value,
                    "baseline_share": round(baseline_share, 4),
                    "recent_share": round(recent_share, 4),
                    "change_score": round(abs(recent_share - baseline_share), 4),
                }
            )

    drift_checks = sorted(drift_checks, key=lambda item: float(item.get("change_score", 0.0)), reverse=True)[:10]

    return {
        "missingness": missingness,
        "histograms": histograms,
        "boxplots": boxplots,
        "top_categories": top_categories,
        "correlation_heatmap": correlation_heatmap,
        "pairwise_scatter": pairwise_scatter,
        "drift_checks": drift_checks,
    }