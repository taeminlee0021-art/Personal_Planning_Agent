"""Local FastAPI application. Importing this module creates no DB or API client."""
from contextlib import asynccontextmanager
from http import HTTPStatus
import logging
import os
from pathlib import Path
import secrets

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import APIConnectionError, APITimeoutError, AuthenticationError, BadRequestError, OpenAI, OpenAIError, RateLimitError
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.agent import AgentExecutionError, PlanningAgent
from app.api.routes import router
from app.database import Database
from app.errors import ConflictError, NotFoundError
from app.storage_service import DatabasePlanningService

log = logging.getLogger(__name__)


class AgentUnavailable(Exception):
    pass


class AgentFailed(Exception):
    def __init__(self, code="agent_failed", message="플래너가 유효한 계획을 만들지 못했습니다. 다시 시도해 주세요."):
        self.code = code
        self.public_message = message
        super().__init__(code)


def run_agent(service, message):
    key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "").strip()
    if not key or not model:
        raise AgentUnavailable()
    try:
        with OpenAI(api_key=key, timeout=60, max_retries=0) as client:
            return PlanningAgent(client, model, service).run(message)
    except AuthenticationError:
        raise AgentFailed("agent_authentication_failed", "OpenAI API 인증에 실패했습니다. 서버의 API 키를 확인해 주세요.") from None
    except RateLimitError:
        raise AgentFailed("agent_rate_limited", "OpenAI 요청 한도 또는 결제 한도에 도달했습니다. 잠시 후 사용량을 확인해 주세요.") from None
    except APITimeoutError:
        raise AgentFailed("agent_timeout", "OpenAI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.") from None
    except APIConnectionError:
        raise AgentFailed("agent_connection_failed", "OpenAI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
    except BadRequestError:
        raise AgentFailed("agent_request_rejected", "OpenAI가 플래너 요청 형식을 거절했습니다.") from None
    except OpenAIError:
        raise AgentFailed("agent_upstream_failed", "OpenAI 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.") from None
    except AgentExecutionError as exc:
        messages = {
            "agent_output_limit": "응답 길이 제한으로 계획 생성이 중단되었습니다. 요청 범위를 줄여 주세요.",
            "agent_response_incomplete": "OpenAI 응답이 완성되지 않았습니다. 다시 시도해 주세요.",
            "agent_response_failed": "OpenAI가 응답 생성을 완료하지 못했습니다. 다시 시도해 주세요.",
            "agent_response_cancelled": "OpenAI 응답 생성이 취소되었습니다. 다시 시도해 주세요.",
            "agent_missing_tool_data": "플래너가 필요한 일정 데이터를 모두 확인하지 못했습니다.",
            "agent_invalid_proposal": "생성된 계획이 시간·중복·목표 제약 검증을 두 번 통과하지 못했습니다.",
            "agent_tool_arguments_invalid": "플래너가 내부 조회 도구에 잘못된 인수를 전달했습니다.",
            "agent_round_limit": "플래너가 제한된 처리 단계 안에 계획을 완성하지 못했습니다.",
        }
        raise AgentFailed(exc.code, messages[exc.code]) from None
    except (ValueError, ValidationError):
        # Do not expose raw model output, upstream error bodies or credentials.
        raise AgentFailed("agent_internal_validation", "플래너 내부 검증 중 오류가 발생했습니다.") from None


def error(status, code, message):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app(database_path=None, *, now=None, agent_runner=None):
    @asynccontextmanager
    async def lifespan(app):
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        configured_url = os.getenv("DATABASE_URL", "").strip()
        configured_path = os.getenv("PLANNING_DATABASE_PATH", "").strip()
        database = Database(
            database_path or configured_url or configured_path
            or Path(__file__).resolve().parents[1] / "data" / "planning.db"
        )
        try:
            app.state.service = DatabasePlanningService(database, now=now)
            app.state.agent_runner = agent_runner or run_agent
            yield
        finally:
            database.close()

    app = FastAPI(title="Personal Planning Agent", version="0.5.0", lifespan=lifespan)

    @app.middleware("http")
    async def safe_errors(request: Request, call_next):
        internal_token = os.getenv("APP_INTERNAL_TOKEN", "").strip()
        if (request.url.path.startswith("/api/") and internal_token and
                not secrets.compare_digest(request.headers.get("x-internal-token", ""), internal_token)):
            response = error(401, "unauthorized", "Authentication required.")
            response.headers["Cache-Control"] = "no-store"
            return response
        try:
            response = await call_next(request)
        except Exception as exc:
            # Catch before the ASGI server can log raw exception payloads.
            log.error("request_failed type=%s", type(exc).__name__)
            response = error(500, "internal_error", "An internal error occurred.")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health", include_in_schema=False)
    async def health():
        return {"status": "ok"}

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
        log.error("agent_failed code=%s", exc.code)
        return error(502, exc.code, exc.public_message)

    app.include_router(router)
    return app


app = create_app()
