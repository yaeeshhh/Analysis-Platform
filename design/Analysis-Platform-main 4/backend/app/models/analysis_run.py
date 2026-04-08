from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


class AnalysisRunRecord(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_file_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="uploaded", nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    report_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="analysis_runs")