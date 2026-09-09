# Personal Planning Agent

자연어 요청·메뉴 선택·직접 입력을 지원하는 개인 계획 Agent입니다.
현재 **Phase 4: FastAPI REST API**까지 구현했습니다. 웹 화면은 Phase 6에서 구현합니다.

## 설치 및 실행

Python 3.12 이상이 필요합니다. 이 PC에는 3.14가 설치되어 있습니다.
프로젝트 루트에서 실행하세요. 이미 가상환경이 있으면 첫 줄은 생략합니다.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./backend[dev]"
.\.venv\Scripts\python.exe -m app.cli
```

기본 저장 파일은 `backend/data/planning.db`입니다. 처음 실행하면 빈 데이터베이스와
기본 선호도만 생성하며, 샘플 할 일이나 일정을 실제 DB에 넣지 않습니다.
CLI를 종료해도 직접 입력한 데이터가 유지됩니다.

```powershell
# 저장된 데이터 조회 (API 호출 없음)
.\.venv\Scripts\python.exe -m app.cli --show-data

# 별도 SQLite 파일 사용
.\.venv\Scripts\python.exe -m app.cli --database ./backend/data/test.db

# DB를 사용하지 않는 이전 모의 데이터 모드
.\.venv\Scripts\python.exe -m app.cli --demo

# 오프라인 테스트
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

## FastAPI 서버 실행

프로젝트 루트에서 의존성을 갱신한 뒤 실행하세요. CLI와 같은 SQLite 파일을 사용합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -e "./backend[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

