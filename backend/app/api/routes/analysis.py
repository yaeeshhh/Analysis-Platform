from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...models.user import User
from ...schemas.analysis import SupervisedRequest, UnsupervisedRequest
from ...services.analysis_runs import (
    AnalysisRun,
    create_analysis_run,
    delete_analysis_run_record,
    get_analysis_run,
    list_analysis_runs as list_saved_analysis_runs,
    save_analysis_report,
    save_analysis_source_file,
)
from ...services.data_quality import analyze_data_quality
from ...services.ingestion import load_csv_from_bytes, preview_rows, validate_csv_filename
from ...services.insights import generate_insights
from ...services.ml_reporting import (
    build_supervised_model_summary,
    build_target_recommendations,
    build_unsupervised_summary,
)
from ...services.profiling import profile_schema
from ...services.statistics import build_statistics
from ...services.supervised import run_supervised_analysis
from ...services.unsupervised import run_unsupervised_analysis
from ...services.visualisations import build_visualisations
from ..deps import get_current_user


router = APIRouter(prefix="/analysis", tags=["analysis"])

PROJECT_ROOT = Path(__file__).resolve().parents[4]
UPLOADS_DIR = PROJECT_ROOT / "uploads"
ANALYSIS_REPORTS_DIR = UPLOADS_DIR / "analysis_reports"
ANALYSIS_EXPERIMENTS_DIR = ANALYSIS_REPORTS_DIR / "experiments"


def _serialize_analysis_report(
    dataset_name: str,
    encoding: str,
    frame,
) -> dict[str, object]:
    schema = profile_schema(frame)
    quality = analyze_data_quality(frame)
    statistics = build_statistics(frame, schema)
    overview = {
        "dataset_name": dataset_name,
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
        "encoding": encoding,
        "duplicate_row_count": int(quality.get("duplicate_row_count", 0)),
        "total_missing_values": int(frame.isna().sum().sum()),
        "type_counts": schema.get("type_counts", {}),
        "preview_rows": preview_rows(frame, limit=20),
    }
    visualisations = build_visualisations(frame, schema)
    insights = generate_insights(dataset_name, overview, schema, quality, statistics)
    target_recommendations = build_target_recommendations(frame, schema)
    supervised_available = bool(schema.get("target_candidates")) or any(
        item.get("recommended_task") != "none" for item in target_recommendations
    )
    ml_capabilities = {
        "unsupervised": {
            "available": int(schema.get("type_counts", {}).get("numeric", 0)) >= 2 and len(frame) >= 10,
            "reason": "At least two numeric columns are available for clustering, PCA, and anomaly detection."
            if int(schema.get("type_counts", {}).get("numeric", 0)) >= 2 and len(frame) >= 10
            else "Need at least two numeric columns and 10 rows for unsupervised analysis.",
        },
        "supervised": {
            "available": supervised_available,
            "target_candidates": schema.get("target_candidates", []),
            "target_recommendations": target_recommendations,
            "reason": "Choose a target column to compare dataset-specific supervised models."
            if supervised_available
            else "No obvious target candidates were inferred automatically, but you can still choose a valid target column manually.",
        },
    }
    return {
        "analysis_version": "v1",
        "overview": overview,
        "schema": schema,
        "quality": quality,
        "statistics": statistics,
        "visualisations": visualisations,
        "insights": insights,
        "ml_capabilities": ml_capabilities,
        "ml_results": {},
        "ml_experiments": [],
    }


