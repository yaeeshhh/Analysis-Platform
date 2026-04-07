import os
from typing import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# Load .env from backend directory
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Make sure your .env file exists and contains DATABASE_URL."
    )


def _normalize_database_url(url: str) -> str:
    # Railway and some hosts provide postgres:// or postgresql://.
    # This project uses psycopg v3, so normalize to postgresql+psycopg://.
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+" not in url.split("://", 1)[0]:
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


engine = create_engine(_normalize_database_url(DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_runtime_schema_compatibility() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        binary_column_type = "BYTEA" if connection.dialect.name == "postgresql" else "BLOB"
        required_columns = {
            "users": {
                "full_name": "ALTER TABLE users ADD COLUMN full_name VARCHAR(200)",
                "date_of_birth": "ALTER TABLE users ADD COLUMN date_of_birth DATE",
                "two_factor_enabled": "ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT TRUE",
            },
            "pending_signups": {
                "full_name": "ALTER TABLE pending_signups ADD COLUMN full_name VARCHAR(200)",
            },
            "analysis_runs": {
                "source_file_blob": f"ALTER TABLE analysis_runs ADD COLUMN source_file_blob {binary_column_type}",
            },
        }

        for table_name, columns in required_columns.items():
            if not inspector.has_table(table_name):
                continue

            existing_columns = {
                column["name"] for column in inspector.get_columns(table_name)
            }

            for column_name, ddl in columns.items():
                if column_name in existing_columns:
                    continue

                connection.execute(text(ddl))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()