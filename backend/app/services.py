"""In-memory data backed by the deterministic Phase 2 planning engine."""
from datetime import date, datetime, time, timedelta

from app.models import Proposal, Task
from app.planning import KST, PlanBlock, Preferences, TimeRange, aware, candidate_slots, validate_plan


class PlanningSnapshot:
    persistent = False

    def __init__(self, *, tasks, schedules, preferences, current_plan, now=None, mock_data=False):
        self._now = aware(now) if now is not None else None
        self.today = self.current_time().date()
        self.monday = self.today - timedelta(days=self.today.weekday())
        self.tasks, self.schedules = tasks, schedules
        self.preferences, self.current_plan = preferences, current_plan
        self.mock_data = mock_data

    def current_time(self):
        return self._now if self._now is not None else datetime.now(KST)

    @staticmethod
    def _event(identifier, title, current, start, end):
        return {"id": identifier, "title": title, "description": "Mock fixture",
                "start_datetime": datetime.combine(current, time(start), KST).isoformat(),
                "end_datetime": datetime.combine(current, time(end), KST).isoformat(), "fixed": True}

    def fixed_ranges(self):
        return [TimeRange(datetime.fromisoformat(event["start_datetime"]),
                          datetime.fromisoformat(event["end_datetime"])) for event in self.schedules]

    def add_task(self, title, minutes, priority="MEDIUM", count=1):
        now = self.current_time()
        task = Task(id=len(self.tasks) + 1, title=title, estimated_minutes=minutes,
                    priority=priority, weekly_target_count=count, created_at=now, updated_at=now)
        self.tasks.append(task)
        return task

    def get_tasks(self):
        return [task.model_dump(mode="json") for task in self.tasks]

    def get_fixed_schedules(self):
        return self.schedules

    def get_preferences(self):
        return {**self.preferences.model_dump(mode="json"), "timezone": "Asia/Seoul"}

    def get_current_plan(self):
        return [{"task_id": block.task_id, "start_datetime": block.time.start.isoformat(),
                 "end_datetime": block.time.end.isoformat()} for block in self.current_plan]

    @property
    def slots(self):
        return candidate_slots(self.monday, self.current_time(), self.preferences,
                               self.fixed_ranges(), self.current_plan)

    def get_available_time_slots(self):
        return {"fixture_only": False, "mock_data": self.mock_data, "today": str(self.current_time().date()),
                "week_start": str(self.monday),
                "note": "Calculated alternative starts. Candidates may overlap; the complete proposal is validated.",
                "slots": self.slots}

    def render_proposal(self, proposal: Proposal):
        if proposal.changes:
            raise ValueError("Changes to existing plans require the database service")
        tasks = {task.id: task for task in self.tasks}
        now = self.current_time()
        slots = {slot["id"]: slot for slot in candidate_slots(
            self.monday, now, self.preferences, self.fixed_ranges(), self.current_plan)}
        blocks = []
        for item in proposal.assignments:
            if item.task_id not in tasks or item.slot_id not in slots:
                raise ValueError("Unknown or stale task/slot in proposal")
            start = datetime.fromisoformat(slots[item.slot_id]["start_datetime"])
            blocks.append(PlanBlock(item.task_id, TimeRange(
                start, start + timedelta(minutes=tasks[item.task_id].estimated_minutes))))
        validate_plan(blocks, self.tasks, self.monday, now, self.preferences,
                      self.fixed_ranges(), self.current_plan)
        counts = {}
        for block in self.current_plan + blocks:
            if self.monday <= block.time.start.date() < self.monday + timedelta(days=7):
                counts[block.task_id] = counts.get(block.task_id, 0) + 1
        return {"status": "PROPOSED_NOT_SAVED", "fixture_only": False, "mock_data": self.mock_data,
                "explanation": proposal.explanation,
                "blocks": [{"task_id": block.task_id, "title": tasks[block.task_id].title,
                            "start_datetime": block.time.start.isoformat(), "end_datetime": block.time.end.isoformat()}
                           for block in sorted(blocks, key=lambda block: block.time.start)],
                "unallocated": [{"task_id": task.id, "remaining_count": task.weekly_target_count - counts.get(task.id, 0)}
                                for task in self.tasks if task.status != "COMPLETED" and task.weekly_target_count > counts.get(task.id, 0)]}


class MockPlanningService(PlanningSnapshot):
    def __init__(self, today=None, *, now=None):
        clock = now if now is not None else (datetime.combine(today, time(), KST) if today is not None else None)
        super().__init__(tasks=[], schedules=[], preferences=Preferences(), current_plan=[], now=clock, mock_data=True)
        for title, duration, count in [("Exercise", 60, 3), ("Resume", 60, 2), ("AI Agent study", 120, 2)]:
            self.add_task(title, duration, "MEDIUM", count)
        for day in range(5):
            current = self.monday + timedelta(days=day)
            self.schedules.append(self._event(f"work-{day}", "Work", current, 9, 18))
            if day == 3:
                self.schedules.append(self._event("dinner", "Thursday dinner", current, 19, 22))
