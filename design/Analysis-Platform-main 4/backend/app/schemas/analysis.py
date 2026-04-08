from __future__ import annotations

from pydantic import BaseModel, Field


class UnsupervisedRequest(BaseModel):
    n_clusters: int = Field(default=3, ge=2, le=8)


class SupervisedRequest(BaseModel):
    target_column: str