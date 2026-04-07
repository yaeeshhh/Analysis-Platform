from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.cluster import MiniBatchKMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


MAX_UNSUPERVISED_ROWS = 6000
MAX_UNSUPERVISED_FEATURES = 24
MAX_UNSUPERVISED_PREVIEW_ROWS = 300


def _prepare_unsupervised_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, int, int]:
    numeric_frame = frame.select_dtypes(include=["number"]).copy()
    numeric_frame = numeric_frame.loc[:, numeric_frame.notna().any()]
    original_row_count = int(len(numeric_frame))
    original_column_count = int(numeric_frame.shape[1])

    if numeric_frame.shape[1] > MAX_UNSUPERVISED_FEATURES:
        ranked_columns = (
            numeric_frame.var(skipna=True)
            .fillna(0)
            .sort_values(ascending=False)
            .index[:MAX_UNSUPERVISED_FEATURES]
        )
        numeric_frame = numeric_frame.loc[:, ranked_columns]

    if len(numeric_frame) > MAX_UNSUPERVISED_ROWS:
        sample_index = numeric_frame.sample(n=MAX_UNSUPERVISED_ROWS, random_state=42).sort_index().index
        numeric_frame = numeric_frame.loc[sample_index]

    source_frame = frame.loc[numeric_frame.index]
    return numeric_frame, source_frame, original_row_count, original_column_count


def run_unsupervised_analysis(frame: pd.DataFrame, n_clusters: int = 3) -> dict[str, Any]:
    numeric_frame, source_frame, original_row_count, original_column_count = _prepare_unsupervised_frame(frame)
    if numeric_frame.shape[1] < 2:
        raise ValueError("Unsupervised analysis requires at least two numeric columns.")
    if len(numeric_frame) < 10:
        raise ValueError("Unsupervised analysis requires at least 10 rows.")

    warnings: list[str] = []
    if original_row_count > len(numeric_frame):
        warnings.append(
            f"Used a representative sample of {len(numeric_frame):,} rows from {original_row_count:,} available rows to keep the unsupervised scan responsive."
        )
    if original_column_count > numeric_frame.shape[1]:
        warnings.append(
            f"Used the {numeric_frame.shape[1]} highest-variance numeric columns out of {original_column_count} available to keep the scan stable on smaller deployments."
        )

    prep = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    X = prep.fit_transform(numeric_frame)

    cluster_count = max(2, min(int(n_clusters), len(numeric_frame) - 1, 8))
    kmeans = MiniBatchKMeans(
        n_clusters=cluster_count,
        n_init=6,
        random_state=42,
        batch_size=min(2048, max(256, len(numeric_frame) // 4)),
    )
    clusters = kmeans.fit_predict(X)

    isolation = IsolationForest(contamination=0.05, n_estimators=120, n_jobs=1, random_state=42)
    anomaly_flags = isolation.fit_predict(X)
    anomaly_scores = isolation.decision_function(X)

    pca = PCA(n_components=2, svd_solver="randomized", random_state=42)
    components = pca.fit_transform(X)

    preview = []
    source_positions = {index: position for position, index in enumerate(source_frame.index)}
    base = source_frame.astype(object).where(pd.notnull(source_frame), None).head(MAX_UNSUPERVISED_PREVIEW_ROWS).reset_index()
    for _, row in base.iterrows():
        source_index = int(row["index"])
        position = source_positions.get(source_index)
        if position is None:
            continue

        preview.append(
            {
                "row": int(source_index + 1),
                "cluster": int(clusters[position]),
                "anomaly_flag": bool(anomaly_flags[position] == -1),
                "anomaly_score": round(float(anomaly_scores[position]), 6),
                "pc1": round(float(components[position, 0]), 6),
                "pc2": round(float(components[position, 1]), 6),
                "record": row.drop(labels="index").to_dict(),
            }
        )

    cluster_counts = pd.Series(clusters).value_counts().sort_index()
    return {
        "cluster_count": int(cluster_count),
        "rows_scanned": int(len(numeric_frame)),
        "rows_available": int(original_row_count),
        "cluster_distribution": [
            {"cluster": int(index), "count": int(value)}
            for index, value in cluster_counts.items()
        ],
        "anomaly_count": int((anomaly_flags == -1).sum()),
        "pca_explained_variance": [round(float(value), 6) for value in pca.explained_variance_ratio_.tolist()],
        "preview": preview,
        "used_numeric_columns": list(numeric_frame.columns),
        "warnings": warnings,
    }