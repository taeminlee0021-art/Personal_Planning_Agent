# Personal Planning Agent

자연어 요청, 메뉴 선택, 직접 입력을 함께 지원하는 개인 계획 Agent 프로젝트입니다.
현재 구현은 **Phase 2 CLI 프로토타입**입니다. DB, FastAPI, 웹 UI는 아직 없습니다.

## 설치 및 실행 (PowerShell)

Python 3.12 이상이 필요합니다. 저장소 루트에서 실행하세요.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./backend[dev]"
Copy-Item backend/.env.example backend/.env
```

이미 `backend/.env`가 있다면 복사하지 마세요.
이 파일에 `OPENAI_API_KEY`와 계정에서 사용할 수 있는 Responses API 모델 ID인
`OPENAI_MODEL`을 직접 설정하세요. 키를 Git이나 채팅에 올리지 마세요.
환경변수가 이미 설정되어 있으면 .env보다 우선합니다.

```powershell
.\.venv\Scripts\python.exe -m app.cli
.\.venv\Scripts\python.exe -m app.cli --show-data
.\.venv\Scripts\python.exe -m app.cli --request "남은 이번 주 계획을 세워주세요." --trace
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

메뉴 1은 자연어 요청, 2는 정해진 주간 계획 요청, 3은 할 일 직접 입력,
4는 모의 데이터 조회, 0은 종료입니다. 직접 입력과 조회는 API 키 없이 사용할 수
있으며 LLM 호출도 없습니다. 직접 입력한 할 일은 현재 프로세스에서만 유지됩니다.
계획 요청은 실제 OpenAI API를 사용하며 비용이 발생합니다.

## 구조와 도구 호출

- `backend/app/cli.py`: 입력 방법 선택, 필드 입력, 환경 설정, 결과 출력.
- `backend/app/models.py`: Pydantic 입력 및 구조화된 Agent 출력 모델.
- `backend/app/planning.py`: Deterministic time calculations and constraint validation.
- `backend/app/services.py`: 메모리의 모의 데이터와 초안 검증·표시.
- `backend/app/tools.py`: 허용된 조회 도구만 서비스로 전달.
- `backend/app/agent.py`: 단일 PlanningAgent와 최대 8회 Responses API 호출 루프.
- `backend/tests/test_planning.py`: 실제 API를 사용하지 않는 반복 가능한 테스트.

Agent는 get_tasks, get_fixed_schedules, get_preferences, get_current_plan,
get_available_time_slots를 호출해 정보를 읽고, 반환된 task_id와 slot_id로 초안을
제안합니다. Python이 참조와 중복, 마감일, 목표 횟수 등을 검증하고 실제 시간 값을
만듭니다. 쓰기 도구가 없으며 모든 결과는 PROPOSED_NOT_SAVED 상태입니다.

공식 OpenAI Python SDK는 API와 도구 호출을 위해, Pydantic은 데이터 검증을 위해,
python-dotenv는 로컬 설정을 위해 사용합니다. pytest는 테스트 전용입니다.
Agents SDK는 현재의 작은 루프에 꼭 필요하지 않아 아직 추가하지 않았습니다.
구현 참고: [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Phase 2 계획 엔진과 현재 제한

시간대는 Asia/Seoul입니다. Python이 사용자 선호 시간에서 고정 일정과 기존 계획을
제외해 빈 구간을 계산합니다. 오늘은 현재 시각 이후만 사용하고, 주말 선호 시간도
적용합니다. 고정 일정은 시간을 차지하지만 개인 활동의 일일 계획 한도에는 포함하지
않으며, 기존 계획은 한도와 주간 목표 횟수에 포함합니다.

시간 범위는 시작 포함·종료 제외입니다. 19–20시 활동 직후 20–21시 활동이 가능합니다.
시간대 없는 datetime과 시작이 종료보다 늦거나 같은 범위는 거부합니다.
자정을 넘는 고정 일정도 처리하지만, 사용자 선호 시간은 같은 날 안의 범위만 지원합니다.

Agent에는 각 빈 구간의 첫 정수 분 시각과 이후 30분 경계의 시작 후보를 제공합니다.
후보끼리는 겹칠 수 있으므로 선택된 계획 전체를 다시 검증합니다. 시작 후보를 제한하는
것은 모델 입력량을 줄이기 위한 것으로, 모든 분 단위 배치를 탐색하지는 않습니다.
일정 변경이나 시간 경과로 후보가 무효가 되면 초안을 거부하며 재요청해야 합니다.

직접 입력 시간은 현재 1–120분이고 초안은 최대 49개 활동입니다. 배치하지 못한 목표는
unallocated에 표시합니다. 데이터는 여전히 모의 데이터이며, 저장·이동·삭제 기능은
없습니다. 고정 일정·선호도 편집 폼과 웹 화면은 이후 단계에서 구현합니다.
CLI의 대상 주는 실행 시 고정되므로 주가 바뀌면 재실행하세요.

--trace는 요청 길이, 도구명, 결과 길이, 사용량, 오류 종류, 소요 시간을 기록합니다.
개인정보 보호를 위해 원문 요청과 도구 결과, 최종 응답 전문은 로그에 기록하지 않습니다.
API 키는 백엔드 환경변수에서만 읽으며 프론트엔드·응답·로그에 노출하지 않습니다.
실제 API 호출은 아직 검증하지 않았고, 테스트는 모의 응답으로 실행합니다.

## Git

원격 저장소: [Personal_Planning_Agent](https://github.com/taeminlee0021-art/Personal_Planning_Agent).
로컬 기본 브랜치는 main입니다. 원격 연결과 업로드는 별도이며 현재 업로드 여부는
AGENTS.md의 작업 기록을 확인하세요. .env, 가상환경, 로그 및 DB는 Git에서 제외합니다.

## 개발 순서

Phase 1 CLI → Phase 2 계획 엔진 → Phase 3 DB → Phase 4 API →
Phase 5 승인 → Phase 6 반응형 웹 → Phase 7 배포.
각 단계가 끝나면 테스트와 작업 기록을 갱신하고 다음 지시를 기다립니다.