def _write_report_file(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _as_dict(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _format_scalar(value: object) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        if value.is_integer():
            return f"{int(value):,}"
        return f"{value:.4f}".rstrip("0").rstrip(".")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return f"{len(value)} fields"
    if isinstance(value, list):
        return f"{len(value)} items"
    return str(value)


def _format_row_preview(row: object, max_fields: int = 6) -> str:
    if not isinstance(row, dict):
        return _format_scalar(row)

    visible_items = list(row.items())[:max_fields]
    pieces = [f"{key}: {_format_scalar(value)}" for key, value in visible_items]
    if len(row) > max_fields:
        pieces.append(f"... (+{len(row) - max_fields} more)")
    return "; ".join(pieces)


def _format_percent(value: object) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value * 100:.1f}%"
    return "n/a"


def _add_section(lines: list[str], title: str) -> None:
    if lines and lines[-1] != "":
        lines.append("")
    lines.append(title.upper())


def _render_analysis_report_text(analysis_id: int, payload: dict[str, object]) -> str:
    overview = _as_dict(payload.get("overview"))
    schema = _as_dict(payload.get("schema"))
    quality = _as_dict(payload.get("quality"))
    statistics = _as_dict(payload.get("statistics"))
    visualisations = _as_dict(payload.get("visualisations"))
    insights = _as_dict(payload.get("insights"))
    ml_capabilities = _as_dict(payload.get("ml_capabilities"))
    ml_results = _as_dict(payload.get("ml_results"))
    ml_experiments = _as_list(payload.get("ml_experiments"))

    lines = [
        "ANALYSIS REPORT",
        f"Analysis ID: {analysis_id}",
        f"Dataset: {_format_scalar(overview.get('dataset_name'))}",
        f"Version: {_format_scalar(payload.get('analysis_version'))}",
        f"Encoding: {_format_scalar(overview.get('encoding'))}",
    ]

    _add_section(lines, "Overview")
    lines.extend(
        [
            f"Rows: {_format_scalar(overview.get('row_count'))}",
            f"Columns: {_format_scalar(overview.get('column_count'))}",
            f"Duplicate rows: {_format_scalar(overview.get('duplicate_row_count'))}",
            f"Total missing values: {_format_scalar(overview.get('total_missing_values'))}",
        ]
    )
    type_counts = _as_dict(overview.get("type_counts"))
    if type_counts:
        lines.append("Type mix:")
        for key, value in type_counts.items():
            lines.append(f"- {key}: {_format_scalar(value)}")

    preview_rows = _as_list(overview.get("preview_rows"))
    if preview_rows:
        lines.append("Preview rows:")
        for index, row in enumerate(preview_rows[:5], start=1):
            lines.append(f"- Row {index}: {_format_row_preview(row)}")
        if len(preview_rows) > 5:
            lines.append(f"- Additional preview rows omitted: {len(preview_rows) - 5}")

    _add_section(lines, "Insights")
    lines.append(f"Summary: {_format_scalar(insights.get('summary'))}")
    findings = [item for item in _as_list(insights.get("findings")) if isinstance(item, str) and item.strip()]
    if findings:
        lines.append("Findings:")
        for item in findings:
            lines.append(f"- {item}")
    next_steps = [item for item in _as_list(insights.get("recommended_next_steps")) if isinstance(item, str) and item.strip()]
    if next_steps:
        lines.append("Recommended next steps:")
        for item in next_steps:
            lines.append(f"- {item}")
    readiness = _as_dict(insights.get("modeling_readiness"))
    lines.append(f"ML-ready: {_format_scalar(readiness.get('is_ready'))}")
    target_candidates = [item for item in _as_list(readiness.get("target_candidates")) if isinstance(item, str) and item.strip()]
    lines.append(
        "Target candidates: " + (", ".join(target_candidates) if target_candidates else "none inferred")
    )

    _add_section(lines, "Schema")
    identifier_columns = [item for item in _as_list(schema.get("identifier_columns")) if isinstance(item, str) and item.strip()]
    schema_target_candidates = [item for item in _as_list(schema.get("target_candidates")) if isinstance(item, str) and item.strip()]
    lines.append("Identifier columns: " + (", ".join(identifier_columns) if identifier_columns else "none"))
    lines.append(
        "Target candidates: " + (", ".join(schema_target_candidates) if schema_target_candidates else "none inferred")
    )
    column_profiles = [_as_dict(item) for item in _as_list(schema.get("columns"))]
    if column_profiles:
        lines.append("Column profiles:")
        for column in column_profiles[:40]:
            samples = [item for item in _as_list(column.get("sample_values")) if isinstance(item, str) and item.strip()]
            sample_text = ", ".join(samples[:3]) if samples else "n/a"
            lines.append(
                "- "
                + f"{_format_scalar(column.get('name'))}: type {_format_scalar(column.get('inferred_type'))}, "
                + f"role {_format_scalar(column.get('likely_role'))}, non-null {_format_scalar(column.get('non_null_count'))}, "
                + f"missing {_format_percent(column.get('missing_pct'))}, unique {_format_percent(column.get('unique_pct'))}, "
                + f"samples {sample_text}"
            )
        if len(column_profiles) > 40:
            lines.append(f"- Additional columns omitted: {len(column_profiles) - 40}")

    _add_section(lines, "Quality")
    lines.append(f"Quality score: {_format_scalar(quality.get('quality_score'))}")
    missing_by_column = [_as_dict(item) for item in _as_list(quality.get("missing_by_column")) if _as_dict(item).get("missing_count")]
    lines.append("Missingness:")
    if missing_by_column:
        for item in missing_by_column[:20]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('missing_count'))} missing ({_format_percent(item.get('missing_pct'))})"
            )
    else:
        lines.append("- No missing-value issues recorded.")
    constant_columns = [item for item in _as_list(quality.get("constant_columns")) if isinstance(item, str) and item.strip()]
    lines.append("Constant columns: " + (", ".join(constant_columns) if constant_columns else "none"))
    near_constants = [_as_dict(item) for item in _as_list(quality.get("near_constant_columns"))]
    if near_constants:
        lines.append("Near-constant columns:")
        for item in near_constants[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: dominant ratio {_format_percent(item.get('dominant_value_ratio'))}"
            )
    high_cardinality = [_as_dict(item) for item in _as_list(quality.get("high_cardinality_columns"))]
    if high_cardinality:
        lines.append("High-cardinality columns:")
        for item in high_cardinality[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('unique_count'))} unique ({_format_percent(item.get('unique_pct'))})"
            )
    invalid_numeric = [_as_dict(item) for item in _as_list(quality.get("invalid_numeric_columns"))]
    if invalid_numeric:
        lines.append("Numeric parsing issues:")
        for item in invalid_numeric[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: parse success {_format_percent(item.get('numeric_parse_ratio'))}"
            )
    outlier_columns = [_as_dict(item) for item in _as_list(quality.get("outlier_columns"))]
    if outlier_columns:
        lines.append("Outlier-heavy columns:")
        for item in outlier_columns[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('outlier_count'))} outliers ({_format_percent(item.get('outlier_pct'))})"
            )
    high_correlations = [_as_dict(item) for item in _as_list(quality.get("high_correlations"))]
    if high_correlations:
        lines.append("Strong correlations:")
        for item in high_correlations[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column_a'))} vs {_format_scalar(item.get('column_b'))}: {_format_scalar(item.get('correlation'))}"
            )
    recommendations = [item for item in _as_list(quality.get("recommendations")) if isinstance(item, str) and item.strip()]
    if recommendations:
        lines.append("Recommendations:")
        for item in recommendations:
            lines.append(f"- {item}")

    _add_section(lines, "Statistics")
    numeric_summary = [_as_dict(item) for item in _as_list(statistics.get("numeric_summary"))]
    if numeric_summary:
        lines.append("Numeric columns:")
        for item in numeric_summary[:25]:
            lines.append(
                "- "
                + f"{_format_scalar(item.get('column'))}: mean {_format_scalar(item.get('mean'))}, median {_format_scalar(item.get('median'))}, "
                + f"std {_format_scalar(item.get('std'))}, min {_format_scalar(item.get('min'))}, max {_format_scalar(item.get('max'))}, skew {_format_scalar(item.get('skew'))}"
            )
    categorical_summary = [_as_dict(item) for item in _as_list(statistics.get("categorical_summary"))]
    if categorical_summary:
        lines.append("Categorical columns:")
        for item in categorical_summary[:15]:
            top_values = [_as_dict(value) for value in _as_list(item.get("top_values"))]
            top_value_text = ", ".join(
                f"{_format_scalar(value.get('value'))} ({_format_scalar(value.get('count'))}, {_format_percent(value.get('pct'))})"
                for value in top_values[:3]
            )
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('unique_count'))} unique; top values {top_value_text or 'n/a'}"
            )
    datetime_summary = [_as_dict(item) for item in _as_list(statistics.get("datetime_summary"))]
    if datetime_summary:
        lines.append("Datetime columns:")
        for item in datetime_summary:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('min'))} to {_format_scalar(item.get('max'))} over {_format_scalar(item.get('span_days'))} days"
            )

    _add_section(lines, "Visual summaries")
    lines.extend(
        [
            f"Missingness charts: {len(_as_list(visualisations.get('missingness')))}",
            f"Histograms: {len(_as_list(visualisations.get('histograms')))}",
            f"Boxplots: {len(_as_list(visualisations.get('boxplots')))}",
            f"Top-category charts: {len(_as_list(visualisations.get('top_categories')))}",
            f"Correlation heatmap cells: {len(_as_list(visualisations.get('correlation_heatmap')))}",
            f"Pairwise scatter plots: {len(_as_list(visualisations.get('pairwise_scatter')))}",
        ]
    )
    drift_checks = [_as_dict(item) for item in _as_list(visualisations.get("drift_checks"))]
    if drift_checks:
        lines.append("Largest drift checks:")
        for item in drift_checks[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))} ({_format_scalar(item.get('kind'))}): change score {_format_scalar(item.get('change_score'))}"
            )

    _add_section(lines, "ML capability")
    unsupervised_capability = _as_dict(ml_capabilities.get("unsupervised"))
    supervised_capability = _as_dict(ml_capabilities.get("supervised"))
    lines.append(f"Unsupervised available: {_format_scalar(unsupervised_capability.get('available'))}")
    lines.append(f"Unsupervised note: {_format_scalar(unsupervised_capability.get('reason'))}")
    lines.append(f"Supervised available: {_format_scalar(supervised_capability.get('available'))}")
    lines.append(f"Supervised note: {_format_scalar(supervised_capability.get('reason'))}")
    recommended_targets = [_as_dict(item) for item in _as_list(supervised_capability.get("target_recommendations"))]
    if recommended_targets:
        lines.append("Target recommendations:")
        for item in recommended_targets[:10]:
            lines.append(
                f"- {_format_scalar(item.get('column'))}: {_format_scalar(item.get('recommended_task'))}, score {_format_scalar(item.get('score'))}, {_format_scalar(item.get('verdict'))}"
            )

    _add_section(lines, "Saved ML state")
    supervised_result = _as_dict(ml_results.get("supervised"))
    unsupervised_result = _as_dict(ml_results.get("unsupervised"))
    if supervised_result:
        lines.append(
            f"Latest supervised result: target {_format_scalar(supervised_result.get('target_column'))}, best model {_format_scalar(supervised_result.get('best_model'))}"
        )
    if unsupervised_result:
        lines.append(
            f"Latest unsupervised result: {_format_scalar(unsupervised_result.get('cluster_count'))} clusters, {_format_scalar(unsupervised_result.get('anomaly_count'))} anomalies"
        )
    if not supervised_result and not unsupervised_result:
        lines.append("No saved ML result is attached to this analysis yet.")

    if ml_experiments:
        lines.append("Saved ML experiments:")
        for item in [_as_dict(entry) for entry in ml_experiments[:20]]:
            lines.append(
                f"- {_format_scalar(item.get('id'))} | {_format_scalar(item.get('type'))} | {_format_scalar(item.get('created_at'))} | {_format_scalar(item.get('summary'))}"
            )
        if len(ml_experiments) > 20:
            lines.append(f"- Additional saved experiments omitted: {len(ml_experiments) - 20}")

    return "\n".join(lines) + "\n"


