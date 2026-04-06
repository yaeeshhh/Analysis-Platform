from __future__ import annotations

from io import StringIO
from pathlib import Path

import pandas as pd


SUPPORTED_ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")


def validate_csv_filename(filename: str | None) -> str:
    cleaned = str(filename or "").strip()
    if not cleaned or not cleaned.lower().endswith(".csv"):
        raise ValueError("Please upload a CSV file.")
    return cleaned


def load_csv_from_bytes(content: bytes) -> tuple[pd.DataFrame, str]:
    errors: list[str] = []
    for encoding in SUPPORTED_ENCODINGS:
        try:
            decoded = content.decode(encoding)
            frame = pd.read_csv(StringIO(decoded), low_memory=False)
            frame.columns = [str(column).strip() for column in frame.columns]
            return frame, encoding
        except Exception as exc:
            errors.append(f"{encoding}: {exc}")
    raise ValueError("Unable to read CSV file. Tried encodings: " + "; ".join(errors[:3]))


def load_csv_from_path(path: str | Path) -> pd.DataFrame:
    frame = pd.read_csv(Path(path), low_memory=False)
    frame.columns = [str(column).strip() for column in frame.columns]
    return frame


def preview_rows(frame: pd.DataFrame, limit: int = 20) -> list[dict[str, object]]:
    sample = frame.head(limit).astype(object)
    sample = sample.where(pd.notnull(sample), None)
    return sample.to_dict(orient="records")