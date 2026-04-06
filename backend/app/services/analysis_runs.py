from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from ..models.analysis_run import AnalysisRunRecord


LEGACY_BATCH_UPLOADS_TABLE = "batch_uploads"
LEGACY_BATCH_RESULTS_TABLE = "batch_results"


@dataclass(slots=True)
class AnalysisRun:
    record: AnalysisRunRecord

    @property
    def id(self) -> int:
        return self.record.id

    @property
    def user_id(self) -> int:
        return self.record.user_id

    @property
    def display_name(self) -> str | None:
        return self.record.display_name

    @property
    def dataset_name(self) -> str:
        return self.display_name or Path(self.source_filename).stem

    @property
    def source_filename(self) -> str:
        return self.record.source_filename

    @property
    def stored_filename(self) -> str:
        return self.record.stored_filename

    @property
    def status(self) -> str:
        return self.record.status

    @property
    def row_count(self) -> int:
        return self.record.row_count

    @property
    def processed_row_count(self) -> int:
        return self.record.processed_row_count

    @property
    def created_at(self) -> datetime:
        return self.record.created_at

    @property
    def updated_at(self) -> datetime:
        return self.record.updated_at

    @property
    def report_payload(self) -> dict[str, object]:
        payload = self.record.report_payload
        return payload if isinstance(payload, dict) else {}

    @report_payload.setter
    def report_payload(self, value: dict[str, object]) -> None:
        self.record.report_payload = value


def _table_exists(db: Session, table_name: str) -> bool:
    return inspect(db.get_bind()).has_table(table_name)


def _legacy_batch_uploads_table_exists(db: Session) -> bool:
    return _table_exists(db, LEGACY_BATCH_UPLOADS_TABLE)


def _legacy_batch_results_table_exists(db: Session) -> bool:
    return _table_exists(db, LEGACY_BATCH_RESULTS_TABLE)


def _sync_analysis_run_sequence(db: Session) -> None:
    if db.get_bind().dialect.name != "postgresql":
        return

    max_id = db.query(func.max(AnalysisRunRecord.id)).scalar()
    if max_id is None:
        return

    db.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('analysis_runs', 'id'), :max_id, true)"
        ),
        {"max_id": int(max_id)},
    )


def _drop_legacy_batch_tables(db: Session) -> None:
    db.execute(text(f"DROP TABLE IF EXISTS {LEGACY_BATCH_RESULTS_TABLE}"))
    db.execute(text(f"DROP TABLE IF EXISTS {LEGACY_BATCH_UPLOADS_TABLE}"))


def retire_legacy_batch_tables(db: Session) -> int:
    has_legacy_uploads = _legacy_batch_uploads_table_exists(db)
    has_legacy_results = _legacy_batch_results_table_exists(db)

    if not has_legacy_uploads and not has_legacy_results:
        return 0

    existing_ids = {record_id for (record_id,) in db.query(AnalysisRunRecord.id).all()}
    migrated_count = 0

    if has_legacy_uploads:
        legacy_records = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    name,
                    filename_original,
                    filename_stored,
                    status,
                    total_rows,
                    processed_rows,
                    summary_json,
                    created_at,
                    updated_at
                FROM batch_uploads
                ORDER BY id ASC
                """
            )
        ).mappings().all()
    else:
        legacy_records = []

    for legacy in legacy_records:
        legacy_id = int(legacy["id"])
        if legacy_id not in existing_ids:
            db.add(
                AnalysisRunRecord(
                    id=legacy_id,
                    user_id=int(legacy["user_id"]),
                    display_name=legacy["name"],
                    source_filename=str(legacy["filename_original"]),
                    stored_filename=str(legacy["filename_stored"]),
                    status=str(legacy["status"]),
                    row_count=int(legacy["total_rows"] or 0),
                    processed_row_count=int(legacy["processed_rows"] or 0),
                    report_payload=legacy["summary_json"] if isinstance(legacy["summary_json"], dict) else None,
                    created_at=legacy["created_at"],
                    updated_at=legacy["updated_at"],
                )
            )
            migrated_count += 1

    db.flush()
    _sync_analysis_run_sequence(db)
    _drop_legacy_batch_tables(db)
    db.commit()
    return migrated_count


def create_analysis_run(
    db: Session,
    *,
    user_id: int,
    dataset_name: str | None,
    source_filename: str,
    stored_filename: str,
    row_count: int,
    status: str = "completed",
) -> AnalysisRun:
    total_rows = max(0, int(row_count))
    record = AnalysisRunRecord(
        user_id=user_id,
        display_name=dataset_name or Path(source_filename).stem,
        source_filename=source_filename,
        stored_filename=stored_filename,
        status=status,
        row_count=total_rows,
        processed_row_count=total_rows,
        report_payload=None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return AnalysisRun(record)


def get_analysis_run(db: Session, *, user_id: int, analysis_id: int) -> AnalysisRun | None:
    record = (
        db.query(AnalysisRunRecord)
        .filter(AnalysisRunRecord.id == analysis_id, AnalysisRunRecord.user_id == user_id)
        .first()
    )
    if record is None:
        return None
    return AnalysisRun(record)


def list_analysis_runs(db: Session, *, user_id: int) -> list[AnalysisRun]:
    records = (
        db.query(AnalysisRunRecord)
        .filter(AnalysisRunRecord.user_id == user_id)
        .order_by(AnalysisRunRecord.id.desc())
        .all()
    )
    return [AnalysisRun(record) for record in records]


def save_analysis_report(db: Session, analysis_run: AnalysisRun, report_payload: dict[str, object]) -> None:
    analysis_run.report_payload = report_payload
    db.add(analysis_run.record)
    db.commit()
    db.refresh(analysis_run.record)


def delete_analysis_run_record(db: Session, analysis_run: AnalysisRun) -> None:
    db.delete(analysis_run.record)
    db.commit()