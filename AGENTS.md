# Personal Planning Agent

## Project Goal

Build a personal AI planning web application that helps the user organize tasks,
fixed schedules, and personal goals into realistic daily and weekly plans.

This project is not intended to be a simple Todo application.

The main goal is to build a practical AI Agent while learning and demonstrating:

- LLM tool calling
- Agent planning
- State management
- Structured outputs
- Human-in-the-loop approval
- Agent tracing
- External API integration
- Separation between deterministic application logic and LLM reasoning

The application must be usable from both desktop and mobile browsers.

There will be NO native iPhone application.

The web UI must be responsive and comfortable to use on:

- Desktop browsers
- Mac browsers
- iPhone Safari
- Android mobile browsers


# Core User Experience

The user should be able to describe goals naturally, select existing items, or
enter structured fields directly. Natural language is optional, not mandatory.
All input methods share application validation and services. Ordinary data entry
must not require an LLM call. Phase 1 supports CLI menu selection and in-memory
task entry; persistent task/schedule/preference forms belong to later phases.

Example:

User:

"I want to exercise 3 times this week,
work on my resume twice,
and spend 4 hours studying AI Agents.
I already have plans on Thursday evening."

The system should:

1. Read existing tasks
2. Read fixed schedules
3. Read user preferences
4. Find available time slots
5. Consider priorities and deadlines
6. Generate a realistic weekly plan
7. Present the proposed plan to the user
8. Save or modify plans only after appropriate approval


The application must also support replanning.

Example:

User:

"I couldn't exercise today."

The Agent should:

1. Inspect today's plan
2. Identify the unfinished task
3. Inspect the remaining week's schedule
4. Find appropriate alternative time slots
5. Propose a change
6. Wait for user approval
7. Apply the change only after approval


# Technology Stack

## Backend

Use:

- Python 3.12+
- FastAPI
- OpenAI API
- OpenAI Agents SDK where appropriate
- SQLAlchemy
- Pydantic
- SQLite for the initial version
- pytest

The backend owns all Agent logic.

Never expose the OpenAI API key to the frontend.


## Frontend

Use:

- Next.js
- TypeScript
- React
- Tailwind CSS

The UI must be responsive from the beginning.

Use mobile-first responsive design.

Primary target widths:

- Mobile: 375px+
- Tablet: 768px+
- Desktop: 1024px+

Do not create a separate mobile application.

The same web application must work well on iPhone Safari.


# Repository Structure

Prefer a simple monorepo structure.

Example:

personal-planning-agent/

  AGENTS.md
  README.md

  backend/
    app/
      main.py
      api/
      agents/
      models/
      schemas/
      services/
      repositories/
      tools/
      core/
    tests/
    requirements.txt
    .env.example

  frontend/
    app/
    components/
    lib/
    types/
    package.json

Avoid unnecessary complexity.


# Product Scope

The initial MVP should contain only the following major features.

1. Task Management
2. Fixed Schedule Management
3. User Planning Preferences
4. AI Planning Agent
5. Weekly Plan
6. Replanning
7. Human Approval
8. Responsive Web UI


# Task Management

A Task represents something the user wants to accomplish.

Examples:

- Exercise
- Write resume
- Study AI Agents
- Study real estate
- Practice piano


Minimum Task fields:

- id
- title
- description
- estimated_minutes
- priority
- due_date
- status
- category
- weekly_target_count
- created_at
- updated_at


Priority values:

- LOW
- MEDIUM
- HIGH


Status values:

- TODO
- PLANNED
- COMPLETED


The user must be able to:

- Create a task
- View tasks
- Edit a task
- Mark a task as completed
- Delete a task


# Fixed Schedules

Fixed schedules represent events that the planning Agent must not move.

Examples:

- Work
- Hospital appointment
- Meeting
- Dinner appointment
- Family event


Fields:

- id
- title
- start_datetime
- end_datetime
- description
- fixed


The planning engine must never place generated plans on top of fixed schedules.