def _render_ml_experiment_report_text(payload: dict[str, object]) -> str:
    result = _as_dict(payload.get("result"))
    experiment_type = _format_scalar(payload.get("experiment_type"))
    lines = [
        "ML EXPERIMENT REPORT",
        f"Analysis ID: {_format_scalar(payload.get('analysis_id'))}",
        f"Experiment ID: {_format_scalar(payload.get('experiment_id'))}",
        f"Type: {experiment_type}",
        f"Created at: {_format_scalar(payload.get('created_at'))}",
        f"Summary: {_format_scalar(payload.get('summary'))}",
    ]

    parameters = _as_dict(payload.get("parameters"))
    if parameters:
        _add_section(lines, "Parameters")
        for key, value in parameters.items():
            lines.append(f"- {key}: {_format_scalar(value)}")

    if experiment_type == "supervised":
        _add_section(lines, "Supervised result")
        lines.extend(
            [
                f"Task type: {_format_scalar(result.get('task_type'))}",
                f"Target column: {_format_scalar(result.get('target_column'))}",
                f"Best model: {_format_scalar(result.get('best_model'))}",
                f"Model summary: {_format_scalar(result.get('model_summary'))}",
            ]
        )
        diagnostics = _as_dict(result.get("diagnostics"))
        if diagnostics:
            lines.append("Diagnostics:")
            for key, value in diagnostics.items():
                lines.append(f"- {key}: {_format_scalar(value)}")
        warnings = [item for item in _as_list(result.get("warnings")) if isinstance(item, str) and item.strip()]
        if warnings:
            lines.append("Warnings:")
            for item in warnings:
                lines.append(f"- {item}")
        target_recommendation = _as_dict(result.get("target_recommendation"))
        if target_recommendation:
            lines.append(
                "Target recommendation: "
                + f"{_format_scalar(target_recommendation.get('column'))}, {_format_scalar(target_recommendation.get('recommended_task'))}, score {_format_scalar(target_recommendation.get('score'))}"
            )
        model_comparison = [_as_dict(item) for item in _as_list(result.get("model_comparison"))]
        if model_comparison:
            lines.append("Model comparison:")
            for item in model_comparison:
                metrics = _as_dict(item.get("metrics"))
                metric_text = ", ".join(
                    f"{metric}={_format_scalar(value)}" for metric, value in metrics.items()
                )
                lines.append(f"- {_format_scalar(item.get('model'))}: {metric_text or 'no metrics'}")
        feature_importance = [_as_dict(item) for item in _as_list(result.get("feature_importance"))]
        if feature_importance:
            lines.append("Top feature importance:")
            for item in feature_importance[:12]:
                lines.append(f"- {_format_scalar(item.get('feature'))}: {_format_scalar(item.get('importance'))}")
        predictions_preview = [_as_dict(item) for item in _as_list(result.get("predictions_preview"))]
        if predictions_preview:
            lines.append("Prediction preview:")
            for item in predictions_preview[:5]:
                lines.append(
                    f"- actual {_format_scalar(item.get('actual'))} -> predicted {_format_scalar(item.get('prediction'))}"
                )
    else:
        _add_section(lines, "Unsupervised result")
        pca_values = ", ".join(_format_percent(item) for item in _as_list(result.get("pca_explained_variance")))
        numeric_columns = ", ".join(
            item for item in _as_list(result.get("used_numeric_columns")) if isinstance(item, str) and item.strip()
        )
        lines.extend(
            [
                f"Cluster count: {_format_scalar(result.get('cluster_count'))}",
                f"Anomaly count: {_format_scalar(result.get('anomaly_count'))}",
                f"PCA explained variance: {pca_values or 'n/a'}",
                f"Numeric columns used: {numeric_columns or 'n/a'}",
            ]
        )
        cluster_distribution = [_as_dict(item) for item in _as_list(result.get("cluster_distribution"))]
        if cluster_distribution:
            lines.append("Cluster distribution:")
            for item in cluster_distribution:
                lines.append(f"- Cluster {_format_scalar(item.get('cluster'))}: {_format_scalar(item.get('count'))} rows")
        preview = [_as_dict(item) for item in _as_list(result.get("preview"))]
        if preview:
            lines.append("Preview rows:")
            for item in preview[:8]:
                lines.append(
                    "- "
                    + f"row {_format_scalar(item.get('row'))}, cluster {_format_scalar(item.get('cluster'))}, "
                    + f"anomaly {_format_scalar(item.get('anomaly_flag'))}, score {_format_scalar(item.get('anomaly_score'))}, "
                    + f"PCA ({_format_scalar(item.get('pc1'))}, {_format_scalar(item.get('pc2'))})"
                )

    return "\n".join(lines) + "\n"


