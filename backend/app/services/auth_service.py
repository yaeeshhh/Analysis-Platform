from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..models.user import User
from ..models.refresh_token import RefreshToken
from ..models.password_reset_token import PasswordResetToken
from ..models.remember_login_token import RememberLoginToken
from ..models.login_verification_code import LoginVerificationCode
from ..models.profile_update_verification_code import ProfileUpdateVerificationCode
from ..models.account_deletion_verification_code import AccountDeletionVerificationCode
from ..core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_token_type,
    verify_token_freshness,
)
from ..core.config import settings
from ..core.email import (
    send_password_reset_email,
    send_login_verification_email,
    send_profile_update_verification_email,
    send_account_deletion_verification_email,
    email_delivery_is_configured,
)


class AuthService:
    """Authentication service for user signup, login, and token management."""

    @staticmethod
    def _is_expired(expires_at: datetime) -> bool:
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is not None:
            return now > expires_at.astimezone(timezone.utc)

        # For legacy naive timestamps, interpret both as UTC and local time.
        # Use the earlier expiry (minimum remaining) to avoid extending token validity.
        as_utc = expires_at.replace(tzinfo=timezone.utc)
        local_tz = datetime.now().astimezone().tzinfo
        as_local = expires_at.replace(tzinfo=local_tz).astimezone(timezone.utc)
        remaining_utc = (as_utc - now).total_seconds()
        remaining_local = (as_local - now).total_seconds()
        remaining_seconds = min(remaining_utc, remaining_local)
        return remaining_seconds <= 0

    @staticmethod
    def _seconds_elapsed_from(timestamp: datetime, now_utc: datetime) -> float:
        if timestamp.tzinfo is not None:
            return (now_utc - timestamp.astimezone(timezone.utc)).total_seconds()

        # Legacy rows may be stored as naive UTC or naive local time.
        as_utc = timestamp.replace(tzinfo=timezone.utc)
        elapsed_utc = (now_utc - as_utc).total_seconds()

        local_tz = datetime.now().astimezone().tzinfo
        as_local = timestamp.replace(tzinfo=local_tz).astimezone(timezone.utc)
        elapsed_local = (now_utc - as_local).total_seconds()

        return max(elapsed_utc, elapsed_local)

    @staticmethod
    def _hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_code(raw_code: str) -> str:
        return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize_identifier(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _sanitize_reset_redirect_path(redirect_path: str | None) -> str:
        if not redirect_path or not redirect_path.startswith("/"):
            return "/login"

        try:
            parsed = urlsplit(redirect_path)
        except ValueError:
            return "/login"

        if parsed.scheme or parsed.netloc:
            return "/login"

        filtered_query = urlencode(
            [
                (key, value)
                for key, value in parse_qsl(parsed.query, keep_blank_values=True)
                if key not in {"login_prompt", "reset_token", "token"}
            ],
            doseq=True,
        )

        return urlunsplit(("", "", parsed.path or "/login", filtered_query, parsed.fragment))

    @staticmethod
    def _extract_origin(value: str | None) -> str | None:
        text = (value or "").strip()
        if not text:
            return None

        try:
            parsed = urlsplit(text)
        except ValueError:
            return None

        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None

        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")

    @staticmethod
    def _resolve_frontend_base_url(frontend_origin: str | None = None) -> str:
        configured_origin = AuthService._extract_origin(settings.FRONTEND_URL)
        allowed_origins = {
            origin
            for origin in [
                configured_origin,
                *(AuthService._extract_origin(origin) for origin in settings.CORS_ORIGINS),
            ]
            if origin
        }

        requested_origin = AuthService._extract_origin(frontend_origin)
        if requested_origin and requested_origin in allowed_origins:
            return requested_origin

        return settings.FRONTEND_URL.rstrip("/")

    @staticmethod
    def _normalize_verification_code(code: str) -> str:
        normalized_code = code.strip()
        if not re.fullmatch(r"\d{6}", normalized_code):
            raise HTTPException(status_code=400, detail="Enter a valid 6-digit verification code")
        return normalized_code

    @staticmethod
    def _enforce_resend_cooldown(last_sent_at: datetime | None, now: datetime) -> None:
        if not last_sent_at:
            return

        elapsed = AuthService._seconds_elapsed_from(last_sent_at, now)
        if elapsed < 0:
            elapsed = 0
        remaining = settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS - int(elapsed)
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before resending the code.",
            )

    @staticmethod
    def _refresh_challenge_code(
        challenge: LoginVerificationCode
        | ProfileUpdateVerificationCode
        | AccountDeletionVerificationCode,
    ) -> str:
        now = datetime.now(timezone.utc)
        raw_code = f"{secrets.randbelow(1_000_000):06d}"
        challenge.code_hash = AuthService._hash_code(raw_code)
        challenge.expires_at = now + timedelta(
            minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES
        )
        challenge.last_sent_at = now
        challenge.attempts = 0
        return raw_code

    @staticmethod
    def _assert_verification_attempt(
        challenge: LoginVerificationCode | ProfileUpdateVerificationCode | AccountDeletionVerificationCode,
        normalized_code: str,
        db: Session,
        too_many_attempts_detail: str,
        incorrect_code_detail: str,
    ) -> None:
        if challenge.attempts >= settings.LOGIN_VERIFICATION_MAX_ATTEMPTS:
            challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail=too_many_attempts_detail)

        if secrets.compare_digest(
            challenge.code_hash,
            AuthService._hash_code(normalized_code),
        ):
            return

        challenge.attempts += 1
        if challenge.attempts >= settings.LOGIN_VERIFICATION_MAX_ATTEMPTS:
            challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail=too_many_attempts_detail)
        db.commit()
        raise HTTPException(status_code=401, detail=incorrect_code_detail)

    @staticmethod
    def _validate_password_policy(password: str) -> None:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        if any(ch.isspace() for ch in password):
            raise HTTPException(status_code=400, detail="Password cannot contain spaces")
        if not any(ch.isdigit() for ch in password):
            raise HTTPException(status_code=400, detail="Password must include at least one number")
        if not any(ch.isupper() for ch in password):
            raise HTTPException(
                status_code=400,
                detail="Password must include at least one uppercase letter",
            )
        if not re.search(r"[^A-Za-z0-9]", password):
            raise HTTPException(status_code=400, detail="Password must include at least one symbol")

    @staticmethod
    def _issue_login_artifacts(
        user: User,
        db: Session,
        remember_me: bool = False,
    ) -> tuple[str, str, str | None]:
        access_token = create_access_token({"sub": str(user.id)})
        refresh_token, jti = create_refresh_token({"sub": str(user.id)})

        db_refresh_token = RefreshToken(
            user_id=user.id,
            jti=jti,
            token=refresh_token,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS),
        )
        db.add(db_refresh_token)

        remember_token: str | None = None
        if remember_me:
            remember_token = secrets.token_urlsafe(48)
            db.add(
                RememberLoginToken(
                    user_id=user.id,
                    token_hash=AuthService._hash_token(remember_token),
                    expires_at=datetime.now(timezone.utc)
                    + timedelta(days=settings.REMEMBER_LOGIN_EXPIRE_DAYS),
                )
            )

        db.commit()
        return access_token, refresh_token, remember_token

    @staticmethod
    def _create_login_verification(
        user: User,
        db: Session,
        remember_me: bool = False,
    ) -> tuple[str, datetime]:
        db.query(LoginVerificationCode).filter(
            LoginVerificationCode.user_id == user.id,
            LoginVerificationCode.used == False,
        ).update({"used": True})

        raw_challenge_token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES
        )

        db.add(
            LoginVerificationCode(
                user_id=user.id,
                challenge_token_hash=AuthService._hash_token(raw_challenge_token),
                code_hash=AuthService._hash_code(f"{secrets.randbelow(1_000_000):06d}"),
                expires_at=expires_at,
                remember_me=remember_me,
                last_sent_at=None,
            )
        )
        db.commit()

        return raw_challenge_token, expires_at

    @staticmethod
    def _get_login_verification(challenge_token: str, db: Session) -> LoginVerificationCode:
        db_challenge = (
            db.query(LoginVerificationCode)
            .filter(
                LoginVerificationCode.challenge_token_hash == AuthService._hash_token(challenge_token),
                LoginVerificationCode.used == False,
            )
            .first()
        )

        if not db_challenge:
            raise HTTPException(status_code=401, detail="Verification session is invalid or expired")

        if AuthService._is_expired(db_challenge.expires_at):
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Verification session expired. Please log in again.")

        return db_challenge

    @staticmethod
    def send_login_code(
        challenge_token: str,
        db: Session,
    ) -> tuple[User, datetime, int]:
        db_challenge = AuthService._get_login_verification(challenge_token, db)
        user = db.query(User).filter(User.id == db_challenge.user_id).first()

        if not user or not user.is_active:
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="User not found or inactive")

        AuthService._enforce_resend_cooldown(
            db_challenge.last_sent_at,
            datetime.now(timezone.utc),
        )

        raw_code = AuthService._refresh_challenge_code(db_challenge)
        db.commit()

        sent, email_error = send_login_verification_email(
            user.email,
            raw_code,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES,
            recipient_name=user.full_name,
        )

        if email_delivery_is_configured() and not sent:
            detail = "Unable to send verification email right now. Please try again later."
            if email_error:
                detail = f"{detail} ({email_error})"
            raise HTTPException(
                status_code=503,
                detail=detail,
            )

        return user, db_challenge.expires_at, settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS

    @staticmethod
    def resolve_login_identifier(
        identifier: str,
        db: Session,
    ) -> tuple[bool, str | None]:
        normalized = AuthService._normalize_identifier(identifier)
        if not normalized:
            return False, None

        from sqlalchemy import func, or_

        user = db.query(User).filter(
            or_(func.lower(User.email) == normalized, func.lower(User.username) == normalized)
        ).first()

        if not user or not user.is_active:
            return False, None

        return True, user.email

    @staticmethod
    def check_signup_availability(
        email: str | None,
        username: str | None,
        db: Session,
    ) -> tuple[bool, bool]:
        from sqlalchemy import func

        email_exists = False
        username_exists = False

        normalized_email = AuthService._normalize_identifier(email) if email else ""
        normalized_username = AuthService._normalize_identifier(username) if username else ""

        if normalized_email:
            email_exists = (
                db.query(User)
                .filter(func.lower(User.email) == normalized_email)
                .first()
                is not None
            )

        if normalized_username:
            username_exists = (
                db.query(User)
                .filter(func.lower(User.username) == normalized_username)
                .first()
                is not None
            )

        return email_exists, username_exists
    
    @staticmethod
    def _seconds_until(expires_at: datetime) -> int:
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            now = now.replace(tzinfo=None)
        return max(0, int((expires_at - now).total_seconds()))

    @staticmethod
    def login(
        identifier: str,
        password: str,
        db: Session,
        remember_me: bool = False,
    ):
        from sqlalchemy import func, or_

        normalized_identifier = AuthService._normalize_identifier(identifier)

        user = (
            db.query(User)
            .filter(
                or_(
                    func.lower(User.email) == normalized_identifier,
                    func.lower(User.username) == normalized_identifier,
                )
            )
            .first()
        )

        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not user.is_active:
            raise HTTPException(status_code=403, detail="User account is inactive")

        challenge_token, expires_at = AuthService._create_login_verification(
            user,
            db,
            remember_me=remember_me,
        )

        return user, challenge_token, expires_at

    @staticmethod
    def verify_login_code(
        challenge_token: str,
        code: str,
        db: Session,
    ) -> tuple[User, str, str, str | None]:
        normalized_code = AuthService._normalize_verification_code(code)

        db_challenge = AuthService._get_login_verification(challenge_token, db)

        if not db_challenge.last_sent_at:
            raise HTTPException(status_code=400, detail="Send a verification code first")

        AuthService._assert_verification_attempt(
            db_challenge,
            normalized_code,
            db,
            too_many_attempts_detail="Too many incorrect codes. Please log in again.",
            incorrect_code_detail="Incorrect verification code",
        )

        user = db.query(User).filter(User.id == db_challenge.user_id).first()
        if not user or not user.is_active:
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="User not found or inactive")

        db_challenge.used = True
        access_token, refresh_token, remember_token = AuthService._issue_login_artifacts(
            user,
            db,
            remember_me=db_challenge.remember_me,
        )

        return user, access_token, refresh_token, remember_token

    @staticmethod
    def login_with_remember_token(
        email: str,
        remember_token: str,
        db: Session,
    ) -> tuple[User, str, str, str]:
        normalized_email = AuthService._normalize_identifier(email)
        user = db.query(User).filter(User.email == normalized_email).first()

        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid remember me session")

        token_hash = AuthService._hash_token(remember_token)
        db_token = (
            db.query(RememberLoginToken)
            .filter(
                RememberLoginToken.user_id == user.id,
                RememberLoginToken.token_hash == token_hash,
                RememberLoginToken.revoked == False,
            )
            .first()
        )

        if not db_token:
            raise HTTPException(status_code=401, detail="Invalid remember me session")

        if AuthService._is_expired(db_token.expires_at):
            db_token.revoked = True
            db.commit()
            raise HTTPException(status_code=401, detail="Remember me session expired")

        db_token.revoked = True
        db_token.last_used_at = datetime.now(timezone.utc)

        access_token, refresh_token, new_remember_token = AuthService._issue_login_artifacts(
            user, db, remember_me=True
        )

        return user, access_token, refresh_token, new_remember_token or ""

    @staticmethod
    def generate_remember_token(user: User, db: Session) -> str:
        """Generate a new remember-me token for the current user."""
        remember_token = secrets.token_urlsafe(48)
        db.add(
            RememberLoginToken(
                user_id=user.id,
                token_hash=AuthService._hash_token(remember_token),
                expires_at=datetime.now(timezone.utc)
                + timedelta(days=settings.REMEMBER_LOGIN_EXPIRE_DAYS),
            )
        )
        db.commit()
        return remember_token

    @staticmethod
    def request_password_reset(
        email: str,
        db: Session,
        redirect_path: str | None = None,
        frontend_origin: str | None = None,
    ) -> str | None:
        normalized_email = AuthService._normalize_identifier(email)
        user = db.query(User).filter(User.email == normalized_email).first()

        # Always return success-style behavior to avoid account enumeration.
        if not user:
            return None

        now = datetime.now(timezone.utc)
        now_utc_naive = datetime.utcnow()

        latest_reset = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == user.id)
            .order_by(PasswordResetToken.created_at.desc())
            .first()
        )

        if latest_reset:
            latest_created_at = latest_reset.created_at
            if latest_created_at.tzinfo is not None:
                latest_created_at = latest_created_at.astimezone(timezone.utc).replace(
                    tzinfo=None
                )

            elapsed = (now_utc_naive - latest_created_at).total_seconds()
            if elapsed < 0:
                elapsed = 0

            remaining = settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS - int(elapsed)
            if remaining > 0:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Please wait {remaining} seconds before requesting another reset link."
                    ),
                )

        raw_token = secrets.token_urlsafe(48)
        token_hash = AuthService._hash_token(raw_token)

        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,
        ).update({"used": True})

        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                created_at=now_utc_naive,
                expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
            )
        )
        db.commit()

        safe_path = AuthService._sanitize_reset_redirect_path(redirect_path)

        separator = "&" if "?" in safe_path else "?"
        frontend_base_url = AuthService._resolve_frontend_base_url(frontend_origin)
        reset_link = (
            f"{frontend_base_url}{safe_path}"
            f"{separator}reset_token={raw_token}"
        )
        sent = send_password_reset_email(normalized_email, reset_link, recipient_name=user.full_name)

        # For local development without SMTP, return the link so frontend can show it.
        if not sent:
            return reset_link

        return None

    @staticmethod
    def reset_password(token: str, new_password: str, db: Session) -> None:
        AuthService._validate_password_policy(new_password)

        token_hash = AuthService._hash_token(token)
        db_token = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,
            )
            .first()
        )

        if not db_token:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        if AuthService._is_expired(db_token.expires_at):
            db_token.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        user = db.query(User).filter(User.id == db_token.user_id).first()
        if not user:
            db_token.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        if verify_password(new_password, user.password_hash):
            raise HTTPException(
                status_code=400,
                detail="New password cannot be the same as your current password",
            )

        user.password_hash = hash_password(new_password)
        db_token.used = True

        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked == False,
        ).update({"revoked": True})

        db.query(RememberLoginToken).filter(
            RememberLoginToken.user_id == user.id,
            RememberLoginToken.revoked == False,
        ).update({"revoked": True})

        db.add(user)
        db.commit()

    @staticmethod
    def get_password_reset_context(token: str, db: Session) -> tuple[str, str | None]:
        token_hash = AuthService._hash_token(token)
        db_token = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used == False,
            )
            .first()
        )

        if not db_token:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        if AuthService._is_expired(db_token.expires_at):
            db_token.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        user = db.query(User).filter(User.id == db_token.user_id).first()
        if not user or not user.is_active:
            db_token.used = True
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        return user.email, user.username

    @staticmethod
    def refresh_access_token(refresh_token: str, db: Session) -> tuple[str, str]:
        """Generate a new access token from refresh token.
        
        Returns:
            tuple: (new_access_token, new_refresh_token)
        """
        try:
            payload = decode_token(refresh_token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Verify token type
        if not verify_token_type(payload, "refresh"):
            raise HTTPException(status_code=401, detail="Invalid token type")

        if not verify_token_freshness(payload):
            raise HTTPException(
                status_code=401,
                detail="Session expired after server restart. Please log in again.",
            )

        user_id = payload.get("sub")
        jti = payload.get("jti")

        if not user_id or not jti:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        # Check if token exists and is not revoked
        db_token = (
            db.query(RefreshToken)
            .filter(
                RefreshToken.jti == jti,
                RefreshToken.user_id == int(user_id),
                RefreshToken.revoked == False,
            )
            .first()
        )

        if not db_token:
            raise HTTPException(status_code=401, detail="Refresh token not found or revoked")

        # Check if token is expired
        if AuthService._is_expired(db_token.expires_at):
            raise HTTPException(status_code=401, detail="Refresh token expired")

        # Get user
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Update last used timestamp
        db_token.last_used_at = datetime.now(timezone.utc)
        db.commit()

        # Create new tokens
        new_access_token = create_access_token({"sub": str(user.id)})
        new_refresh_token, new_jti = create_refresh_token({"sub": str(user.id)})

        # Replace old refresh token with new one
        db_token.revoked = True
        new_db_token = RefreshToken(
            user_id=user.id,
            jti=new_jti,
            token=new_refresh_token,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS),
        )
        db.add(new_db_token)
        db.commit()

        return new_access_token, new_refresh_token

    @staticmethod
    def logout(user_id: int, db: Session) -> None:
        """Logout current web session by revoking refresh tokens only.

        Remember-me tokens are intentionally preserved so users can
        re-authenticate without password within the remember window.
        """
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id, RefreshToken.revoked == False
        ).update({"revoked": True})
        db.commit()

    @staticmethod
    def logout_all_sessions(user_id: int, db: Session) -> None:
        """Revoke all refresh and remember-me tokens for user."""
        AuthService.logout(user_id, db)
        db.query(RememberLoginToken).filter(
            RememberLoginToken.user_id == user_id,
            RememberLoginToken.revoked == False,
        ).update({"revoked": True})
        db.commit()

    @staticmethod
    def get_user_by_id(user_id: int, db: Session) -> User:
        """Get user by ID."""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @staticmethod
    def update_profile(
        user: User,
        db: Session,
        email: str | None = None,
        username: str | None = None,
        full_name: str | None = None,
        date_of_birth=None,
        password: str | None = None,
        current_password: str | None = None,
        require_identity_verification: bool = True,
    ) -> User:
        """Update current user's profile fields with uniqueness checks."""
        from sqlalchemy import func

        has_changes = False
        password_changed = False

        # full_name and date_of_birth can be updated without verification
        if full_name is not None:
            cleaned_name = full_name.strip() if full_name else None
            if cleaned_name != user.full_name:
                user.full_name = cleaned_name or None
                has_changes = True

        if date_of_birth is not None:
            if date_of_birth != user.date_of_birth:
                user.date_of_birth = date_of_birth
                has_changes = True

        if email is not None:
            normalized_email = AuthService._normalize_identifier(email)
            if normalized_email != user.email:
                if require_identity_verification:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Email updates require verification. "
                            "Request a profile verification code first."
                        ),
                    )
                existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
                if existing and existing.id != user.id:
                    raise HTTPException(status_code=400, detail="Email already registered")
                user.email = normalized_email
                has_changes = True

        if username is not None:
            normalized_username = AuthService._normalize_identifier(username) if username.strip() else None
            if normalized_username != user.username:
                if require_identity_verification:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Username updates require verification. "
                            "Request a profile verification code first."
                        ),
                    )
                if normalized_username:
                    if len(normalized_username) < 3:
                        raise HTTPException(
                            status_code=400,
                            detail="Username must be at least 3 characters",
                        )
                    existing = (
                        db.query(User).filter(func.lower(User.username) == normalized_username).first()
                    )
                    if existing and existing.id != user.id:
                        raise HTTPException(status_code=400, detail="Username already taken")
                user.username = normalized_username
                has_changes = True

        if password is not None and password.strip():
            if not current_password or not verify_password(current_password, user.password_hash):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            AuthService._validate_password_policy(password)
            if verify_password(password, user.password_hash):
                raise HTTPException(
                    status_code=400,
                    detail="New password cannot be the same as your current password",
                )
            user.password_hash = hash_password(password)
            has_changes = True
            password_changed = True

        if not has_changes:
            raise HTTPException(status_code=400, detail="No profile changes provided")

        if password_changed:
            db.query(RefreshToken).filter(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked == False,
            ).update({"revoked": True})
            db.query(RememberLoginToken).filter(
                RememberLoginToken.user_id == user.id,
                RememberLoginToken.revoked == False,
            ).update({"revoked": True})

        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def request_profile_identity_update_code(
        user: User,
        db: Session,
        email: str | None,
        username: str | None,
    ) -> tuple[str, str, int, int]:
        from sqlalchemy import func

        pending_email: str | None = None
        pending_username: str | None = None

        if email is not None:
            normalized_email = AuthService._normalize_identifier(email)
            if normalized_email != user.email:
                existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
                if existing and existing.id != user.id:
                    raise HTTPException(status_code=400, detail="Email already registered")
                pending_email = normalized_email

        if username is not None:
            normalized_username = AuthService._normalize_identifier(username) if username.strip() else None
            if normalized_username != user.username:
                if normalized_username:
                    if len(normalized_username) < 3:
                        raise HTTPException(
                            status_code=400,
                            detail="Username must be at least 3 characters",
                        )
                    existing = (
                        db.query(User).filter(func.lower(User.username) == normalized_username).first()
                    )
                    if existing and existing.id != user.id:
                        raise HTTPException(status_code=400, detail="Username already taken")
                pending_username = normalized_username

        if pending_email is None and pending_username is None:
            raise HTTPException(status_code=400, detail="No username or email changes to verify")

        now = datetime.now(timezone.utc)

        db.query(ProfileUpdateVerificationCode).filter(
            ProfileUpdateVerificationCode.user_id == user.id,
            ProfileUpdateVerificationCode.used == False,
        ).update({"used": True})

        raw_challenge_token = secrets.token_urlsafe(48)
        initial_code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = now + timedelta(minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES)

        db.add(
            ProfileUpdateVerificationCode(
                user_id=user.id,
                challenge_token_hash=AuthService._hash_token(raw_challenge_token),
                code_hash=AuthService._hash_code(initial_code),
                pending_email=pending_email,
                pending_username=pending_username,
                send_to_email=user.email,
                expires_at=expires_at,
                attempts=0,
                used=False,
                last_sent_at=None,
            )
        )
        db.commit()

        return (
            raw_challenge_token,
            user.email,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES * 60,
            0,
        )

    @staticmethod
    def send_profile_identity_update_code(
        user: User,
        challenge_token: str,
        db: Session,
    ) -> tuple[str, datetime, int]:
        db_challenge = (
            db.query(ProfileUpdateVerificationCode)
            .filter(
                ProfileUpdateVerificationCode.user_id == user.id,
                ProfileUpdateVerificationCode.challenge_token_hash
                == AuthService._hash_token(challenge_token),
                ProfileUpdateVerificationCode.used == False,
            )
            .first()
        )

        if not db_challenge:
            raise HTTPException(status_code=401, detail="Verification session is invalid or expired")

        if AuthService._is_expired(db_challenge.expires_at):
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Verification session expired. Try again.")

        AuthService._enforce_resend_cooldown(
            db_challenge.last_sent_at,
            datetime.now(timezone.utc),
        )

        raw_code = AuthService._refresh_challenge_code(db_challenge)
        db.commit()

        send_profile_update_verification_email(
            db_challenge.send_to_email,
            raw_code,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES,
            recipient_name=user.full_name,
        )

        return (
            db_challenge.send_to_email,
            db_challenge.expires_at,
            settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS,
        )

    @staticmethod
    def verify_profile_identity_update_code(
        user: User,
        challenge_token: str,
        code: str,
        db: Session,
    ) -> User:
        from sqlalchemy import func

        normalized_code = AuthService._normalize_verification_code(code)

        db_challenge = (
            db.query(ProfileUpdateVerificationCode)
            .filter(
                ProfileUpdateVerificationCode.user_id == user.id,
                ProfileUpdateVerificationCode.challenge_token_hash
                == AuthService._hash_token(challenge_token),
                ProfileUpdateVerificationCode.used == False,
            )
            .first()
        )

        if not db_challenge:
            raise HTTPException(status_code=401, detail="Verification session is invalid or expired")

        if AuthService._is_expired(db_challenge.expires_at):
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Verification session expired. Try again.")

        if not db_challenge.last_sent_at:
            raise HTTPException(status_code=400, detail="Send a verification code first")

        AuthService._assert_verification_attempt(
            db_challenge,
            normalized_code,
            db,
            too_many_attempts_detail="Too many incorrect codes. Try again.",
            incorrect_code_detail="Incorrect verification code",
        )

        if db_challenge.pending_email and db_challenge.pending_email != user.email:
            existing = (
                db.query(User)
                .filter(func.lower(User.email) == db_challenge.pending_email)
                .first()
            )
            if existing and existing.id != user.id:
                db_challenge.used = True
                db.commit()
                raise HTTPException(status_code=400, detail="Email already registered")

        if db_challenge.pending_username != user.username:
            pending_username = db_challenge.pending_username
            if pending_username:
                if len(pending_username) < 3:
                    db_challenge.used = True
                    db.commit()
                    raise HTTPException(
                        status_code=400,
                        detail="Username must be at least 3 characters",
                    )
                existing = (
                    db.query(User)
                    .filter(func.lower(User.username) == pending_username)
                    .first()
                )
                if existing and existing.id != user.id:
                    db_challenge.used = True
                    db.commit()
                    raise HTTPException(status_code=400, detail="Username already taken")

        db_challenge.used = True
        user.email = db_challenge.pending_email or user.email
        user.username = db_challenge.pending_username
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def request_account_deletion_code(
        user: User,
        db: Session,
    ) -> tuple[str, str, int, int]:
        now = datetime.now(timezone.utc)

        db.query(AccountDeletionVerificationCode).filter(
            AccountDeletionVerificationCode.user_id == user.id,
            AccountDeletionVerificationCode.used == False,
        ).update({"used": True})

        raw_challenge_token = secrets.token_urlsafe(48)
        initial_code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = now + timedelta(minutes=settings.LOGIN_VERIFICATION_EXPIRE_MINUTES)

        db.add(
            AccountDeletionVerificationCode(
                user_id=user.id,
                challenge_token_hash=AuthService._hash_token(raw_challenge_token),
                code_hash=AuthService._hash_code(initial_code),
                send_to_email=user.email,
                expires_at=expires_at,
                attempts=0,
                used=False,
                last_sent_at=None,
            )
        )
        db.commit()

        return (
            raw_challenge_token,
            user.email,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES * 60,
            0,
        )

    @staticmethod
    def send_account_deletion_code(
        user: User,
        challenge_token: str,
        db: Session,
    ) -> tuple[str, datetime, int]:
        db_challenge = (
            db.query(AccountDeletionVerificationCode)
            .filter(
                AccountDeletionVerificationCode.user_id == user.id,
                AccountDeletionVerificationCode.challenge_token_hash
                == AuthService._hash_token(challenge_token),
                AccountDeletionVerificationCode.used == False,
            )
            .first()
        )

        if not db_challenge:
            raise HTTPException(status_code=401, detail="Verification session is invalid or expired")

        if AuthService._is_expired(db_challenge.expires_at):
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Verification session expired. Try again.")

        AuthService._enforce_resend_cooldown(
            db_challenge.last_sent_at,
            datetime.now(timezone.utc),
        )

        raw_code = AuthService._refresh_challenge_code(db_challenge)
        db.commit()

        send_account_deletion_verification_email(
            db_challenge.send_to_email,
            raw_code,
            settings.LOGIN_VERIFICATION_EXPIRE_MINUTES,
            recipient_name=user.full_name,
        )

        return (
            db_challenge.send_to_email,
            db_challenge.expires_at,
            settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS,
        )

    @staticmethod
    def verify_account_deletion_code(
        user: User,
        challenge_token: str,
        code: str,
        db: Session,
    ) -> None:
        normalized_code = AuthService._normalize_verification_code(code)

        db_challenge = (
            db.query(AccountDeletionVerificationCode)
            .filter(
                AccountDeletionVerificationCode.user_id == user.id,
                AccountDeletionVerificationCode.challenge_token_hash
                == AuthService._hash_token(challenge_token),
                AccountDeletionVerificationCode.used == False,
            )
            .first()
        )

        if not db_challenge:
            raise HTTPException(status_code=401, detail="Verification session is invalid or expired")

        if AuthService._is_expired(db_challenge.expires_at):
            db_challenge.used = True
            db.commit()
            raise HTTPException(status_code=401, detail="Verification session expired. Try again.")

        if not db_challenge.last_sent_at:
            raise HTTPException(status_code=400, detail="Send a verification code first")

        AuthService._assert_verification_attempt(
            db_challenge,
            normalized_code,
            db,
            too_many_attempts_detail="Too many incorrect codes. Try again.",
            incorrect_code_detail="Incorrect verification code",
        )

        db_challenge.used = True
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete()
        db.query(RememberLoginToken).filter(RememberLoginToken.user_id == user.id).delete()
        db.delete(user)
        db.commit()