# User Preferences

Store explicit planning preferences in the database.

Do not use LLM memory for information that can be represented deterministically.

Initial preferences:

- weekday_available_from
- weekday_available_until
- weekend_available_from
- weekend_available_until
- max_daily_planning_minutes


Possible future preferences may include:

- preferred exercise time
- preferred study time
- minimum break between activities
- preferred planning intensity

Do not implement future preferences until needed.


# Planning Model

A generated plan represents an actual scheduled block.

Suggested fields:

- id
- task_id
- title
- start_datetime
- end_datetime
- status
- source
- created_at
- updated_at


Possible source values:

- MANUAL
- AGENT


# Planning Agent

Start with ONE Agent only.

Do not implement a multi-agent architecture in the MVP.

The initial Agent should be called:

PlanningAgent


The PlanningAgent is responsible for:

- Understanding natural-language planning requests
- Determining which information is required
- Selecting appropriate tools
- Evaluating priorities
- Creating planning strategies
- Explaining proposed changes
- Requesting approval when necessary


# Agent Tools

Start with a minimal set of tools.

Read tools:

- get_tasks
- get_fixed_schedules
- get_preferences
- get_current_plan
- get_available_time_slots


Write/action tools:

- create_plan
- update_plan
- delete_plan
- mark_task_completed


Do not expose raw database access directly to the Agent.

Tools should call normal application services.


# Important Architecture Principle

Do NOT use the LLM for deterministic calculations.

Use normal Python code for:

- Date calculations
- Time arithmetic
- Schedule overlap detection
- Available-time calculation
- Database CRUD
- Input validation
- Constraint validation
- Duration calculations


Use the LLM primarily for:

- Understanding user intent
- Choosing tools
- Prioritization decisions
- Planning strategy
- Resolving ambiguous natural-language requests
- Explaining plans
- Deciding when replanning may be useful


General rule:

LLM = reasoning and decisions

Code = calculation, validation, and execution


# Planning Flow

Example:

User asks:

"Plan my week."


Expected Agent flow:

1. get_tasks()
2. get_fixed_schedules()
3. get_preferences()
4. get_current_plan()
5. calculate available time through application logic
6. decide how tasks should be distributed
7. create a proposed plan
8. present the result


The Agent must not blindly generate arbitrary datetime values without checking constraints.


# Replanning Flow

Example:

User:

"I couldn't do my resume work today."


Expected flow:

1. Identify today's relevant planned item
2. Inspect task status
3. Check remaining available time
4. Consider deadline and priority
5. Generate an alternative
6. Present the proposed change
7. Wait for approval
8. Apply the change


# Human-in-the-Loop

The Agent must not silently make significant changes to existing schedules.

Read-only operations do not require approval.

Creating a completely new plan may be presented as a proposal before saving.

Changes to existing plans should normally require approval.


Examples requiring approval:

- Moving an existing plan
- Deleting an existing plan
- Replacing several planned activities
- Large-scale weekly replanning


Example UI:

AI:

"Move Wednesday's exercise session to Friday at 8 PM?"

Buttons:

[Apply]
[Cancel]


Only Apply should execute the write operation.


# Agent Action Model

Consider representing pending Agent actions explicitly.

Example:

PendingAction

- id
- action_type
- payload
- explanation
- status
- created_at


Status:

- PENDING
- APPROVED
- REJECTED
- EXECUTED


This allows the UI to display Agent proposals before execution.


# REST API

Keep APIs simple.

Suggested initial endpoints:


## Tasks

POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/{id}
PUT    /api/tasks/{id}
DELETE /api/tasks/{id}


## Schedules

POST   /api/schedules
GET    /api/schedules
PUT    /api/schedules/{id}
DELETE /api/schedules/{id}


## Preferences

GET    /api/preferences
PUT    /api/preferences


## Plans

GET    /api/plans
GET    /api/plans/today
GET    /api/plans/week


## Agent