def _sync_analysis_summary(analysis_run: AnalysisRun, summary: dict[str, object], db: Session) -> None:
    save_analysis_report(db, analysis_run, summary)

    report_path = _report_path_for_analysis_run(analysis_run)
    if report_path is not None:
        _write_report_file(report_path, summary)


def _append_experiment(
    analysis_run: AnalysisRun,
    summary: dict[str, object],
    experiment_type: str,
    result: dict[str, object],
    parameters: dict[str, object],
) -> dict[str, object]:
    experiment_id = datetime.utcnow().strftime("exp_%Y%m%d%H%M%S%f")
    created_at = datetime.utcnow().isoformat() + "Z"

    if experiment_type == "supervised":
        summary_text = build_supervised_model_summary(result)
    else:
        summary_text = build_unsupervised_summary(result)

    experiment_dir = ANALYSIS_EXPERIMENTS_DIR / f"analysis_{analysis_run.id}"
    experiment_json_path = experiment_dir / f"{experiment_id}.json"
    experiment_summary_path = experiment_dir / f"{experiment_id}.txt"

    experiment_payload = {
        "analysis_id": analysis_run.id,
        "experiment_id": experiment_id,
        "experiment_type": experiment_type,
        "created_at": created_at,
        "parameters": parameters,
        "summary": summary_text,
        "result": result,
    }
    _write_report_file(experiment_json_path, experiment_payload)
    experiment_summary_path.parent.mkdir(parents=True, exist_ok=True)
    with open(experiment_summary_path, "w", encoding="utf-8") as f:
        f.write(summary_text)

    experiment_record = {
        "id": experiment_id,
        "type": experiment_type,
        "created_at": created_at,
        "parameters": parameters,
        "summary": summary_text,
        "summary_text_inline": summary_text,
        "report_payload_inline": experiment_payload,
        "report_path": str(experiment_json_path.relative_to(PROJECT_ROOT).as_posix()),
        "summary_path": str(experiment_summary_path.relative_to(PROJECT_ROOT).as_posix()),
        "download_url": f"/analysis/{analysis_run.id}/ml/experiments/{experiment_id}/download",
        "summary_download_url": f"/analysis/{analysis_run.id}/ml/experiments/{experiment_id}/summary",
        "delete_url": f"/analysis/{analysis_run.id}/ml/experiments/{experiment_id}",
    }

    experiments = list(summary.get("ml_experiments") or [])
    experiments.insert(0, experiment_record)
    summary["ml_experiments"] = experiments
    return experiment_record


