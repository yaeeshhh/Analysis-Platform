from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.email import send_login_verification_email, email_delivery_is_configured
from ..core.security import hash_password
from ..models.pending_signup import PendingSignup
from ..models.user import User


class PendingSignupService:
    @staticmethod
    def _hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_code(raw_code: str) -> str:
        return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _seconds_until(expires_at: datetime) -> int:
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            now = now.replace(tzinfo=None)
        return max(0, int((expires_at - now).total_seconds()))

    @staticmethod
    def _seconds_since(timestamp: datetime | None) -> int:
        if not timestamp:
            return 10**9
        now = datetime.now(timezone.utc)
        if timestamp.tzinfo is not None:
            return int((now - timestamp.astimezone(timezone.utc)).total_seconds())
        return int((now.replace(tzinfo=None) - timestamp).total_seconds())

    @staticmethod
    def create_pending_signup(email: str, username: str, password: str, db: Session) -> PendingSignup:
        from sqlalchemy import func, or_

        normalized_email = PendingSignupService._normalize(email)
        normalized_username = PendingSignupService._normalize(username)

        existing_user = (
            db.query(User)
            .filter(
                or_(
                    func.lower(User.email) == normalized_email,
                    func.lower(User.username) == normalized_username,
                )
            )
            .first()
        )

        if existing_user:
            if existing_user.email and existing_user.email.strip().lower() == normalized_email:
                raise HTTPException(status_code=400, detail="Email already exists.")
            if existing_user.username and existing_user.username.strip().lower() == normalized_username:
                raise HTTPException(status_code=400, detail="Username already exists.")
            raise HTTPException(status_code=400, detail="Email or username already exists.")

        existing_pending_rows = (
            db.query(PendingSignup)
            .filter(
                or_(
                    func.lower(PendingSignup.email) == normalized_email,
                    func.lower(PendingSignup.username) == normalized_username,
                )
            )
            .all()
        )

        for row in existing_pending_rows:
            db.delete(row)

        if existing_pending_rows:
            db.commit()

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES)
        raw_challenge_token = secrets.token_urlsafe(48)

        pending = PendingSignup(
            email=normalized_email,
            username=normalized_username,
            password_hash=hash_password(password),
            challenge_token_hash=PendingSignupService._hash_token(raw_challenge_token),
            otp_code_hash=None,
            created_at=now,
            expires_at=expires_at,
            last_sent_at=None,
            attempts=0,
            used=False,
        )

        db.add(pending)
        db.commit()
        db.refresh(pending)

        pending.raw_challenge_token = raw_challenge_token
        return pending

    @staticmethod
    def get_pending_signup(challenge_token: str, db: Session) -> PendingSignup:
        pending = (
            db.query(PendingSignup)
            .filter(
                PendingSignup.challenge_token_hash == PendingSignupService._hash_token(challenge_token),
                PendingSignup.used == False,
            )
            .first()
        )

        if not pending:
            raise HTTPException(status_code=401, detail="Signup session is invalid or expired.")

        now = datetime.now(timezone.utc)
        pending_expires = pending.expires_at
        if pending_expires.tzinfo is not None:
            expired = pending_expires.astimezone(timezone.utc) < now
        else:
            expired = pending_expires < now.replace(tzinfo=None)

        if expired:
            pending.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Signup session expired. Please sign up again.")

        return pending

    @staticmethod
    def send_signup_code(challenge_token: str, db: Session) -> PendingSignup:
        pending = PendingSignupService.get_pending_signup(challenge_token, db)

        elapsed = PendingSignupService._seconds_since(pending.last_sent_at)
        cooldown = getattr(settings, "LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS", 30)
        if elapsed < cooldown:
            remaining = cooldown - elapsed
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before resending the code.",
            )

        raw_code = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)

        pending.otp_code_hash = PendingSignupService._hash_code(raw_code)
        pending.last_sent_at = now
        pending.attempts = 0
        pending.expires_at = now + timedelta(minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES)

        db.commit()
        db.refresh(pending)

        sent, email_error = send_login_verification_email(
            pending.email,
            raw_code,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES,
        )

        if email_delivery_is_configured() and not sent:
            detail = "Unable to send verification email right now. Please try again later."
            if email_error:
                detail = f"{detail} ({email_error})"
            raise HTTPException(status_code=503, detail=detail)

        return pending

    @staticmethod
    def verify_signup_code(challenge_token: str, code: str, db: Session) -> PendingSignup:
        from sqlalchemy import func, or_

        normalized_code = code.strip()
        if not normalized_code.isdigit() or len(normalized_code) != 6:
            raise HTTPException(status_code=400, detail="Enter a valid 6-digit verification code")

        pending = PendingSignupService.get_pending_signup(challenge_token, db)

        if not pending.last_sent_at or not pending.otp_code_hash:
            raise HTTPException(status_code=400, detail="Send a verification code first")

        existing_user = (
            db.query(User)
            .filter(
                or_(
                    func.lower(User.email) == pending.email.lower(),
                    func.lower(User.username) == pending.username.lower(),
                )
            )
            .first()
        )

        if existing_user:
            pending.used = True
            db.commit()
            if existing_user.email and existing_user.email.strip().lower() == pending.email.lower():
                raise HTTPException(status_code=400, detail="Email already exists.")
            if existing_user.username and existing_user.username.strip().lower() == pending.username.lower():
                raise HTTPException(status_code=400, detail="Username already exists.")
            raise HTTPException(status_code=400, detail="Email or username already exists.")

        code_hash = PendingSignupService._hash_code(normalized_code)
        if pending.otp_code_hash != code_hash:
            pending.attempts += 1
            db.commit()
            raise HTTPException(status_code=400, detail="Incorrect verification code")

        return pending

    @staticmethod
    def delete_pending_signup_by_challenge(challenge_token: str, db: Session):
        pending = (
            db.query(PendingSignup)
            .filter(PendingSignup.challenge_token_hash == PendingSignupService._hash_token(challenge_token))
            .first()
        )
        if pending:
            db.delete(pending)
            db.commit()