POST   /api/agent/messages


## Agent Actions

POST /api/agent/actions/{action_id}/approve
POST /api/agent/actions/{action_id}/reject


Do not implement excessive endpoints before they are required.


# Web UI

The application should initially contain four main areas.


## 1. Today

Show today's planned activities.

Example:

Today

09:00  Work
20:00  Exercise
21:30  AI Agent Study


The layout must work well on iPhone-width screens.


## 2. Tasks

Show current goals and progress.

Example:

Exercise
2 / 3 this week

Resume
1 / 2 this week

AI Agent Study
2h / 4h


## 3. Weekly Plan

Show the current weekly schedule.

On desktop:

A weekly calendar-style layout may be used.

On mobile:

Do NOT force a desktop calendar grid into the screen.

Prefer:

- Vertical day cards
- Day tabs
- Agenda view

The mobile layout must remain readable without horizontal scrolling.


## 4. Agent

Provide a chat-like interface.

Example:

User:

"This week feels too busy.
Make it a little lighter."

Agent:

"Friday currently contains three personal activities.
I recommend moving exercise to Saturday morning.

Apply this change?"

[Apply]
[Cancel]


# Responsive Design Requirements

Responsive behavior is a core requirement, not a later enhancement.

Every new frontend component must be tested mentally and visually for both:

- Desktop
- Mobile


For mobile:

- Avoid tiny text
- Avoid horizontal scrolling
- Use touch-friendly controls
- Keep primary buttons easy to tap
- Stack panels vertically
- Use bottom navigation if appropriate
- Avoid complex desktop tables


Recommended mobile navigation:

Today
Tasks
Week
Agent


Desktop navigation may use a sidebar.


# Authentication

The MVP is intended for a single personal user.

Do NOT build a complex authentication system initially.

For local development, authentication may be omitted.

Authentication can be introduced later when the application is deployed publicly.


# Database

Start with SQLite.

Use SQLAlchemy so migration to PostgreSQL remains straightforward.

Do not introduce PostgreSQL, Redis, or cloud databases during the initial phase unless required.


# Security

Mandatory rules:

- Never commit API keys
- Never place API keys in frontend code
- Never expose OpenAI credentials through browser requests
- Use environment variables
- Add .env to .gitignore
- Provide .env.example without secrets
- Validate incoming API data with Pydantic
- Do not trust Agent-generated arguments without backend validation


# Observability

Agent behavior must be inspectable during development.

Log or trace:

- User request
- Agent invocation
- Selected tool
- Tool arguments
- Tool result
- Agent final response
- Errors
- Execution duration

Where practical, also capture:

- model
- input token usage
- output token usage

Avoid logging sensitive data unnecessarily.


# Cost Awareness

This is a personal project using paid OpenAI API calls.

Avoid unnecessary LLM calls.

Do not ask the LLM to perform operations that normal code can perform.

Keep prompts reasonably small.

Do not send the complete database history to the model on every request.

Record token usage where practical so cost can later be evaluated.


# Testing

Tests are required for important deterministic behavior.


## Unit Tests

At minimum test:

- Task validation
- Time overlap detection
- Available-time calculation
- Plan constraint validation
- Fixed-schedule protection


## Integration Tests

Test:

- Database CRUD
- Tool execution
- FastAPI endpoints


## Agent Scenario Tests

Create repeatable scenarios.


Scenario 1:

Given:

- Exercise three times
- Several fixed schedules

The Agent should generate a plan without schedule conflicts.


Scenario 2:

A planned activity is missed.

The Agent should propose a valid alternative time.


Scenario 3:

The Agent proposes a conflicting time.

Backend validation must reject it.


Scenario 4:

The Agent proposes moving an existing plan.

The database must remain unchanged until user approval.


# Development Phases

Do not build the entire product at once.


## Phase 1 - Agent CLI Prototype

Build only:

- Python project
- OpenAI configuration
- PlanningAgent
- Mock tasks
- Mock schedules
- Mock preferences
- Read tools
- CLI interaction