def _remove_analysis_artifacts(analysis_run: AnalysisRun) -> None:
    stored_csv_path = UPLOADS_DIR / analysis_run.stored_filename
    if stored_csv_path.exists():
        stored_csv_path.unlink(missing_ok=True)

    report_path = _report_path_for_analysis_run(analysis_run)
    if report_path is not None and report_path.exists():
        report_path.unlink(missing_ok=True)

    experiment_dir = ANALYSIS_EXPERIMENTS_DIR / f"analysis_{analysis_run.id}"
    if experiment_dir.exists():
        shutil.rmtree(experiment_dir, ignore_errors=True)


def _resolve_saved_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    path = Path(str(path_value))
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def _read_analysis_source_bytes(
    analysis_run: AnalysisRun,
    db: Session | None = None,
) -> bytes | None:
    stored_csv_path = UPLOADS_DIR / analysis_run.stored_filename
    if stored_csv_path.exists():
        try:
            contents = stored_csv_path.read_bytes()
        except OSError:
            contents = None
        else:
            if db is not None and analysis_run.source_file_content is None:
                save_analysis_source_file(db, analysis_run, contents)
            return contents

    return analysis_run.source_file_content


def _get_saved_experiments(summary: object) -> list[dict[str, object]]:
    if not isinstance(summary, dict):
        return []

    experiments = summary.get("ml_experiments")
    if not isinstance(experiments, list):
        return []

    return [item for item in experiments if isinstance(item, dict)]


def _get_saved_experiment_summary_text(experiment: dict[str, object]) -> str | None:
    inline_summary = experiment.get("summary_text_inline") or experiment.get("summary")
    if isinstance(inline_summary, str) and inline_summary.strip():
        return inline_summary

    summary_path = _resolve_saved_path(experiment.get("summary_path"))
    if summary_path is None or not summary_path.exists():
        return None

    try:
        return summary_path.read_text(encoding="utf-8")
    except OSError:
        return None


