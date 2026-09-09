"""Local FastAPI application. Importing this module creates no DB or API client."""
from contextlib import asynccontextmanager
from http import HTTPStatus
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import OpenAI, OpenAIError
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.agent import PlanningAgent
from app.api.routes import router
from app.database import Database
from app.errors import ConflictError, NotFoundError
from app.storage_service import DatabasePlanningService

log = logging.getLogger(__name__)


class AgentUnavailable(Exception):
    pass


class AgentFailed(Exception):
    pass


def run_agent(service, message):
    key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "").strip()
    if not key or not model:
        raise AgentUnavailable()
    try:
        with OpenAI(api_key=key, timeout=60, max_retries=0) as client:
            return PlanningAgent(client, model, service).run(message)
    except OpenAIError:
        raise AgentFailed() from None
    except (ValueError, ValidationError):
        # Do not expose raw model output, upstream error bodies or credentials.
        raise AgentFailed() from None


def error(status, code, message):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app(database_path=None, *, now=None, agent_runner=None):
    @asynccontextmanager
    async def lifespan(app):
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        database = Database(database_path or Path(__file__).resolve().parents[1] / "data" / "planning.db")
        try:
            app.state.service = DatabasePlanningService(database, now=now)
            app.state.agent_runner = agent_runner or run_agent
            yield
        finally:
            database.close()

    app = FastAPI(title="Personal Planning Agent", version="0.4.0", lifespan=lifespan)

    @app.middleware("http")
    async def safe_errors(request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            # Catch before the ASGI server can log raw exception payloads.
            log.error("request_failed type=%s", type(exc).__name__)
            response = error(500, "internal_error", "An internal error occurred.")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        response = error(exc.status_code, "http_error", HTTPStatus(exc.status_code).phrase)
        if exc.headers and "Allow" in exc.headers:
            response.headers["Allow"] = exc.headers["Allow"]
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        # FastAPI's default detail includes rejected input values; omit them.
        return error(422, "validation_error", "Invalid request data. Check the API schema.")

    @app.exception_handler(ValidationError)
    async def invalid_model(request, exc):
        return error(422, "validation_error", "Invalid data.")

    @app.exception_handler(NotFoundError)
    async def not_found(request, exc):
        return error(404, "not_found", "The requested item does not exist.")

    @app.exception_handler(ConflictError)
    async def conflict(request, exc):
        return error(409, "conflict", str(exc))

    @app.exception_handler(ValueError)
    async def invalid_operation(request, exc):
        return error(409, "conflict", "The operation violates planning constraints.")

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        log.error("database_failed type=%s", type(exc).__name__)
        return error(503, "database_unavailable", "Database operation failed. Please retry.")

    @app.exception_handler(AgentUnavailable)
    async def agent_unavailable(request, exc):
        return error(503, "agent_not_configured", "Configure the backend OpenAI API key and model.")

    @app.exception_handler(AgentFailed)
    async def agent_failed(request, exc):
        return error(502, "agent_failed", "The Agent could not return a valid proposal. Please retry.")

    app.include_router(router)
    return app


app = create_app()
