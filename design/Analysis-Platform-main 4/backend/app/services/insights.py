from __future__ import annotations

from typing import Any


def generate_insights(
    dataset_name: str,
    overview: dict[str, Any],
    schema: dict[str, Any],
    quality: dict[str, Any],
    statistics: dict[str, Any],
) -> dict[str, Any]:
    findings: list[str] = []
    next_steps: list[str] = []

    row_count = int(overview.get("row_count", 0))
    column_count = int(overview.get("column_count", 0))
    duplicate_rows = int(quality.get("duplicate_row_count", 0))
    type_counts = schema.get("type_counts", {}) or {}

    findings.append(
        f"{dataset_name} contains {row_count:,} rows across {column_count} columns with {int(type_counts.get('numeric', 0))} numeric and {int(type_counts.get('categorical', 0))} categorical fields."
    )

    missing_columns = quality.get("missing_by_column", []) or []
    if missing_columns:
        top_missing = missing_columns[0]
        findings.append(
            f"The highest missingness is in {top_missing['column']} at {float(top_missing['missing_pct']) * 100:.1f}% missing values."
        )
        next_steps.append("Prioritize imputation or removal decisions for heavily missing columns before modeling.")

    if duplicate_rows > 0:
        findings.append(f"The dataset includes {duplicate_rows:,} duplicate rows that may skew summaries or downstream models.")
        next_steps.append("Deduplicate rows before producing final analytical or modeling outputs.")

    if quality.get("constant_columns"):
        findings.append(
            f"{len(quality['constant_columns'])} columns are constant and can be dropped without losing information."
        )

    high_correlations = quality.get("high_correlations", []) or []
    if high_correlations:
        sample = high_correlations[0]
        findings.append(
            f"Strong correlation detected between {sample['column_a']} and {sample['column_b']} ({sample['correlation']})."
        )
        next_steps.append("Review highly correlated numeric features for redundancy before supervised learning.")

    numeric_summary = statistics.get("numeric_summary", []) or []
    skewed = [item for item in numeric_summary if abs(float(item.get("skew", 0.0))) >= 1.0]
    if skewed:
        findings.append(
            f"{len(skewed)} numeric fields are heavily skewed, which may benefit from transformation or robust modeling approaches."
        )

    target_candidates = schema.get("target_candidates", []) or []
    modeling_ready = bool(target_candidates or int(type_counts.get("numeric", 0)) >= 2)
    next_steps.append(
        "Dataset appears suitable for optional machine learning workflows."
        if modeling_ready
        else "Use exploratory analysis first; the dataset currently shows limited structure for machine learning."
    )

    return {
        "summary": " ".join(findings[:3]) if findings else "Dataset analyzed successfully.",
        "findings": findings,
        "recommended_next_steps": next_steps,
        "modeling_readiness": {
            "is_ready": modeling_ready,
            "target_candidates": target_candidates,
        },
    }