def _load_saved_experiment_payload(experiment: dict[str, object]) -> dict[str, object] | None:
    inline_payload = experiment.get("report_payload_inline")
    if isinstance(inline_payload, dict):
        return inline_payload

    report_path_value = experiment.get("report_path")
    report_path = _resolve_saved_path(report_path_value if isinstance(report_path_value, str) else None)
    if report_path is None or not report_path.exists():
        return None

    with open(report_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    return payload if isinstance(payload, dict) else None


def _public_experiment_record(experiment: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in experiment.items()
        if key not in {"report_payload_inline", "summary_text_inline"}
    }


def _public_summary(summary: dict[str, object]) -> dict[str, object]:
    public_summary = dict(summary)
    public_summary["ml_experiments"] = [
        _public_experiment_record(item) for item in _get_saved_experiments(summary)
    ]
    return public_summary


def _rebuild_saved_experiment_payload(
    analysis_id: int,
    summary: dict[str, object],
    experiment: dict[str, object],
) -> dict[str, object] | None:
    experiment_type = experiment.get("type")
    if not isinstance(experiment_type, str) or not experiment_type:
        return None

    experiments_of_type = [
        item for item in _get_saved_experiments(summary) if item.get("type") == experiment_type
    ]
    if len(experiments_of_type) != 1:
        return None

    ml_results = summary.get("ml_results") if isinstance(summary.get("ml_results"), dict) else {}
    result = ml_results.get(experiment_type) if isinstance(ml_results, dict) else None
    if not isinstance(result, dict):
        return None

    return {
        "analysis_id": analysis_id,
        "experiment_id": experiment.get("id"),
        "experiment_type": experiment_type,
        "created_at": experiment.get("created_at"),
        "parameters": experiment.get("parameters") if isinstance(experiment.get("parameters"), dict) else {},
        "summary": experiment.get("summary") if isinstance(experiment.get("summary"), str) else "",
        "result": result,
    }


def _sync_saved_ml_result(
    summary: dict[str, object],
    experiment_type: str,
    experiments: list[dict[str, object]],
) -> None:
    ml_results = dict(summary.get("ml_results") or {})
    replacement = next((item for item in experiments if item.get("type") == experiment_type), None)

    if replacement is None:
        ml_results.pop(experiment_type, None)
        summary["ml_results"] = ml_results
        return

    payload = _load_saved_experiment_payload(replacement)
    replacement_result = payload.get("result") if isinstance(payload, dict) else None

    if isinstance(replacement_result, dict):
        ml_results[experiment_type] = replacement_result
    else:
        ml_results.pop(experiment_type, None)

    summary["ml_results"] = ml_results


def _remove_saved_experiment_files(analysis_run: AnalysisRun, experiment: dict[str, object]) -> None:
    for path_key in ("report_path", "summary_path"):
        path_value = experiment.get(path_key)
        saved_path = _resolve_saved_path(path_value if isinstance(path_value, str) else None)
        if saved_path is not None and saved_path.exists():
            saved_path.unlink(missing_ok=True)

    experiment_dir = ANALYSIS_EXPERIMENTS_DIR / f"analysis_{analysis_run.id}"
    if experiment_dir.exists() and not any(experiment_dir.iterdir()):
        experiment_dir.rmdir()


def _get_analysis_run(
    analysis_id: int,
    db: Session,
    current_user: User,
) -> AnalysisRun:
    analysis_run = get_analysis_run(db, user_id=current_user.id, analysis_id=analysis_id)
    if analysis_run is None:
        raise HTTPException(status_code=404, detail="Analysis run not found.")
    return analysis_run


def _report_path_for_analysis_run(analysis_run: AnalysisRun) -> Path | None:
    summary = analysis_run.report_payload
    report_path = summary.get("report_path") if isinstance(summary, dict) else None
    if not report_path:
        return None
    path = Path(str(report_path))
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def _load_analysis_source_frame(
    analysis_run: AnalysisRun,
    db: Session | None = None,
):
    contents = _read_analysis_source_bytes(analysis_run, db=db)
    if contents is None:
        raise HTTPException(
            status_code=409,
            detail="The original CSV for this saved run is no longer available on the server. Re-upload the dataset to run ML again.",
        )

    try:
        frame, _ = load_csv_from_bytes(contents)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="The saved dataset for this analysis could not be reloaded for ML.",
        ) from exc

    return frame


def _hydrate_dynamic_ml_capabilities(
    analysis_run: AnalysisRun,
    summary: dict[str, object],
    db: Session | None = None,
) -> dict[str, object]:
    if not isinstance(summary, dict):
        return summary

    contents = _read_analysis_source_bytes(analysis_run, db=db)
    if contents is None:
        return summary

    try:
        frame, _ = load_csv_from_bytes(contents)
    except ValueError:
        return summary

    schema = summary.get("schema") if isinstance(summary.get("schema"), dict) else profile_schema(frame)
    ml_capabilities = dict(summary.get("ml_capabilities") or {})
    supervised = dict(ml_capabilities.get("supervised") or {})
    target_candidates = schema.get("target_candidates") if isinstance(schema, dict) else []
    target_recommendations = build_target_recommendations(frame, schema if isinstance(schema, dict) else {})

    supervised["target_candidates"] = target_candidates if isinstance(target_candidates, list) else []
    supervised["target_recommendations"] = target_recommendations
    supervised["available"] = bool(supervised.get("target_candidates")) or any(
        item.get("recommended_task") != "none" for item in target_recommendations
    )
    supervised["reason"] = (
        "Choose a target column to compare dataset-specific supervised models."
        if supervised["available"]
        else "No obvious target candidates were inferred automatically, but you can still choose a valid target column manually."
    )

    ml_capabilities["supervised"] = supervised
    return {**summary, "ml_capabilities": ml_capabilities}


