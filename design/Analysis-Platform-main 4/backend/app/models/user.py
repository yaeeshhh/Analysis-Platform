from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    analysis_runs = relationship(
        "AnalysisRunRecord", back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship(
        "PasswordResetToken", back_populates="user", cascade="all, delete-orphan"
    )
    remember_login_tokens = relationship(
        "RememberLoginToken", back_populates="user", cascade="all, delete-orphan"
    )
    login_verification_codes = relationship(
        "LoginVerificationCode", back_populates="user", cascade="all, delete-orphan"
    )
    profile_update_verification_codes = relationship(
        "ProfileUpdateVerificationCode",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    account_deletion_verification_codes = relationship(
        "AccountDeletionVerificationCode",
        back_populates="user",
        cascade="all, delete-orphan",
    )