Goal:

The user can type:

"Plan my week."

The Agent calls tools and produces a reasonable plan.

No database.

No FastAPI.

No frontend.


## Phase 2 - Core Planning Engine

Add deterministic planning utilities:

- Time range representation
- Overlap detection
- Available-time calculation
- Plan validation

Add unit tests.


## Phase 3 - Database

Add:

- SQLite
- SQLAlchemy
- Task persistence
- Schedule persistence
- Preferences
- Plans

Replace mock tools with database-backed services.


## Phase 4 - FastAPI

Expose backend functionality through REST APIs.

Add:

- API validation
- Exception handling
- Integration tests


## Phase 5 - Human-in-the-Loop

Implement:

- Pending Agent actions
- Approval
- Rejection
- Execution after approval


## Phase 6 - Web Frontend

Create Next.js responsive frontend.

Implement:

- Today
- Tasks
- Weekly Plan
- Agent Chat


The frontend must be usable on iPhone Safari from the first usable version.


## Phase 7 - Deployment

Only after local MVP works correctly.

Consider deploying:

Frontend:
- Vercel or similar

Backend:
- appropriate Python hosting

Database:
- migrate from SQLite if required

Do not prematurely optimize deployment.


# Explicitly Out of Scope for MVP

Do NOT implement the following unless specifically requested:

- Native iPhone application
- Swift
- SwiftUI
- Multi-Agent architecture
- Vector database
- RAG
- Voice interaction
- Location-based planning
- Google Calendar integration
- Apple Calendar integration
- Outlook Calendar integration
- Email integration
- Push notifications
- Complex authentication
- Multiple users
- Social login
- Investment management
- Asset management
- Recommendation engine
- Long-term autonomous behavior


These may be added later.


# Coding Principles

Codex must follow these rules:

1. Read this AGENTS.md before making architectural decisions.

2. Inspect the existing codebase before modifying files.

3. Work phase-by-phase.

4. Do not automatically continue to later phases.

5. Prefer simple solutions.

6. Avoid premature abstraction.

7. Avoid unnecessary dependencies.

8. Explain why a new major dependency is required before adding it.

9. Keep Agent logic separate from business logic.

10. Keep database access out of Agent prompts.

11. Validate every Agent-generated action before execution.

12. Write tests for deterministic planning logic.

13. Never expose secrets.

14. Do not implement features listed as out of scope.

15. Keep the frontend responsive.

16. Mobile usability is a required acceptance criterion.

17. After each task:
    - run relevant tests
    - report changed files
    - report test results
    - mention unresolved issues


# First Codex Task

If the repository is empty, do NOT build the whole application.

Start with Phase 1 only.

Perform:

1. Initialize the backend Python project.
2. Create a clean minimal project structure.
3. Configure OpenAI API access through environment variables.
4. Add .env.example.
5. Add .gitignore.
6. Implement PlanningAgent.
7. Create mock Task, Schedule, and Preference data.
8. Implement minimal read tools.
9. Create a CLI entry point.
10. Allow a user to type a natural-language planning request.
11. Let the Agent inspect mock data through tools.
12. Return a proposed weekly plan.
13. Add minimal tests where appropriate.
14. Add setup and run instructions to README.md.

Do not start Phase 2.

When Phase 1 is complete:

- run the tests
- explain the architecture
- list created files
- show how to run the application
- explain how the Agent and tool calls work
- stop and wait for the user's next instruction


# Project Updates

Keep AGENTS.md current after each task: accepted requirements, architecture
choices, current phase, verification results, and unresolved work. Never record
secrets or claim planned work is already implemented.

## 2026-09-09 - Phase 1 implementation

- User requirement: support natural language, selection, and direct field entry.
- Local Git initialized on main; origin points to
  https://github.com/taeminlee0021-art/Personal_Planning_Agent.git.
  Remote was empty when inspected. Initial local commit: 1b7b277.
  No push has been performed.