@router.post("/upload")
async def upload_analysis_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = validate_csv_filename(file.filename)
    contents = await file.read()

    try:
        frame, encoding = load_csv_from_bytes(contents)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    stored_filename = f"{current_user.id}_{timestamp}_{filename}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ANALYSIS_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    stored_path = UPLOADS_DIR / stored_filename
    with open(stored_path, "wb") as f:
        f.write(contents)

    report = _serialize_analysis_report(filename, encoding, frame)

    analysis_run = create_analysis_run(
        db,
        user_id=current_user.id,
        dataset_name=Path(filename).stem,
        source_filename=filename,
        stored_filename=stored_filename,
        source_file_content=contents,
        row_count=len(frame),
        status="completed",
    )

    report_file = ANALYSIS_REPORTS_DIR / f"analysis_{analysis_run.id}.json"
    report["report_path"] = str(report_file.relative_to(PROJECT_ROOT).as_posix())

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    save_analysis_report(db, analysis_run, report)
    public_report = _public_summary(report)

    return {
        "analysis_id": analysis_run.id,
        "display_name": analysis_run.display_name,
        "source_filename": analysis_run.source_filename,
        "saved_at": analysis_run.created_at,
        **public_report,
        "download_url": f"/analysis/{analysis_run.id}/download",
    }


@router.get("")
def list_analysis_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = list_saved_analysis_runs(db, user_id=current_user.id)
    items = []
    for row in rows:
        summary = row.report_payload
        overview = summary.get("overview", {}) if isinstance(summary, dict) else {}
        experiments = _get_saved_experiments(summary)
        latest_experiment = experiments[0] if experiments else None
        items.append(
            {
                "id": row.id,
                "display_name": row.display_name,
                "source_filename": row.source_filename,
                "status": row.status,
                "saved_at": row.created_at,
                "overview": overview,
                "insights": summary.get("insights", {}) if isinstance(summary, dict) else {},
                "experiment_count": len(experiments),
                "latest_experiment": _public_experiment_record(latest_experiment) if latest_experiment else None,
            }
        )
    return items


@router.get("/{analysis_id}")
def get_full_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    summary = _hydrate_dynamic_ml_capabilities(analysis_run, dict(analysis_run.report_payload), db=db)
    public_summary = _public_summary(summary)
    return {
        "analysis_id": analysis_run.id,
        "display_name": analysis_run.display_name,
        "source_filename": analysis_run.source_filename,
        "saved_at": analysis_run.created_at,
        **public_summary,
    }


@router.delete("/{analysis_id}")
def delete_analysis_run(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)

    try:
        _remove_analysis_artifacts(analysis_run)
        delete_analysis_run_record(db, analysis_run)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"success": True, "id": analysis_id}


@router.delete("")
@router.delete("/", include_in_schema=False)
def delete_all_analysis_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_runs = list_saved_analysis_runs(db, user_id=current_user.id)

    try:
        deleted_count = len(analysis_runs)
        for analysis_run in analysis_runs:
            _remove_analysis_artifacts(analysis_run)
            db.delete(analysis_run.record)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"success": True, "deleted_count": deleted_count}


