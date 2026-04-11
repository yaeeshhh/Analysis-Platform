import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SERVER_START_TS = int(datetime.now(timezone.utc).timestamp())
PASSWORD_CHANGED_REAUTH_DETAIL = "Your password was changed. Please log in again."


def hash_password(password: str) -> str:
    """Hash password with bcrypt, limiting to 72 bytes as per bcrypt spec."""
    password = password.encode("utf-8")[:72]
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain password against hashed password."""
    plain = plain.encode("utf-8")[:72]
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a short-lived access token (default 15 minutes)."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    issued_at = datetime.now(timezone.utc).timestamp()
    to_encode.update({"exp": expire, "iat": issued_at, "type": "access"})

    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a long-lived refresh token (default 7 days)."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            seconds=settings.REFRESH_TOKEN_EXPIRE_SECONDS
        )

    jti = str(uuid.uuid4())
    issued_at = datetime.now(timezone.utc).timestamp()
    to_encode.update(
        {"exp": expire, "iat": issued_at, "jti": jti, "type": "refresh"}
    )

    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt, jti


def decode_token(token: str) -> dict:
    """Decode token and return payload. Raises JWTError if invalid."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def verify_token_type(payload: dict, expected_type: str) -> bool:
    """Verify that token has the expected type (access or refresh)."""
    return payload.get("type") == expected_type


def verify_token_freshness(payload: dict) -> bool:
    """Reject tokens issued before current process start when configured."""
    if not settings.INVALIDATE_TOKENS_ON_RESTART:
        return True

    issued_at = payload.get("iat")
    if not isinstance(issued_at, (int, float)):
        return False

    return int(issued_at) >= SERVER_START_TS


def was_token_issued_before(payload: dict, cutoff: datetime | None) -> bool:
    """Return True when a token predates a server-side security cutoff."""
    if cutoff is None:
        return False

    issued_at = payload.get("iat")
    if not isinstance(issued_at, (int, float)):
        return True

    cutoff_utc = (
        cutoff.replace(tzinfo=timezone.utc)
        if cutoff.tzinfo is None
        else cutoff.astimezone(timezone.utc)
    )
    return float(issued_at) < cutoff_utc.timestamp()
