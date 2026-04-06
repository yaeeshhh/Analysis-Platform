from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd


DATE_NAME_TOKENS = {"date", "time", "timestamp", "created", "updated", "month", "year", "day"}
CURRENCY_NAME_TOKENS = {"revenue", "charge", "charges", "cost", "price", "amount", "payment", "fee", "salary", "income", "spend"}
PERCENT_NAME_TOKENS = {"percent", "percentage", "pct", "rate", "ratio", "share"}
COUNT_NAME_TOKENS = {"count", "counts", "calls", "visits", "clicks", "qty", "quantity", "number", "messages", "orders", "tickets"}
DURATION_NAME_TOKENS = {"duration", "tenure", "seconds", "minutes", "hours", "days", "weeks", "months", "years", "time"}
EMAIL_NAME_TOKENS = {"email", "mail"}
PHONE_NAME_TOKENS = {"phone", "mobile", "telephone", "cell"}
URL_NAME_TOKENS = {"url", "uri", "website", "site", "web", "link"}
POSTAL_NAME_TOKENS = {"zip", "postal", "postcode", "pincode"}
LATITUDE_NAME_TOKENS = {"lat", "latitude"}
LONGITUDE_NAME_TOKENS = {"lon", "lng", "longitude"}
LOCATION_NAME_TOKENS = {"city", "state", "region", "province", "country"}
EMAIL_PATTERN = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
URL_PATTERN = re.compile(r"^(?:https?://|www\.)", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"^\+?[0-9][0-9\-\s().]{6,}$")
ORDINAL_VALUE_GROUPS = [
    {"low", "medium", "high"},
    {"low", "med", "high"},
    {"poor", "fair", "good", "excellent"},
    {"small", "medium", "large"},
    {"bronze", "silver", "gold", "platinum"},
    {"very low", "low", "medium", "high", "very high"},
]


def _name_tokens(value: str) -> set[str]:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(value or ""))
    return {
        token.lower()
        for token in re.split(r"[^A-Za-z0-9]+", normalized)
        if token.strip()
    }


def _normalized_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value).strip().lower())


def _string_sample(series: pd.Series, limit: int = 40) -> list[str]:
    values: list[str] = []
    for item in series.dropna().astype(str).head(limit).tolist():
        normalized = str(item).strip()
        if normalized:
            values.append(normalized)
    return values


def _match_ratio(sample: list[str], pattern: re.Pattern[str]) -> float:
    if not sample:
        return 0.0
    return float(sum(1 for item in sample if pattern.fullmatch(item)) / len(sample))


def _integer_ratio(series: pd.Series) -> float:
    converted = pd.to_numeric(series.dropna(), errors="coerce").dropna()
    if converted.empty:
        return 0.0
    values = converted.to_numpy(dtype=float)
    return float(np.isclose(values, np.round(values), atol=1e-9).mean())


def infer_semantic_type(series: pd.Series, inferred_type: str) -> tuple[str, float]:
    non_null = series.dropna()
    if non_null.empty:
        return inferred_type, 0.0

    tokens = _name_tokens(str(series.name or ""))
    unique_ratio = float(non_null.nunique(dropna=True) / max(1, len(non_null)))
    sample = _string_sample(series)
    normalized_values = {_normalized_text(value) for value in sample if _normalized_text(value)}

    if {"id", "identifier"}.intersection(tokens):
        return "identifier", 0.99
    if EMAIL_NAME_TOKENS.intersection(tokens) or _match_ratio(sample, EMAIL_PATTERN) >= 0.9:
        return "email", 0.97
    if PHONE_NAME_TOKENS.intersection(tokens) or _match_ratio(sample, PHONE_PATTERN) >= 0.9:
        return "phone", 0.95
    if URL_NAME_TOKENS.intersection(tokens) or _match_ratio(sample, URL_PATTERN) >= 0.9:
        return "url", 0.95
    if POSTAL_NAME_TOKENS.intersection(tokens):
        return "postal_code", 0.95

    if inferred_type == "boolean":
        return "binary_flag", 0.98

    if inferred_type == "datetime":
        if DATE_NAME_TOKENS.intersection(tokens):
            return "event_timestamp", 0.94
        return "datetime", 0.9

    if inferred_type == "numeric":
        converted = pd.to_numeric(non_null, errors="coerce").dropna()
        if converted.empty:
            return "numeric_continuous", 0.5
        if LATITUDE_NAME_TOKENS.intersection(tokens) and float(converted.between(-90, 90).mean()) >= 0.95:
            return "latitude", 0.96
        if LONGITUDE_NAME_TOKENS.intersection(tokens) and float(converted.between(-180, 180).mean()) >= 0.95:
            return "longitude", 0.96
        if CURRENCY_NAME_TOKENS.intersection(tokens):
            return "currency", 0.9
        if PERCENT_NAME_TOKENS.intersection(tokens):
            in_unit_interval = float(converted.between(0, 1).mean())
            in_percent_interval = float(converted.between(0, 100).mean())
            if max(in_unit_interval, in_percent_interval) >= 0.95:
                return "percentage", 0.92
        if DURATION_NAME_TOKENS.intersection(tokens):
            return "duration", 0.86
        if COUNT_NAME_TOKENS.intersection(tokens) and _integer_ratio(series) >= 0.95 and float((converted >= 0).mean()) >= 0.98:
            return "count", 0.88
        return "numeric_continuous", 0.72

    if inferred_type in {"categorical", "text"}:
        if normalized_values and any(normalized_values.issubset(group) for group in ORDINAL_VALUE_GROUPS):
            return "ordinal_category", 0.9
        if LOCATION_NAME_TOKENS.intersection(tokens):
            return "location_label", 0.78
        if inferred_type == "text":
            return "free_text", 0.82
        return "categorical_label", 0.74

    if unique_ratio >= 0.995:
        return "identifier", 0.82

    return inferred_type, 0.5