@router.delete("/{analysis_id}/ml/experiments/{experiment_id}")
def delete_ml_experiment(
    analysis_id: int,
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    summary = dict(analysis_run.report_payload)
    experiments = _get_saved_experiments(summary)
    experiment = next((item for item in experiments if item.get("id") == experiment_id), None)
    if experiment is None:
        raise HTTPException(status_code=404, detail="ML experiment not found.")

    remaining_experiments = [item for item in experiments if item.get("id") != experiment_id]
    summary["ml_experiments"] = remaining_experiments

    experiment_type = str(experiment.get("type") or "")
    if experiment_type in {"supervised", "unsupervised"}:
        _sync_saved_ml_result(summary, experiment_type, remaining_experiments)

    try:
        _remove_saved_experiment_files(analysis_run, experiment)
        _sync_analysis_summary(analysis_run, summary, db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "success": True,
        "analysis_id": analysis_id,
        "experiment_id": experiment_id,
        "remaining_count": len(remaining_experiments),
    }


@router.get("/{analysis_id}/overview")
def get_analysis_overview(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("overview", {})


@router.get("/{analysis_id}/schema")
def get_analysis_schema(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("schema", {})


@router.get("/{analysis_id}/quality")
def get_analysis_quality(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("quality", {})


@router.get("/{analysis_id}/statistics")
def get_analysis_statistics(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("statistics", {})


@router.get("/{analysis_id}/visualisations")
def get_analysis_visualisations(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("visualisations", {})


@router.get("/{analysis_id}/insights")
def get_analysis_insights(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    return analysis_run.report_payload.get("insights", {})


@router.post("/{analysis_id}/ml/unsupervised")
def run_analysis_unsupervised(
    analysis_id: int,
    body: UnsupervisedRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)

    try:
        frame = _load_analysis_source_frame(analysis_run, db=db)
        result = run_unsupervised_analysis(frame, n_clusters=body.n_clusters)
        summary = dict(analysis_run.report_payload)
        ml_results = dict(summary.get("ml_results") or {})
        ml_results["unsupervised"] = result
        summary["ml_results"] = ml_results
        experiment = _append_experiment(
            analysis_run,
            summary,
            experiment_type="unsupervised",
            result=result,
            parameters={"n_clusters": body.n_clusters},
        )
        _sync_analysis_summary(analysis_run, summary, db)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The unsupervised run completed, but the result could not be saved.",
        ) from exc

    return {**result, "experiment": _public_experiment_record(experiment)}


@router.post("/{analysis_id}/ml/supervised")
def run_analysis_supervised(
    analysis_id: int,
    body: SupervisedRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)

    try:
        frame = _load_analysis_source_frame(analysis_run, db=db)
        result = run_supervised_analysis(frame, target_column=body.target_column)
        summary = dict(analysis_run.report_payload)
        capabilities = dict(summary.get("ml_capabilities") or {})
        supervised_capabilities = dict(capabilities.get("supervised") or {})
        if not result.get("target_recommendation"):
            target_recommendations = supervised_capabilities.get("target_recommendations") or []
            target_recommendation = next(
                (item for item in target_recommendations if item.get("column") == body.target_column),
                None,
            )
            if target_recommendation is not None:
                result["target_recommendation"] = target_recommendation

        ml_results = dict(summary.get("ml_results") or {})
        ml_results["supervised"] = result
        summary["ml_results"] = ml_results
        experiment = _append_experiment(
            analysis_run,
            summary,
            experiment_type="supervised",
            result=result,
            parameters={"target_column": body.target_column},
        )
        _sync_analysis_summary(analysis_run, summary, db)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The supervised benchmark completed, but the result could not be saved.",
        ) from exc

    return {**result, "experiment": _public_experiment_record(experiment)}


@router.get("/{analysis_id}/ml/experiments/{experiment_id}/download")
def download_ml_experiment_report(
    analysis_id: int,
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    experiments = _get_saved_experiments(analysis_run.report_payload)
    experiment = next((item for item in experiments if item.get("id") == experiment_id), None)
    if experiment is None:
        raise HTTPException(status_code=404, detail="ML experiment not found.")

    payload = _load_saved_experiment_payload(experiment) or _rebuild_saved_experiment_payload(
        analysis_id,
        analysis_run.report_payload,
        experiment,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="ML experiment report not found.")

    return PlainTextResponse(
        _render_ml_experiment_report_text(payload),
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="analysis_{analysis_id}_{experiment_id}.txt"'
        },
    )


@router.get("/{analysis_id}/ml/experiments/{experiment_id}")
def get_ml_experiment_detail(
    analysis_id: int,
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    experiments = _get_saved_experiments(analysis_run.report_payload)
    experiment = next((item for item in experiments if item.get("id") == experiment_id), None)
    if experiment is None:
        raise HTTPException(status_code=404, detail="ML experiment not found.")

    payload = _load_saved_experiment_payload(experiment) or _rebuild_saved_experiment_payload(
        analysis_id,
        analysis_run.report_payload,
        experiment,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="ML experiment report not found.")

    return payload


@router.get("/{analysis_id}/ml/experiments/{experiment_id}/summary")
def download_ml_experiment_summary(
    analysis_id: int,
    experiment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    experiments = _get_saved_experiments(analysis_run.report_payload)
    experiment = next((item for item in experiments if item.get("id") == experiment_id), None)
    if experiment is None:
        raise HTTPException(status_code=404, detail="ML experiment not found.")

    summary_text = _get_saved_experiment_summary_text(experiment)
    if summary_text is not None:
        return PlainTextResponse(
            summary_text,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="analysis_{analysis_id}_{experiment_id}_summary.txt"'},
        )

    summary_path = _resolve_saved_path(experiment.get("summary_path"))
    if summary_path is None or not summary_path.exists():
        raise HTTPException(status_code=404, detail="ML experiment summary not found.")

    return FileResponse(
        summary_path,
        media_type="text/plain",
        filename=f"analysis_{analysis_id}_{experiment_id}_summary.txt",
    )


@router.get("/{analysis_id}/download")
def download_analysis_report(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis_run = _get_analysis_run(analysis_id, db, current_user)
    payload = analysis_run.report_payload
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Saved analysis report is invalid.")

    filename = f"analysis_{analysis_id}.txt"
    return PlainTextResponse(
        _render_analysis_report_text(analysis_id, payload),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )