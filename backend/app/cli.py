import argparse
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI, OpenAIError
from app.agent import PlanningAgent
from app.services import MockPlanningService


def show(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def ask_agent(service, request):
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    key, model = os.getenv("OPENAI_API_KEY", "").strip(), os.getenv("OPENAI_MODEL", "").strip()
    if not key or not model:
        raise ValueError("backend/.env에 OPENAI_API_KEY와 OPENAI_MODEL을 설정하세요.")
    with OpenAI(api_key=key, timeout=60, max_retries=0) as client:
        show(PlanningAgent(client, model, service).run(request))


def menu(service):
    while True:
        print("\n1. 자연어 계획 요청  2. 이번 주 계획 제안  3. 할 일 직접 입력  4. 모의 데이터 조회  0. 종료")
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
                print("현재 세션에 추가했습니다. 종료하면 사라집니다.")
            elif choice == "4":
                show({"tasks": service.get_tasks(), "schedules": service.get_fixed_schedules(),
                      "preferences": service.get_preferences(), "slots": service.get_available_time_slots()})
            else:
                print("메뉴 번호를 선택하세요.")
        except ValueError as exc:
            print(f"입력/계획 오류: {exc}")
        except OpenAIError as exc:
            print(f"API 요청 실패 ({type(exc).__name__}). API 키, 모델, 네트워크, 사용 한도를 확인하세요.")


def main():
    parser = argparse.ArgumentParser(description="Phase 2 PlanningAgent: 저장되지 않는 모의 계획")
    parser.add_argument("--request", help="자연어 요청을 한 번 실행")
    parser.add_argument("--show-data", action="store_true", help="API 호출 없이 모의 데이터 조회")
    parser.add_argument("--trace", action="store_true", help="내용 대신 메타데이터와 사용량 로그 출력")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO if args.trace else logging.WARNING, format="%(levelname)s %(message)s")
    service = MockPlanningService()
    try:
        if args.show_data:
            show({"tasks": service.get_tasks(), "schedules": service.get_fixed_schedules(),
                  "preferences": service.get_preferences(), "slots": service.get_available_time_slots()})
        elif args.request is not None:
            ask_agent(service, args.request)
        else:
            menu(service)
    except (EOFError, KeyboardInterrupt):
        print("\n종료합니다.")
    except ValueError as exc:
        parser.exit(1, f"입력/설정 오류: {exc}\n")
    except OpenAIError as exc:
        parser.exit(1, f"API 요청 실패 ({type(exc).__name__}). 설정과 연결을 확인하세요.\n")


if __name__ == "__main__":
    main()