def _looks_datetime_like(series: pd.Series) -> bool:
    raw_name = str(series.name or "").strip()
    normalized_name = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", raw_name)
    name_tokens = {
        token.lower()
        for token in re.split(r"[^A-Za-z0-9]+", normalized_name)
        if token.strip()
    }
    if DATE_NAME_TOKENS.intersection(name_tokens):
        return True

    non_null = series.dropna()
    if non_null.empty:
        return False

    sample = non_null.astype(str).str.strip().head(25)
    if sample.empty:
        return False

    pattern = r"(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(?:\d{1,2}:\d{2})"
    return float(sample.str.contains(pattern, regex=True, na=False).mean()) >= 0.6


def _bool_ratio(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    normalized = non_null.astype(str).str.strip().str.lower()
    return float(normalized.isin({"true", "false", "yes", "no", "y", "n", "0", "1"}).mean())


def _numeric_ratio(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    converted = pd.to_numeric(non_null, errors="coerce")
    return float(converted.notna().mean())


def _datetime_ratio(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    if not _looks_datetime_like(series):
        return 0.0
    converted = pd.to_datetime(non_null.astype(str), errors="coerce")
    return float(converted.notna().mean())


def infer_column_type(series: pd.Series) -> str:
    non_null = series.dropna()
    if non_null.empty:
        return "unknown"

    bool_ratio = _bool_ratio(series)
    if bool_ratio >= 0.95:
        return "boolean"

    datetime_ratio = _datetime_ratio(series)
    if datetime_ratio >= 0.9 and non_null.nunique(dropna=True) > 1:
        return "datetime"

    numeric_ratio = _numeric_ratio(series)
    if numeric_ratio >= 0.9:
        converted = pd.to_numeric(non_null, errors="coerce")
        unique_values = converted.dropna().unique().tolist()
        if len(unique_values) <= 2 and set(int(value) for value in unique_values if pd.notna(value)).issubset({0, 1}):
            return "boolean"
        return "numeric"

    average_length = float(non_null.astype(str).str.len().mean())
    unique_ratio = float(non_null.nunique(dropna=True) / max(1, len(non_null)))
    if average_length > 32 and unique_ratio > 0.5:
        return "text"

    return "categorical"


def infer_column_role(series: pd.Series, inferred_type: str, row_count: int, semantic_type: str | None = None) -> str:
    name = str(series.name or "").strip().lower()
    name_tokens = _name_tokens(name)
    non_null = series.dropna()
    unique_count = int(non_null.nunique(dropna=True))
    unique_ratio = unique_count / max(1, len(non_null)) if len(non_null) else 0.0

    if semantic_type in {"identifier", "email", "phone", "url"}:
        return "identifier"
    if semantic_type == "postal_code" and unique_ratio >= 0.5:
        return "identifier"
    if {"id", "identifier"}.intersection(name_tokens) or (
        unique_ratio >= 0.98 and unique_count > 0.9 * max(1, row_count)
    ):
        return "identifier"
    if inferred_type == "datetime":
        return "datetime"
    if inferred_type == "boolean":
        return "boolean"
    if inferred_type == "numeric":
        if 2 <= unique_count <= max(20, int(row_count * 0.05)):
            return "target-candidate"
        return "numeric"
    if inferred_type in {"categorical", "text"}:
        if 2 <= unique_count <= max(25, int(row_count * 0.1)):
            return "target-candidate"
        return "categorical"
    return "unknown"


def profile_schema(frame: pd.DataFrame) -> dict[str, Any]:
    row_count = int(len(frame))
    column_profiles: list[dict[str, Any]] = []
    type_counts = {"numeric": 0, "categorical": 0, "boolean": 0, "datetime": 0, "text": 0, "unknown": 0}

    for column in frame.columns:
        series = frame[column]
        inferred_type = infer_column_type(series)
        semantic_type, semantic_confidence = infer_semantic_type(series, inferred_type)
        role = infer_column_role(series, inferred_type, row_count, semantic_type)
        type_counts[inferred_type] = type_counts.get(inferred_type, 0) + 1

        non_null_count = int(series.notna().sum())
        unique_count = int(series.dropna().nunique())
        samples = [value for value in series.dropna().astype(str).head(5).tolist()]
        column_profiles.append(
            {
                "name": str(column),
                "inferred_type": inferred_type,
                "semantic_type": semantic_type,
                "semantic_confidence": round(float(semantic_confidence), 4),
                "likely_role": role,
                "non_null_count": non_null_count,
                "non_null_pct": round(non_null_count / max(1, row_count), 4),
                "missing_count": int(row_count - non_null_count),
                "missing_pct": round((row_count - non_null_count) / max(1, row_count), 4),
                "unique_count": unique_count,
                "unique_pct": round(unique_count / max(1, row_count), 4),
                "sample_values": samples,
            }
        )

    return {
        "row_count": row_count,
        "column_count": int(len(frame.columns)),
        "type_counts": type_counts,
        "columns": column_profiles,
        "identifier_columns": [item["name"] for item in column_profiles if item["likely_role"] == "identifier"],
        "target_candidates": [
            item["name"]
            for item in column_profiles
            if item["likely_role"] in {"target-candidate", "boolean"}
        ],
    }