서버 실행 후 [API 문서](http://127.0.0.1:8000/docs)에서 요청을 시험할 수 있습니다.
이 화면은 개발용 API 문서이며 제품의 웹 화면은 Phase 6에서 구현합니다.
Ctrl+C로 서버를 종료합니다. 현재 인증이 없는 로컬 단일 사용자 모드이므로
127.0.0.1에 바인딩합니다. 공개 배포와 프론트엔드 CORS 설정은 아직 추가하지 않았습니다.

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| POST / GET | /api/tasks | 할 일 생성 / 목록 |
| GET / PUT / DELETE | /api/tasks/{id} | 조회 / 수정 / 삭제 |
| POST / GET | /api/schedules | 고정 일정 생성 / 목록 |
| PUT / DELETE | /api/schedules/{id} | 고정 일정 수정 / 삭제 |
| GET / PUT | /api/preferences | 선호도 조회 / 교체 |
| GET | /api/plans | 전체 저장 계획 조회 |
| GET | /api/plans/today | 한국 시간 기준 오늘 계획 |
| GET | /api/plans/week | 한국 시간 기준 이번 주 계획 |
| POST | /api/agent/messages | 저장되지 않는 Agent 초안 요청 |

계획의 직접 추가·수정·삭제는 기존 CLI에서 사용합니다. Agent 승인/거절 API와
승인 후 실행은 Phase 5 범위이며 아직 없습니다. 날짜·시간 요청은 ISO 8601 형식으로
시간대 오프셋을 포함해야 합니다. 예: `2026-09-10T19:00:00+09:00`.

할 일 생성 예시는 다음과 같습니다. API 키는 요청 본문이나 헤더에 넣지 않습니다.

```powershell
$taskBody = @{ title = "Exercise"; estimated_minutes = 60; weekly_target_count = 3 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/tasks -ContentType application/json -Body $taskBody
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/plans/week
```

Agent 요청 본문은 `{"message":"이번 주 계획을 세워주세요."}`입니다.
키와 모델은 서버의 backend/.env 또는 환경변수에서만 설정합니다.

PUT /tasks/{id}는 전달한 항목만 수정하며, `due_date: null`은 마감일을 지웁니다.
다른 필드의 null과 빈 수정 요청은 거부합니다. 새 할 일은 TODO 상태로 생성합니다.
PUT /preferences는 전체 교체이며 생략된 필드는 기본값으로 돌아갑니다.
응답 전용 `timezone` 필드는 선호도 PUT 본문에 포함하지 않습니다.

오류는 `{"error":{"code":"...","message":"..."}}` 형식입니다.

- 404: 항목 없음
- 409: 일정 충돌 또는 제약 위반
- 422: 입력 검증 실패
- 502: 외부 Agent 호출 실패 또는 유효한 초안 생성 실패
- 503: DB 사용 실패 또는 서버 OpenAI 설정 누락
- 500: 내부 오류

검증 오류에 원문 입력을 돌려주지 않으며, 외부 API 오류·SQL·예외 전문도 반환하거나
로그에 남기지 않습니다. 응답 모델로 반환 필드를 제한하고 Cache-Control: no-store를
설정합니다. 서버 모듈을 import할 때 DB나 API 클라이언트를 생성하지 않습니다.
DB 연결은 서버 시작 시 열고 종료 시 정리합니다.

검증: 전체 테스트 124개 통과 및 임시 DB/로컬 포트를 사용한 실제 Uvicorn HTTP 점검 완료.
현재 설치된 Starlette 테스트 클라이언트에서 httpx 및 AnyIO 사용 중단 예정 경고가
2개 발생합니다. 테스트 실패는 아니며 경고를 숨기거나 의존성을 임의로 변경하지 않았습니다.

참고: [FastAPI Lifespan](https://fastapi.tiangolo.com/advanced/events/),
[FastAPI 오류 처리](https://fastapi.tiangolo.com/tutorial/handling-errors/).

## CLI 메뉴

| 번호 | 기능 | 저장 여부 |
| --- | --- | --- |
| 1 | 자연어 계획 요청 | Agent 초안만 반환 |
| 2 | 이번 주 계획 제안 | Agent 초안만 반환 |
| 3 | 할 일 직접 추가 | 즉시 저장 |
| 4 | 할 일·이번 주 일정·선호도·계획·후보 시간 조회 | 조회 전용 |
| 5 | 고정 일정 추가·수정·삭제 | 직접 입력한 변경 저장 |
| 6 | 평일·주말 시간과 하루 한도 설정 | 검증 후 저장 |
| 7 | 수동 계획 추가·수정·삭제·완료 | 검증 후 저장 |
| 8 | 할 일 수정·완료·삭제 | 검증 후 저장 |
| 0 | 종료 | 기존 데이터 유지 |

수정/삭제 메뉴에서는 표시된 ID를 선택합니다. 날짜는 `2026-09-10 19:00`처럼 입력하면
한국 시간으로 해석하며, 명시적인 시간대 오프셋도 허용합니다.
할 일 수정은 항목 하나씩 적용하고, 마감일 항목에서 빈 값을 입력하면 마감일을 지웁니다.
선호도 편집의 빈 값은 기존 설정을 유지합니다.
데모 모드에서는 1–4번만 제공하며 변경은 세션에서만 유지됩니다.

수동 계획의 종료 시간은 선택한 할 일의 소요 시간으로 계산합니다.
Agent에는 조회 도구만 제공하므로 Agent가 직접 계획을 저장·이동·삭제할 수 없습니다.
Agent 초안의 승인·실행 기능은 Phase 5에서 추가합니다.

## OpenAI 설정과 키 보호

직접 입력·조회·저장·테스트에는 API 키가 필요하지 않습니다.
Agent 계획 요청만 OpenAI API를 호출하며 비용이 발생합니다.

`backend/.env`가 없다면 `backend/.env.example`을 복사한 뒤 파일에 직접 설정하세요.

```text
OPENAI_API_KEY=본인의 키
OPENAI_MODEL=계정에서 사용할 Responses API 모델 ID
```

키를 채팅이나 Git에 올리지 마세요. 키는 백엔드 환경변수에서만 읽으며,
DB·프론트엔드·Agent 프롬프트·응답·로그에 기록하지 않습니다.
이미 설정된 환경변수는 .env보다 우선합니다.

```powershell
.\.venv\Scripts\python.exe -m app.cli --request "남은 이번 주 계획을 세워주세요." --trace
```

trace는 요청 길이, 도구명, 결과 길이, 사용량, 오류 종류와 소요 시간을 기록합니다.
개인 입력과 도구 결과 전문을 기록하지 않습니다. 실제 유료 API 호출은 아직 검증하지
않았으며, 테스트는 모의 API 응답을 사용합니다.

## 저장 구조와 검증

- `backend/app/database.py`: SQLAlchemy Core 테이블, SQLite 연결, 트랜잭션, Repository.
- `backend/app/storage_service.py`: 할 일·일정·선호도·수동 계획 CRUD와 DB 기반 조회 도구 서비스.
- `backend/app/inputs.py`: 고정 일정과 수동 계획의 Pydantic 입력 검증.
- `backend/app/services.py`: DB와 데모가 공유하는 계획 스냅샷 및 초안 검증.
- `backend/app/planning.py`: 시간 계산, 가용시간 계산, 계획 제약 검증.
- `backend/app/models.py`: 할 일과 Agent 구조화 출력 모델.
- `backend/app/agent.py`, `tools.py`: 단일 PlanningAgent와 5개 허용된 조회 도구.
- `backend/app/cli.py`: 자연어·선택·직접 입력 인터페이스.
- `backend/tests/`: 계획 엔진, 도구 호출, SQLite 및 CLI 통합 테스트.

SQLAlchemy는 저장 계층을 계획 로직에서 분리하고, 트랜잭션과 향후 DB 전환을 지원하기
위해 추가했습니다. SQLite의 외래키를 활성화하며, 연결된 계획이 있는 할 일은 삭제를
거부합니다. 쓰기는 잠금을 얻은 뒤 현재 데이터를 읽고 검증하여 함께 커밋하며,
중간 실패 시 전체 변경을 롤백합니다. 시간은 UTC로 저장하고 한국 시간으로 표시합니다.

기존 계획과 겹치는 고정 일정, 기존 계획을 무효로 만드는 선호도 변경은 거부합니다.
계획이 연결된 할 일의 소요 시간·마감일·주간 횟수는 계획을 먼저 정리한 후 변경할 수
있습니다. 할 일 제목 수정은 기존 계획에 저장된 제목을 소급 변경하지 않습니다.

할 일의 PLANNED/TODO 상태는 남아 있는 미완료 계획과 맞춰 관리합니다.
계획 하나를 완료해도 반복 목표인 할 일 전체를 자동 완료하지는 않습니다.
할 일 자체를 COMPLETED로 표시하면 새 계획 대상에서 제외하며 기존 계획은 유지합니다.
기존 계획은 완료 여부와 관계없이 해당 주의 활동 횟수와 시간 한도에 포함합니다.

구현 참고:
[SQLAlchemy SQLite](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html),
[OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling).

## 계획 규칙과 현재 제한

시간대는 Asia/Seoul입니다. 선호 시간에서 고정 일정과 기존 계획을 제외하고,
오늘의 현재 시각 이후부터 후보를 계산합니다. 시간 범위는 시작 포함·종료 제외이므로
19–20시 활동 직후 20–21시 활동이 가능합니다.

고정 일정은 개인 계획 시간 한도에 포함하지 않고, 기존 계획은 포함합니다.
자정을 넘는 고정 일정은 처리하지만 선호 시간은 같은 날 안의 범위만 지원합니다.
서비스 입력의 시간대 없는 datetime은 거부하며, CLI만 명시적으로 한국 시간을 부여합니다.

Agent에는 각 빈 구간의 첫 정수 분 시각과 이후 30분 경계의 후보를 제공합니다.
후보는 서로 겹칠 수 있으므로 초안 전체를 다시 검증합니다. 모든 분 단위 배치를
탐색하지는 않습니다. 수동 계획은 30분 경계로 제한하지 않습니다.

할 일 소요 시간은 1–120분, 주간 횟수는 1–7회, Agent 초안은 최대 49개 활동입니다.
미배치 목표는 unallocated로 표시합니다. DB 모드는 조회 시 현재 주를 다시 계산합니다.
일정이 바뀌거나 시간이 지나 초안이 무효가 되면 재요청해야 합니다.

현재는 단일 사용자 로컬 CLI/API이며 DB 스키마 자동 마이그레이션, 승인 액션과 웹 화면은 없습니다. DB 스키마 변경이 필요하면 별도 마이그레이션 작업이
필요합니다. 백업은 CLI와 API 서버를 모두 종료한 후 SQLite 파일을 복사하세요.

## Git과 다음 단계

원격: [Personal_Planning_Agent](https://github.com/taeminlee0021-art/Personal_Planning_Agent).
기본 브랜치는 main이며 자동 push는 하지 않습니다.
.env, 가상환경, 로그, SQLite 파일과 임시 저널 파일은 Git에서 제외합니다.

Phase 1 CLI → Phase 2 계획 엔진 → Phase 3 DB → **Phase 4 FastAPI** →
Phase 5 승인 → Phase 6 반응형 웹 → Phase 7 배포.
각 단계 완료 후 AGENTS.md를 갱신하고 다음 지시를 기다립니다.
