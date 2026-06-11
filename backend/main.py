"""
main.py — FastAPI application entry point.

Registers routers, configures CORS, and runs startup checks.
Run with: uvicorn main:app --reload
"""

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import test_connection
from routers import documents, query

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup checks before accepting requests."""
    logger.info("Starting Sourcely API...")

    if test_connection():
        logger.info("✓ Database connection OK")
    else:
        logger.warning("✗ Database connection FAILED — check DATABASE_URL and that Postgres is running")

    yield  # server is live here

    logger.info("Shutting down Sourcely API")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sourcely API",
    version="0.1.0",
    description="RAG-powered document Q&A with cited sources",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# MUST be registered before include_router calls. In Starlette's middleware
# stack, add_middleware() wraps the current app — so registering CORS first
# ensures it is outermost (processes requests first, responses last), which
# guarantees Access-Control-* headers are injected even on error responses.
#
# allow_private_network=True is required because Chrome sends
# "Access-Control-Request-Private-Network: true" on every localhost→localhost
# preflight (Private Network Access spec). Without this flag Starlette returns
# 400 "Disallowed CORS private-network" before the browser can proceed.
#
# allow_origin_regex covers Vite dev-server fallback ports (e.g. 5174 when 5173
# is taken). A fixed allow_origins list alone causes 400 "Disallowed CORS origin"
# on preflight for POST /documents/upload.
#
# ALLOWED_ORIGINS env var (comma-separated) adds production URLs at runtime —
# set it in Railway to include the Vercel frontend URL, e.g.:
#   ALLOWED_ORIGINS=https://sourcely.vercel.app,https://sourcely-git-main.vercel.app
_extra_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        *_extra_origins,
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)

# ── Global error handler ──────────────────────────────────────────────────────
# Registered before routers so the ExceptionMiddleware (which processes these
# handlers) is wired up before any route-level code runs.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled errors return JSON instead of HTML."""
    logger.error(f"Unhandled error on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Check server logs."},
    )

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(documents.router)
app.include_router(query.router)


# ── Utility routes ────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"name": "sourcely", "version": "0.1.0"}
