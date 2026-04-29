import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/analysis_platform",
    )

    # JWT & Security
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "change-me-in-production-use-openssl-rand-hex-32",
    )
    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_TOKEN_EXPIRE_SECONDS: int = 7 * 24 * 60 * 60

    # Development/session behavior
    # When enabled, any token issued before current backend process start is rejected.
    # Defaults to False in production so deploys don't log everyone out.
    # Set to True locally during development if you want clean token state on restart.
    INVALIDATE_TOKENS_ON_RESTART: bool = (
        os.getenv("INVALIDATE_TOKENS_ON_RESTART", "false").lower() == "true"
    )

    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    PASSWORD_RESET_EXPIRE_MINUTES: int = int(
        os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30")
    )
    REMEMBER_LOGIN_EXPIRE_DAYS: int = int(
        os.getenv("REMEMBER_LOGIN_EXPIRE_DAYS", "30")
    )
    LOGIN_VERIFICATION_EXPIRE_MINUTES: int = int(
        os.getenv("LOGIN_VERIFICATION_EXPIRE_MINUTES", "10")
    )
    LOGIN_VERIFICATION_MAX_ATTEMPTS: int = int(
        os.getenv("LOGIN_VERIFICATION_MAX_ATTEMPTS", "5")
    )
    LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS: int = int(
        os.getenv("LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS", "30")
    )

    EMAIL_HTTP_ENDPOINT: str | None = os.getenv("EMAIL_HTTP_ENDPOINT")
    EMAIL_HTTP_AUTH_NAME: str = os.getenv("EMAIL_HTTP_AUTH_NAME", "api")
    EMAIL_HTTP_AUTH_VALUE: str | None = os.getenv("EMAIL_HTTP_AUTH_VALUE")
    EMAIL_HTTP_TIMEOUT_SECONDS: float = float(
        os.getenv("EMAIL_HTTP_TIMEOUT_SECONDS", "10")
    )
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "no-reply@analysis-platform.local")

    # Mailgun settings
    MAILGUN_API_KEY: str | None = os.getenv("MAILGUN_API_KEY")
    MAILGUN_DOMAIN: str | None = os.getenv("MAILGUN_DOMAIN")

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    # Add to list via env: CORS_ORIGINS=http://example.com,http://example.org
    _custom_origins = os.getenv("CORS_ORIGINS", "")
    if _custom_origins:
        CORS_ORIGINS.extend([origin.strip() for origin in _custom_origins.split(",")])

    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")


settings = Settings()