- Implemented a single PlanningAgent using the official OpenAI Python SDK
  Responses API; five allowlisted read tools delegate to MockPlanningService.
- CLI supports free text, a preset planning request, direct task entry,
  and mock data inspection. Direct entry and inspection make no API calls.
- Data is session-only. Proposals are structured task/slot assignments with
  backend reference, duplicate, deadline and target checks; nothing is saved.
- Phase 1 slots are authored mock examples for days after today within the
  current Asia/Seoul week, one task per slot. Thursday dinner is excluded.
  Slot fixtures are deliberately limited and may not accommodate all goals.
  Duration is capped at 120 minutes for this prototype. General availability
  and overlap engines remain Phase 2; do not implement them automatically.
- Environment variables configure API key and model. No model is silently chosen.
- Metadata-only trace logs show request length, tool names, empty arguments,
  result sizes, response counts, usage and duration. Raw personal content is omitted.
- Dependencies: openai (API), pydantic (validation), python-dotenv (local config),
  pytest (tests). Agents SDK is deferred while a small explicit loop is sufficient.
- Source files: backend/app/{cli,agent,models,services,tools}.py, package initializer,
  backend/pyproject.toml, backend/.env.example, backend/tests/test_planning.py,
  root .gitignore and README.md.
- Verification: 19 offline tests passed with Python 3.14.5.
  CLI --show-data and Git ignore checks passed; staged whitespace check passed.
  Real paid API invocation has not been tested.
- Environment: sandbox Git creation caused helper refresh errors and differing
  ownership; subsequent work used approved host execution with per-command
  Git safe.directory restricted to this project. A persistent safe.directory
  entry now trusts only this project path for normal Git use. Host Python defaults to 3.10;
  project virtual environment explicitly uses installed Python 3.14.5.
- Stop after Phase 1; Phase 2 requires the user's next instruction.


## 2026-09-09 - Phase 2 core planning engine

The user authorized the next phase after Phase 1. This entry supersedes Phase 1
fixture-slot limitations; earlier entries remain historical records.

- Added backend/app/planning.py with immutable, timezone-aware half-open TimeRange,
  overlap detection, busy-range subtraction, validated planning preferences,
  daily budget accounting, available intervals, candidate generation and full
  additive plan validation. No new dependencies.
- All dates normalize to Asia/Seoul (+09:00). Naive datetimes and invalid or
  overnight preference windows are rejected. Fixed events can cross midnight.
  Touching activities are allowed. Existing cross-midnight plans consume each
  day's proportional budget. Fixed schedules occupy time but do not consume
  personal planning minutes.
- Replaced authored slots with calculated candidates excluding fixed events and
  existing plans. Today's remaining time is included. Candidate starts use the
  first whole minute of each free interval, then 30-minute clock boundaries.
  This limits model context; it is not exhaustive minute-by-minute scheduling.
- Candidates are alternatives and may overlap. Backend revalidates the complete
  proposal against current data and time, availability hours, fixed schedules,
  existing/proposed overlaps, duration, deadlines, weekly targets and daily limit.
  Existing plans count toward weekly targets and daily minutes.
- Data remains in memory, with a frozen week per CLI session. Restart a session
  after the week changes. No database, REST API, approval writes, or frontend added.
  Task duration remains 1-120 minutes in the CLI; proposals allow up to 49 blocks.
- API key handling is unchanged: backend environment only, .env ignored, no key
  in prompts, output or application logs. No real paid API calls were performed.
- Updated service integration, Agent instructions, CLI phase label, existing
  tests and README. Added backend/tests/test_engine.py.
- Verification: 54 offline tests passed on Python 3.14.5, including time boundary,
  timezone, overlapping/nested busy ranges, current-day availability, weekend,
  fixed schedule protection, existing-plan budget/target use, stale proposals,
  no writes before approval, and direct entry without API calls.
- Phase 2 complete after final verification. Do not start Phase 3 automatically.
