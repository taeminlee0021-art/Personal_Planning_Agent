"""Transactional application services. Agent reads never perform plan writes."""
from datetime import datetime, time, timedelta

from app import database as db
from app.errors import ConflictError
from app.inputs import BodySettingsInput, ManualPlanInput, MealEntryInput, RecurringTaskInput, ScheduleInput, TodayItemInput, WeightRecordInput
from app.diet import DietAnalysis
from app.models import Proposal, Task
from app.planning import KST, PlanBlock, Preferences, TimeRange, aware, daily_minutes, validate_plan
from app.services import PlanningSnapshot


def json_row(row):
    return {key: aware(value).isoformat() if isinstance(value, datetime) else
            value.isoformat() if hasattr(value, "isoformat") else value for key, value in row.items()}


def block(row):
    return PlanBlock(row["task_id"], TimeRange(row["start_datetime"], row["end_datetime"]))


def today_completion_target(title):
    compact = "".join(title.split())
    return 4 if "물" in compact and "마시" in compact else 1


def today_json_row(row):
    value = json_row(row)
    if value.get("task_id") is not None:
        value["source"] = "TASK"
    return value


class DatabasePlanningService:
    persistent = True

    def __init__(self, database: db.Database, *, now=None):
        self.database = database
        self._now = aware(now) if now is not None else None
        with database.transaction(write=True) as repository:
            if not repository.list(db.preferences):
                repository.insert(db.preferences, {"id": 1, **Preferences().model_dump()})
            if not repository.list(db.body_settings):
                repository.insert(db.body_settings, {"id": 1, "height_cm": 176.0})

    def current_time(self):
        return self._now if self._now is not None else datetime.now(KST)

    def _snapshot(self, repository):
        now = self.current_time()
        monday = now.date() - timedelta(days=now.weekday())
        start = datetime.combine(monday, time(), KST)
        end = start + timedelta(days=7)
        pref = repository.get(db.preferences, 1)
        pref.pop("id")
        return PlanningSnapshot(
            tasks=[Task.model_validate(row) for row in repository.list(db.tasks)],
            schedules=[json_row(row) for row in repository.list(
                db.schedules, db.schedules.c.start_datetime < end, db.schedules.c.end_datetime > start)],
            preferences=Preferences.model_validate(pref),
            current_plan=[block(row) for row in repository.list(
                db.plans, db.plans.c.start_datetime < end, db.plans.c.end_datetime > start)],
            now=now, mock_data=False,
        )

    def get_tasks(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.tasks)]

    def get_task(self, identifier):
        with self.database.transaction() as repository:
            return Task.model_validate(repository.get(db.tasks, identifier))

    def add_task(self, title, minutes, priority="MEDIUM", count=1, *, description="", due_date=None, category="personal"):
        now = self.current_time()
        task = Task(id=1, title=title, estimated_minutes=minutes, priority=priority,
                    weekly_target_count=count, created_at=now, updated_at=now,
                    description=description, due_date=due_date, category=category)
        with self.database.transaction(write=True) as repository:
            return Task.model_validate(repository.insert(db.tasks, task.model_dump(exclude={"id"})))

    def update_task(self, identifier, **changes):
        allowed = {"title", "description", "estimated_minutes", "priority", "due_date",
                   "status", "category", "weekly_target_count"}
        if changes.keys() - allowed:
            raise ConflictError("Unsupported task field")
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.tasks, identifier)
            task = Task.model_validate({**old, **changes, "updated_at": self.current_time()})
            linked = repository.list(db.plans, db.plans.c.task_id == identifier)
            if "status" in changes and task.status != "COMPLETED":
                expected = "PLANNED" if any(row["status"] == "PLANNED" for row in linked) else "TODO"
                if task.status != expected:
                    raise ConflictError("Task status must agree with saved plans")
            # Keep already saved blocks stable; user can explicitly edit/delete them first.
            if linked and any(task.model_dump()[key] != old[key] for key in
                              ("estimated_minutes", "due_date", "weekly_target_count")):
                raise ConflictError("Edit linked plans before changing duration, deadline or target")
            updated = Task.model_validate(repository.update(
                db.tasks, identifier, task.model_dump(exclude={"id"})))
            if "status" in changes:
                for item in repository.list(
                        db.today_items,
                        db.today_items.c.task_id == identifier,
                        db.today_items.c.item_date == self.current_time().date()):
                    completed = updated.status == "COMPLETED"
                    repository.update(db.today_items, item["id"], {
                        "status": "COMPLETED" if completed else "TODO",
                        "completion_count": item["completion_target"] if completed else 0,
                        "updated_at": self.current_time(),
                    })
            return updated

    def delete_task(self, identifier):
        with self.database.transaction(write=True) as repository:
            if repository.list(db.plans, db.plans.c.task_id == identifier):
                raise ConflictError("Delete linked plans before deleting this task")
            repository.delete(db.tasks, identifier)

    def get_fixed_schedules(self):
        with self.database.transaction() as repository:
            return self._snapshot(repository).get_fixed_schedules()

    def list_schedules(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.schedules)]

    def save_schedule(self, value: ScheduleInput, identifier=None):
        value = ScheduleInput.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            if identifier is not None:
                repository.get(db.schedules, identifier)
            span = TimeRange(value.start_datetime, value.end_datetime)
            if any(span.overlaps(block(row).time) for row in repository.list(db.plans)):
                raise ConflictError("Fixed schedule conflicts with a saved plan")
            row = (repository.insert(db.schedules, value.model_dump()) if identifier is None else
                   repository.update(db.schedules, identifier, value.model_dump()))
            return json_row(row)

    def set_schedule_completed(self, identifier, completed):
        with self.database.transaction(write=True) as repository:
            row = repository.update(db.schedules, identifier, {"completed": bool(completed)})
            return json_row(row)

    def delete_schedule(self, identifier):
        with self.database.transaction(write=True) as repository:
            repository.delete(db.schedules, identifier)

    def list_recurring_tasks(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.recurring_tasks)]

    def save_recurring_task(self, value: RecurringTaskInput, identifier=None):
        value = RecurringTaskInput.model_validate(value.model_dump())
        now = self.current_time()
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.recurring_tasks, identifier) if identifier is not None else None
            values = {
                **value.model_dump(),
                "start_date": value.start_date or now.date(),
                "created_at": old["created_at"] if old else now,
                "updated_at": now,
            }
            row = (repository.insert(db.recurring_tasks, values) if old is None else
                   repository.update(db.recurring_tasks, identifier, values))
            return json_row(row)

    def delete_recurring_task(self, identifier):
        with self.database.transaction(write=True) as repository:
            repository.delete(db.recurring_tasks, identifier)

    def _materialize_today_items(self, repository, item_date):
        now = self.current_time()
        next_order = self._next_today_order(repository, item_date)
        existing = {
            row["recurrence_id"] for row in repository.list(
                db.today_items, db.today_items.c.item_date == item_date,
                db.today_items.c.recurrence_id.is_not(None)
            )
        }
        for rule in repository.list(db.recurring_tasks, db.recurring_tasks.c.active.is_(True)):
            due = item_date >= rule["start_date"] and (
                rule["cadence"] == "DAILY" or item_date.weekday() in rule["weekdays"]
            )
            if due and rule["id"] not in existing:
                repository.insert(db.today_items, {
                    "title": rule["title"],
                    "item_date": item_date,
                    "status": "TODO",
                    "source": "RECURRING",
                    "recurrence_id": rule["id"],
                    "task_id": None,
                    "completion_count": 0,
                    "completion_target": today_completion_target(rule["title"]),
                    "order_index": next_order,
                    "created_at": now,
                    "updated_at": now,
                })
                next_order += 1
        if item_date.weekday() == 6:
            prompt_specs = (
                ("주간 식단 평가", bool(repository.list(
                    db.diet_reviews, db.diet_reviews.c.week_start == item_date - timedelta(days=6)))),
                ("몸무게 기록", bool(repository.list(
                    db.weight_records, db.weight_records.c.measured_on == item_date))),
            )
            for title, completed in prompt_specs:
                prompts = repository.list(
                    db.today_items,
                    db.today_items.c.item_date == item_date,
                    db.today_items.c.source == "RECURRING",
                    db.today_items.c.recurrence_id.is_(None),
                    db.today_items.c.title == title,
                )
                if not prompts:
                    repository.insert(db.today_items, {
                        "title": title,
                        "item_date": item_date,
                        "status": "COMPLETED" if completed else "TODO",
                        "source": "RECURRING",
                        "recurrence_id": None,
                        "task_id": None,
                        "completion_count": 1 if completed else 0,
                        "completion_target": 1,
                        "order_index": next_order,
                        "created_at": now,
                        "updated_at": now,
                    })
                    next_order += 1
    @staticmethod
    def _next_today_order(repository, item_date):
        rows = repository.list(db.today_items, db.today_items.c.item_date == item_date)
        return max((row["order_index"] for row in rows), default=0) + 1

    def list_today_items(self):
        item_date = self.current_time().date()
        with self.database.transaction(write=True) as repository:
            self._materialize_today_items(repository, item_date)
            rows = repository.list(db.today_items, db.today_items.c.item_date == item_date)
            normalized = []
            for row in rows:
                target = today_completion_target(row["title"])
                count = row["completion_count"]
                if row["status"] == "COMPLETED" and count == 0:
                    count = 1
                status = "COMPLETED" if count >= target else "TODO"
                if (target, count, status) != (
                        row["completion_target"], row["completion_count"], row["status"]):
                    row = repository.update(db.today_items, row["id"], {
                        "completion_target": target,
                        "completion_count": min(count, target),
                        "status": status,
                        "updated_at": self.current_time(),
                    })
                normalized.append(today_json_row(row))
            return sorted(normalized, key=lambda item: (item["order_index"], item["id"]))

    def list_week_today_items(self):
        item_date = self.current_time().date()
        week_start = item_date - timedelta(days=item_date.weekday())
        week_end = week_start + timedelta(days=7)
        with self.database.transaction(write=True) as repository:
            self._materialize_today_items(repository, item_date)
            rows = repository.list(
                db.today_items,
                db.today_items.c.item_date >= week_start,
                db.today_items.c.item_date < week_end,
            )
            return [today_json_row(row) for row in sorted(
                rows, key=lambda item: (item["item_date"], item["order_index"], item["id"])
            )]

    def create_today_item(self, value: TodayItemInput):
        value = TodayItemInput.model_validate(value.model_dump())
        now = self.current_time()
        with self.database.transaction(write=True) as repository:
            row = repository.insert(db.today_items, {
                "title": value.title,
                "item_date": now.date(),
                "status": "TODO",
                "source": "MANUAL",
                "recurrence_id": None,
                "task_id": None,
                "completion_count": 0,
                "completion_target": today_completion_target(value.title),
                "order_index": self._next_today_order(repository, now.date()),
                "created_at": now,
                "updated_at": now,
            })
            return json_row(row)

    def create_today_item_from_task(self, identifier):
        now = self.current_time()
        with self.database.transaction(write=True) as repository:
            task = repository.get(db.tasks, identifier)
            if task["status"] == "COMPLETED":
                raise ConflictError("Completed task cannot be added to Today")
            existing = repository.list(
                db.today_items,
                db.today_items.c.item_date == now.date(),
                db.today_items.c.task_id == identifier,
            )
            if existing:
                raise ConflictError("Task is already in Today")
            return today_json_row(repository.insert(db.today_items, {
                "title": task["title"],
                "item_date": now.date(),
                "status": "TODO",
                # MANUAL remains storage-compatible with the first local-only schema;
                # task_id makes the API representation a TASK item.
                "source": "MANUAL",
                "recurrence_id": None,
                "task_id": identifier,
                "completion_count": 0,
                "completion_target": today_completion_target(task["title"]),
                "order_index": self._next_today_order(repository, now.date()),
                "created_at": now,
                "updated_at": now,
            }))

    def reorder_today_items(self, ordered_ids):
        item_date = self.current_time().date()
        with self.database.transaction(write=True) as repository:
            self._materialize_today_items(repository, item_date)
            rows = repository.list(db.today_items, db.today_items.c.item_date == item_date)
            current_ids = {row["id"] for row in rows}
            if len(ordered_ids) != len(rows) or set(ordered_ids) != current_ids:
                raise ConflictError("Reorder must include every current Today item exactly once")
            now = self.current_time()
            for order_index, identifier in enumerate(ordered_ids, start=1):
                repository.update(db.today_items, identifier, {
                    "order_index": order_index,
                    "updated_at": now,
                })
            reordered = repository.list(db.today_items, db.today_items.c.item_date == item_date)
            return [today_json_row(row) for row in sorted(
                reordered, key=lambda item: (item["order_index"], item["id"])
            )]

    def update_today_item(self, identifier, status):
        if status not in {"TODO", "COMPLETED"}:
            raise ConflictError("Unsupported today item status")
        with self.database.transaction(write=True) as repository:
            item = repository.get(db.today_items, identifier)
            if status == "COMPLETED":
                count = min(item["completion_target"], item["completion_count"] + 1)
                next_status = "COMPLETED" if count >= item["completion_target"] else "TODO"
            else:
                count = 0
                next_status = "TODO"
            now = self.current_time()
            row = repository.update(db.today_items, identifier, {
                "status": next_status,
                "completion_count": count,
                "updated_at": now,
            })
            if item["task_id"] is not None:
                linked = repository.list(db.plans, db.plans.c.task_id == item["task_id"])
                task_status = ("COMPLETED" if next_status == "COMPLETED" else
                               "PLANNED" if any(plan["status"] == "PLANNED" for plan in linked) else "TODO")
                repository.update(db.tasks, item["task_id"], {
                    "status": task_status,
                    "updated_at": now,
                })
            return today_json_row(row)

    def delete_today_item(self, identifier):
        with self.database.transaction(write=True) as repository:
            repository.delete(db.today_items, identifier)

    def get_body_settings(self):
        with self.database.transaction() as repository:
            row = repository.get(db.body_settings, 1)
            return {"height_cm": row["height_cm"]}

    def save_body_settings(self, value: BodySettingsInput):
        value = BodySettingsInput.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            row = repository.update(db.body_settings, 1, value.model_dump())
            return {"height_cm": row["height_cm"]}

    def list_weight_records(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in sorted(
                repository.list(db.weight_records), key=lambda item: item["measured_on"]
            )]

    def save_weight_record(self, value: WeightRecordInput):
        value = WeightRecordInput.model_validate(value.model_dump())
        now = self.current_time()
        measured_on = value.measured_on or now.date()
        with self.database.transaction(write=True) as repository:
            existing = repository.list(
                db.weight_records, db.weight_records.c.measured_on == measured_on
            )
            values = {
                "measured_on": measured_on,
                "weight_kg": value.weight_kg,
                "created_at": existing[0]["created_at"] if existing else now,
                "updated_at": now,
            }
            row = (repository.update(db.weight_records, existing[0]["id"], values)
                   if existing else repository.insert(db.weight_records, values))
            for prompt in repository.list(
                    db.today_items,
                    db.today_items.c.item_date == measured_on,
                    db.today_items.c.source == "RECURRING",
                    db.today_items.c.recurrence_id.is_(None),
                    db.today_items.c.title == "몸무게 기록"):
                repository.update(db.today_items, prompt["id"], {
                    "status": "COMPLETED", "completion_count": 1, "updated_at": now,
                })
            return json_row(row)

    def delete_weight_record(self, identifier):
        with self.database.transaction(write=True) as repository:
            row = repository.get(db.weight_records, identifier)
            repository.delete(db.weight_records, identifier)
            for prompt in repository.list(
                    db.today_items,
                    db.today_items.c.item_date == row["measured_on"],
                    db.today_items.c.source == "RECURRING",
                    db.today_items.c.recurrence_id.is_(None),
                    db.today_items.c.title == "몸무게 기록"):
                repository.update(db.today_items, prompt["id"], {
                    "status": "TODO", "completion_count": 0,
                    "updated_at": self.current_time(),
                })

    @staticmethod
    def _food_key(name):
        return " ".join(name.casefold().split())

    def _week_dates(self, target=None):
        target = target or self.current_time().date()
        start = target - timedelta(days=target.weekday())
        return start, start + timedelta(days=7)

    def _invalidate_diet_review(self, repository, eaten_on):
        week_start, week_end = self._week_dates(eaten_on)
        for review in repository.list(db.diet_reviews, db.diet_reviews.c.week_start == week_start):
            repository.delete(db.diet_reviews, review["id"])
        sunday = week_end - timedelta(days=1)
        for prompt in repository.list(
                db.today_items,
                db.today_items.c.item_date == sunday,
                db.today_items.c.title == "주간 식단 평가"):
            repository.update(db.today_items, prompt["id"], {
                "status": "TODO", "completion_count": 0, "updated_at": self.current_time(),
            })

    def list_meal_entries(self):
        week_start, week_end = self._week_dates()
        with self.database.transaction() as repository:
            rows = repository.list(
                db.meal_entries,
                db.meal_entries.c.eaten_on >= week_start,
                db.meal_entries.c.eaten_on < week_end,
            )
            return [json_row(row) for row in sorted(
                rows, key=lambda item: (item["eaten_on"], item["meal_type"], item["id"])
            )]

    def list_food_nutrition(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.food_nutrition)]

    def save_meal_entry(self, value: MealEntryInput, identifier=None):
        value = MealEntryInput.model_validate(value.model_dump())
        now = self.current_time()
        eaten_on = value.eaten_on or now.date()
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.meal_entries, identifier) if identifier is not None else None
            known = repository.list(
                db.food_nutrition,
                db.food_nutrition.c.normalized_name == self._food_key(value.food_name),
            )
            calories, protein = value.calories_kcal, value.protein_g
            user_supplied = calories is not None or protein is not None
            used_memory = False
            if known:
                if calories is None:
                    calories, used_memory = known[0]["calories_kcal"], True
                if protein is None:
                    protein, used_memory = known[0]["protein_g"], True
            if calories is None and protein is None:
                source = "UNKNOWN"
            elif calories is not None and protein is not None:
                source = "MIXED" if user_supplied and used_memory else "MEMORY" if used_memory else "MANUAL"
            else:
                source = "MANUAL"
            values = {
                "eaten_on": eaten_on, "meal_type": value.meal_type,
                "food_name": value.food_name, "calories_kcal": calories,
                "protein_g": protein, "nutrition_source": source,
                "created_at": old["created_at"] if old else now, "updated_at": now,
            }
            row = (repository.update(db.meal_entries, identifier, values) if old else
                   repository.insert(db.meal_entries, values))
            if not used_memory and calories is not None and protein is not None:
                catalog_values = {
                    "normalized_name": self._food_key(value.food_name),
                    "display_name": value.food_name, "calories_kcal": calories,
                    "protein_g": protein, "source": "MANUAL",
                    "created_at": known[0]["created_at"] if known else now, "updated_at": now,
                }
                if known:
                    repository.update(db.food_nutrition, known[0]["id"], catalog_values)
                else:
                    repository.insert(db.food_nutrition, catalog_values)
            if old and old["eaten_on"] != eaten_on:
                self._invalidate_diet_review(repository, old["eaten_on"])
            self._invalidate_diet_review(repository, eaten_on)
            return json_row(row)

    def delete_meal_entry(self, identifier):
        with self.database.transaction(write=True) as repository:
            row = repository.get(db.meal_entries, identifier)
            repository.delete(db.meal_entries, identifier)
            self._invalidate_diet_review(repository, row["eaten_on"])

    def get_diet_review(self):
        week_start, _ = self._week_dates()
        with self.database.transaction() as repository:
            rows = repository.list(db.diet_reviews, db.diet_reviews.c.week_start == week_start)
            return json_row(rows[0]) if rows else None

    def diet_analysis_payload(self):
        week_start, week_end = self._week_dates()
        with self.database.transaction() as repository:
            meals = repository.list(
                db.meal_entries,
                db.meal_entries.c.eaten_on >= week_start,
                db.meal_entries.c.eaten_on < week_end,
            )
            if not meals:
                raise ConflictError("이번 주에 기록된 식사가 없습니다.")
            weights = sorted(repository.list(db.weight_records, db.weight_records.c.measured_on < week_end),
                             key=lambda item: item["measured_on"])
            return {
                "week_start": week_start.isoformat(),
                "height_cm": repository.get(db.body_settings, 1)["height_cm"],
                "latest_weight_kg": weights[-1]["weight_kg"] if weights else None,
                "meals": [{
                    "entry_id": row["id"], "date": row["eaten_on"].isoformat(),
                    "meal_type": row["meal_type"], "food_name": row["food_name"],
                    "calories_kcal": row["calories_kcal"], "protein_g": row["protein_g"],
                    "needs_estimate": row["calories_kcal"] is None or row["protein_g"] is None,
                } for row in meals],
            }

    def save_diet_analysis(self, analysis: DietAnalysis):
        analysis = DietAnalysis.model_validate(analysis)
        week_start, week_end = self._week_dates()
        now = self.current_time()
        with self.database.transaction(write=True) as repository:
            meals = repository.list(
                db.meal_entries,
                db.meal_entries.c.eaten_on >= week_start,
                db.meal_entries.c.eaten_on < week_end,
            )
            unresolved = {row["id"] for row in meals
                          if row["calories_kcal"] is None or row["protein_g"] is None}
            supplied = {item.entry_id for item in analysis.nutrition_estimates}
            if supplied != unresolved:
                raise ConflictError("식단 기록이 변경되었습니다. 다시 평가해 주세요.")
            estimates = {item.entry_id: item for item in analysis.nutrition_estimates}
            resolved = []
            for row in meals:
                if row["id"] in estimates:
                    estimate = estimates[row["id"]]
                    calories = row["calories_kcal"] if row["calories_kcal"] is not None else estimate.calories_kcal
                    protein = row["protein_g"] if row["protein_g"] is not None else estimate.protein_g
                    source = "GPT" if row["calories_kcal"] is None and row["protein_g"] is None else "MIXED"
                    row = repository.update(db.meal_entries, row["id"], {
                        "calories_kcal": calories, "protein_g": protein,
                        "nutrition_source": source, "updated_at": now,
                    })
                    known = repository.list(
                        db.food_nutrition,
                        db.food_nutrition.c.normalized_name == self._food_key(row["food_name"]),
                    )
                    catalog = {
                        "normalized_name": self._food_key(row["food_name"]),
                        "display_name": row["food_name"], "calories_kcal": calories,
                        "protein_g": protein, "source": source,
                        "created_at": known[0]["created_at"] if known else now, "updated_at": now,
                    }
                    if known:
                        repository.update(db.food_nutrition, known[0]["id"], catalog)
                    else:
                        repository.insert(db.food_nutrition, catalog)
                resolved.append(row)
            total_calories = sum(row["calories_kcal"] or 0 for row in resolved)
            total_protein = sum(row["protein_g"] or 0 for row in resolved)
            existing = repository.list(db.diet_reviews, db.diet_reviews.c.week_start == week_start)
            values = {
                "week_start": week_start, "summary": analysis.summary,
                "good_points": analysis.good_points, "avoid_foods": analysis.avoid_foods,
                "limit_foods": analysis.limit_foods, "total_calories_kcal": total_calories,
                "average_daily_calories_kcal": total_calories / 7,
                "total_protein_g": total_protein,
                "average_daily_protein_g": total_protein / 7,
                "created_at": existing[0]["created_at"] if existing else now, "updated_at": now,
            }
            review = (repository.update(db.diet_reviews, existing[0]["id"], values)
                      if existing else repository.insert(db.diet_reviews, values))
            sunday = week_end - timedelta(days=1)
            for prompt in repository.list(
                    db.today_items, db.today_items.c.item_date == sunday,
                    db.today_items.c.title == "주간 식단 평가"):
                repository.update(db.today_items, prompt["id"], {
                    "status": "COMPLETED", "completion_count": 1, "updated_at": now,
                })
            return json_row(review)
    def get_preferences(self):
        with self.database.transaction() as repository:
            pref = repository.get(db.preferences, 1)
            pref.pop("id")
            return {**Preferences.model_validate(pref).model_dump(mode="json"), "timezone": "Asia/Seoul"}

    def save_preferences(self, value: Preferences):
        value = Preferences.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            existing = [block(row) for row in repository.list(db.plans)]
            future = [item for item in existing if item.time.end > self.current_time()]
            for item in future:
                window = value.window(item.time.start.date())
                if item.time.start < window.start or item.time.end > window.end:
                    raise ConflictError("Preferences would invalidate a saved plan")
            for day in {item.time.start.date() for item in future}:
                if daily_minutes(day, existing) > value.max_daily_planning_minutes:
                    raise ConflictError("Preferences would exceed the daily planning limit")
            repository.update(db.preferences, 1, value.model_dump())
        return {**value.model_dump(mode="json"), "timezone": "Asia/Seoul"}

    def get_current_plan(self):
        with self.database.transaction() as repository:
            snapshot = self._snapshot(repository)
            start = datetime.combine(snapshot.monday, time(), KST)
            return [json_row(row) for row in repository.list(
                db.plans, db.plans.c.start_datetime < start + timedelta(days=7),
                db.plans.c.end_datetime > start)]

    def get_today_plan(self):
        now = self.current_time()
        start = datetime.combine(now.date(), time(), KST)
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(
                db.plans, db.plans.c.start_datetime < start + timedelta(days=1),
                db.plans.c.end_datetime > start)]

    def list_plans(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.plans)]

    def get_available_time_slots(self):
        with self.database.transaction() as repository:
            return self._snapshot(repository).get_available_time_slots()

    def render_proposal(self, proposal: Proposal):
        from app.actions import render_review
        with self.database.transaction() as repository:
            return render_review(self, repository, proposal)

    def save_manual_plan(self, value: ManualPlanInput, identifier=None):
        value = ManualPlanInput.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            task = Task.model_validate(repository.get(db.tasks, value.task_id))
            span = TimeRange(value.start_datetime,
                             value.start_datetime + timedelta(minutes=task.estimated_minutes))
            start = span.start.date() - timedelta(days=span.start.weekday())
            week_start = datetime.combine(start, time(), KST)
            week_end = week_start + timedelta(days=7)
            old = repository.get(db.plans, identifier) if identifier is not None else None
            if old and old["status"] == "COMPLETED":
                raise ConflictError("Completed plan cannot be moved")
            existing_rows = repository.list(
                db.plans, db.plans.c.start_datetime < week_end, db.plans.c.end_datetime > week_start)
            existing = [block(row) for row in existing_rows if row["id"] != identifier]
            schedules = [TimeRange(row["start_datetime"], row["end_datetime"])
                         for row in repository.list(db.schedules)]
            pref = repository.get(db.preferences, 1)
            pref.pop("id")
            validate_plan([PlanBlock(task.id, span)], [task], start, self.current_time(),
                          Preferences.model_validate(pref), schedules, existing)
            now = self.current_time()
            values = {"task_id": task.id, "title": task.title, "start_datetime": span.start,
                      "end_datetime": span.end, "status": "PLANNED", "source": "MANUAL",
                      "created_at": old["created_at"] if old else now, "updated_at": now}
            row = (repository.insert(db.plans, values) if identifier is None else
                   repository.update(db.plans, identifier, values))
            repository.update(db.tasks, task.id, {"status": "PLANNED", "updated_at": now})
            if old and old["task_id"] != task.id:
                self._refresh_task_status(repository, old["task_id"])
            return json_row(row)

    def _refresh_task_status(self, repository, task_id):
        task = repository.get(db.tasks, task_id)
        if task["status"] != "COMPLETED":
            remaining = repository.list(db.plans, db.plans.c.task_id == task_id,
                                        db.plans.c.status == "PLANNED")
            repository.update(db.tasks, task_id, {
                "status": "PLANNED" if remaining else "TODO", "updated_at": self.current_time()})

    def delete_plan(self, identifier):
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.plans, identifier)
            repository.delete(db.plans, identifier)
            self._refresh_task_status(repository, old["task_id"])

    def complete_plan(self, identifier):
        return self.set_plan_status(identifier, "COMPLETED")

    def set_plan_status(self, identifier, status):
        if status not in {"PLANNED", "COMPLETED"}:
            raise ValueError("Plan status must be PLANNED or COMPLETED")
        with self.database.transaction(write=True) as repository:
            row = repository.update(db.plans, identifier, {
                "status": status, "updated_at": self.current_time()})
            self._refresh_task_status(repository, row["task_id"])
            return json_row(row)
