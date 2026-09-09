import argparse
from datetime import datetime
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI, OpenAIError
from sqlalchemy.exc import SQLAlchemyError

from app.agent import PlanningAgent
from app.database import Database
from app.inputs import ManualPlanInput, ScheduleInput
from app.planning import KST, Preferences
from app.services import MockPlanningService
from app.storage_service import DatabasePlanningService


def show(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def ask_agent(service, request):
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    key, model = os.getenv("OPENAI_API_KEY", "").strip(), os.getenv("OPENAI_MODEL", "").strip()
    if not key or not model:
        raise ValueError("backend/.env에 OPENAI_API_KEY와 OPENAI_MODEL을 설정하세요.")
    with OpenAI(api_key=key, timeout=60, max_retries=0) as client:
        show(PlanningAgent(client, model, service).run(request))


def read_datetime(prompt):
    value = datetime.fromisoformat(input(prompt + " (예: 2026-09-10 19:00, 한국 시간): ").strip())
    # CLI explicitly labels local input; backend services still reject naive datetimes.
    return value.replace(tzinfo=KST) if value.tzinfo is None else value


def data(service):
    return {"tasks": service.get_tasks(), "schedules": service.get_fixed_schedules(),
            "preferences": service.get_preferences(), "plans": service.get_current_plan(),
            "slots": service.get_available_time_slots()}


def edit_tasks(service):
    show(service.get_tasks())
    action = input("1. 수정  2. 완료  3. 삭제  0. 취소: ").strip()
    if action == "0":
        return
    if action not in {"1", "2", "3"}:
        raise ValueError("메뉴 번호를 선택하세요.")
    identifier = int(input("할 일 ID: "))
    if action == "3":
        service.delete_task(identifier)
        print("삭제했습니다.")
    elif action == "2":
        show(service.update_task(identifier, status="COMPLETED").model_dump(mode="json"))
    else:
        # One field per edit keeps the existing values explicit and preserves other fields.
        fields = {"1": "title", "2": "estimated_minutes", "3": "priority", "4": "weekly_target_count",
                  "5": "due_date", "6": "description", "7": "status", "8": "category"}
        selected = fields.get(input("1. 이름 2. 시간(분) 3. 우선순위 4. 주간 횟수 5. 마감일 6. 설명 7. 상태 8. 분류: "))
        if selected is None:
            raise ValueError("항목 번호를 선택하세요.")
        value = input("새 값 (우선순위 LOW/MEDIUM/HIGH, 상태 TODO/PLANNED/COMPLETED, 날짜 YYYY-MM-DD): ")
        if selected == "due_date" and not value.strip():
            value = None
        show(service.update_task(identifier, **{selected: value}).model_dump(mode="json"))


def edit_schedules(service):
    show(service.list_schedules())
    action = input("1. 추가  2. 수정  3. 삭제  0. 취소: ").strip()
    if action == "0":
        return
    if action not in {"1", "2", "3"}:
        raise ValueError("메뉴 번호를 선택하세요.")
    identifier = int(input("일정 ID: ")) if action != "1" else None
    if action == "3":
        service.delete_schedule(identifier)
        print("삭제했습니다.")
        return
    value = ScheduleInput(title=input("일정 이름: "),
                          start_datetime=read_datetime("시작"),
                          end_datetime=read_datetime("종료"),
                          description=input("설명: "))
    show(service.save_schedule(value, identifier))


def edit_preferences(service):
    show(service.get_preferences())
    print("빈 값은 현재 설정을 유지합니다.")
    current = service.get_preferences()
    current.pop("timezone")
    labels = {"weekday_available_from": "평일 시작(HH:MM)", "weekday_available_until": "평일 종료(HH:MM)",
              "weekend_available_from": "주말 시작(HH:MM)", "weekend_available_until": "주말 종료(HH:MM)",
              "max_daily_planning_minutes": "하루 계획 한도(분)"}
    for field, label in labels.items():
        value = input(label + ": ").strip()
        if value:
            current[field] = value
    show(service.save_preferences(Preferences.model_validate(current)))


def edit_plans(service):
    show(service.list_plans())
    action = input("1. 직접 추가  2. 직접 수정  3. 삭제  4. 완료  0. 취소: ").strip()
    if action == "0":
        return
    if action not in {"1", "2", "3", "4"}:
        raise ValueError("메뉴 번호를 선택하세요.")
    identifier = int(input("계획 ID: ")) if action != "1" else None
    if action == "3":
        service.delete_plan(identifier)
        print("삭제했습니다.")
    elif action == "4":
        show(service.complete_plan(identifier))
    else:
        show(service.get_tasks())
        value = ManualPlanInput(task_id=int(input("할 일 ID: ")), start_datetime=read_datetime("계획 시작"))
        show(service.save_manual_plan(value, identifier))


def menu(service):
    while True:
        print("\n1. 자연어 계획 요청  2. 이번 주 계획 제안  3. 할 일 직접 입력  4. 데이터 조회  0. 종료")
        if service.persistent:
            print("5. 고정 일정 관리  6. 선호도 설정  7. 수동 계획 관리  8. 할 일 수정/완료/삭제")
        choice = input("선택: ").strip()
        if choice == "0":
            return
        try:
            if choice == "1":
                ask_agent(service, input("요청: "))
            elif choice == "2":
                ask_agent(service, "남은 이번 주 계획을 제안해주세요.")
            elif choice == "3":
                title = input("할 일 이름: ")
                minutes = int(input("소요 시간(분, 1–120): "))
                priorities = {"1": "LOW", "2": "MEDIUM", "3": "HIGH"}
                priority = priorities.get(input("우선순위 1. 낮음 2. 보통 3. 높음: "))
                if priority is None:
                    raise ValueError("우선순위는 1, 2, 3 중 선택하세요.")
                count = int(input("주간 목표 횟수(1–7): "))
                show(service.add_task(title, minutes, priority, count).model_dump(mode="json"))
                print("데이터베이스에 저장했습니다." if service.persistent else "데모 세션에 추가했습니다. 종료하면 사라집니다.")
            elif choice == "4":
                show(data(service))
            elif service.persistent and choice in {"5", "6", "7", "8"}:
                {"5": edit_schedules, "6": edit_preferences, "7": edit_plans, "8": edit_tasks}[choice](service)
            else:
                print("메뉴 번호를 선택하세요.")
        except ValueError as exc:
            print(f"입력/계획 오류: {exc}")
        except OpenAIError as exc:
            print(f"API 요청 실패 ({type(exc).__name__}). API 키, 모델, 네트워크, 사용 한도를 확인하세요.")
        except SQLAlchemyError:
            print("DB 작업에 실패했습니다. 파일 접근 권한이나 다른 실행 중인 작업을 확인하세요.")


def main():
    parser = argparse.ArgumentParser(description="Phase 3 PlanningAgent: SQLite 저장, Agent는 초안만 제안")
    parser.add_argument("--request", help="자연어 요청을 한 번 실행")
    parser.add_argument("--show-data", action="store_true", help="API 호출 없이 데이터 조회")
    parser.add_argument("--trace", action="store_true", help="내용 대신 메타데이터와 사용량 로그 출력")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--demo", action="store_true", help="DB 없이 모의 데이터로 실행")
    modes.add_argument("--database", type=Path, help="사용할 SQLite 파일 경로")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO if args.trace else logging.WARNING, format="%(levelname)s %(message)s")
    database = None
    try:
        if args.demo:
            service = MockPlanningService()
        else:
            database = Database(args.database or Path(__file__).resolve().parents[1] / "data" / "planning.db")
            service = DatabasePlanningService(database)
        if args.show_data:
            show(data(service))
        elif args.request is not None:
            ask_agent(service, args.request)
        else:
            if database:
                print(f"저장 위치: {database.path}")
            menu(service)
    except (EOFError, KeyboardInterrupt):
        print("\n종료합니다.")
    except ValueError as exc:
        parser.exit(1, f"입력/설정 오류: {exc}\n")
    except OpenAIError as exc:
        parser.exit(1, f"API 요청 실패 ({type(exc).__name__}). 설정과 연결을 확인하세요.\n")
    except (SQLAlchemyError, OSError):
        parser.exit(1, "DB 또는 파일 접근에 실패했습니다. 경로와 권한을 확인하세요.\n")
    finally:
        if database:
            database.close()


if __name__ == "__main__":
    main()
