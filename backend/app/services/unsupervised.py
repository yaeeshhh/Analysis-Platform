from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def run_unsupervised_analysis(frame: pd.DataFrame, n_clusters: int = 3) -> dict[str, Any]:
    numeric_frame = frame.select_dtypes(include=["number"]).copy()
    numeric_frame = numeric_frame.loc[:, numeric_frame.notna().any()]
    if numeric_frame.shape[1] < 2:
        raise ValueError("Unsupervised analysis requires at least two numeric columns.")
    if len(numeric_frame) < 10:
        raise ValueError("Unsupervised analysis requires at least 10 rows.")

    prep = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    X = prep.fit_transform(numeric_frame)

    cluster_count = max(2, min(int(n_clusters), len(numeric_frame) - 1, 8))
    kmeans = KMeans(n_clusters=cluster_count, n_init=10, random_state=42)
    clusters = kmeans.fit_predict(X)

    isolation = IsolationForest(contamination=0.05, random_state=42)
    anomaly_flags = isolation.fit_predict(X)
    anomaly_scores = isolation.decision_function(X)

    pca = PCA(n_components=2, random_state=42)
    components = pca.fit_transform(X)

    preview = []
    base = frame.astype(object).where(pd.notnull(frame), None).head(300).reset_index(drop=True)
    for index, row in base.iterrows():
        preview.append(
            {
                "row": int(index + 1),
                "cluster": int(clusters[index]),
                "anomaly_flag": bool(anomaly_flags[index] == -1),
                "anomaly_score": round(float(anomaly_scores[index]), 6),
                "pc1": round(float(components[index, 0]), 6),
                "pc2": round(float(components[index, 1]), 6),
                "record": row.to_dict(),
            }
        )

    cluster_counts = pd.Series(clusters).value_counts().sort_index()
    return {
        "cluster_count": int(cluster_count),
        "cluster_distribution": [
            {"cluster": int(index), "count": int(value)}
            for index, value in cluster_counts.items()
        ],
        "anomaly_count": int((anomaly_flags == -1).sum()),
        "pca_explained_variance": [round(float(value), 6) for value in pca.explained_variance_ratio_.tolist()],
        "preview": preview,
        "used_numeric_columns": list(numeric_frame.columns),
    }