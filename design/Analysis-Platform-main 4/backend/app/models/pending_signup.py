from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from ..core.database import Base


class PendingSignup(Base):
    __tablename__ = "pending_signups"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String(200), nullable=True)
    password_hash = Column(String, nullable=False)

    challenge_token_hash = Column(String, unique=True, nullable=False, index=True)
    otp_code_hash = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_sent_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    used = Column(Boolean, nullable=False, default=False)