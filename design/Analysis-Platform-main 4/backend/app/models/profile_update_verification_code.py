from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


class ProfileUpdateVerificationCode(Base):
    __tablename__ = "profile_update_verification_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    challenge_token_hash: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    pending_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pending_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    send_to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime, default=None, nullable=True)

    user = relationship("User", back_populates="profile_update_verification_codes")