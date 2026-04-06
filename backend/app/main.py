import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.health import router as health_router
from .api.routes.auth import router as auth_router
from .core.database import Base, SessionLocal, engine
from .core.config import settings
from . import models

logger = logging.getLogger(__name__)

# Create all tables
try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    logger.error("Failed to create tables: %s", exc)

from .api.routes.analysis import router as analysis_router
from .services.analysis_runs import retire_legacy_batch_tables

try:
    with SessionLocal() as db:
        retire_legacy_batch_tables(db)
except Exception as exc:
    logger.error("Failed to run startup migration: %s", exc)

app = FastAPI(title="Universal Data Analysis API")

# Configure CORS with settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(analysis_router)
