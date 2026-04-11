from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.health import router as health_router
from .api.routes.auth import router as auth_router
from .core.database import Base, SessionLocal, engine, ensure_runtime_schema_compatibility
from .core.config import settings
from . import models

Base.metadata.create_all(bind=engine)
ensure_runtime_schema_compatibility()

from .api.routes.analysis import router as analysis_router
from .services.analysis_runs import retire_legacy_batch_tables

with SessionLocal() as db:
    retire_legacy_batch_tables(db)

app = FastAPI(title="Universal Data Analysis API")

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
