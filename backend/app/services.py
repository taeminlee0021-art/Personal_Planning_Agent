"""In-memory fixtures; candidate slots are authored examples, not a planning engine."""
from datetime import date, datetime, time, timedelta, timezone
from app.models import Proposal, Task

KST = timezone(timedelta(hours=9))


class MockPlanningService:
    def __init__(self, today: date | None = None):
        self.today = today or datetime.now(KST).date()
        self.monday = self.today - timedelta(days=self.today.weekday())
        self.tasks: list[Task] = []
        for title, duration, count in [("Exercise", 60, 3), ("Resume", 60, 2), ("AI Agent study", 120, 2)]:
            self.add_task(title, duration, "MEDIUM", count)
        self.schedules = []
        self.slots = []
        for day in range(7):
            current = self.monday + timedelta(days=day)
            if day < 5:
                self.schedules.append(self._event(f"work-{day}", "Work", current, 9, 18))
            if day == 3:
                self.schedules.append(self._event("dinner", "Thursday dinner", current, 19, 22))
            elif current > self.today:
                start = datetime.combine(current, time(20 if day < 5 else 10), KST)
                self.slots.append({"id": f"slot-{day}", "start_datetime": start.isoformat(),
                                   "end_datetime": (start + timedelta(minutes=120)).isoformat(),
                                   "capacity_minutes": 120})

    @staticmethod
    def _event(identifier, title, current, start, end):
        return {"id": identifier, "title": title, "description": "Mock fixture",
                "start_datetime": datetime.combine(current, time(start), KST).isoformat(),
                "end_datetime": datetime.combine(current, time(end), KST).isoformat(), "fixed": True}

    def add_task(self, title, minutes, priority="MEDIUM", count=1):
        now = datetime.now(KST)
        task = Task(id=len(self.tasks) + 1, title=title, estimated_minutes=minutes,
                    priority=priority, weekly_target_count=count, created_at=now, updated_at=now)
        self.tasks.append(task)
        return task

    def get_tasks(self):
        return [task.model_dump(mode="json") for task in self.tasks]

    def get_fixed_schedules(self):
        return self.schedules

    def get_preferences(self):
        return {"weekday_available_from": "19:00", "weekday_available_until": "22:00",
                "weekend_available_from": "09:00", "weekend_available_until": "22:00",
                "max_daily_planning_minutes": 120, "timezone": "Asia/Seoul"}

    def get_current_plan(self):
        return []

    def get_available_time_slots(self):
        return {"fixture_only": True, "today": str(self.today), "week_start": str(self.monday),
                "note": "Pre-authored examples for future days this week; not all available time. One task per slot.",
                "slots": self.slots}

    def render_proposal(self, proposal: Proposal):
        tasks = {task.id: task for task in self.tasks}
        slots = {slot["id"]: slot for slot in self.slots}
        seen, counts, blocks = set(), {}, []
        for item in proposal.assignments:
            if item.task_id not in tasks or item.slot_id not in slots or item.slot_id in seen:
                raise ValueError("Unknown task/slot or duplicate slot in proposal")
            task, slot = tasks[item.task_id], slots[item.slot_id]
            start = datetime.fromisoformat(slot["start_datetime"])
            end = start + timedelta(minutes=task.estimated_minutes)
            if task.status == "COMPLETED" or end > datetime.fromisoformat(slot["end_datetime"]):
                raise ValueError("Task cannot be assigned to this fixture slot")
            if task.due_date and start.date() > task.due_date:
                raise ValueError("Assignment exceeds task deadline")
            counts[task.id] = counts.get(task.id, 0) + 1
            if counts[task.id] > task.weekly_target_count:
                raise ValueError("Assignment exceeds weekly target")
            seen.add(item.slot_id)
            blocks.append({"task_id": task.id, "title": task.title,
                           "start_datetime": start.isoformat(), "end_datetime": end.isoformat()})
        return {"status": "PROPOSED_NOT_SAVED", "fixture_only": True,
                "explanation": proposal.explanation,
                "blocks": sorted(blocks, key=lambda block: block["start_datetime"]),
                "unallocated": [{"task_id": task.id, "remaining_count": task.weekly_target_count - counts.get(task.id, 0)}
                                for task in self.tasks if task.status != "COMPLETED" and task.weekly_target_count > counts.get(task.id, 0)]}
