"""SQLAlchemy persistence; no database operations are exposed as Agent tools."""
from contextlib import contextmanager
from datetime import timezone
from pathlib import Path

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, Float, ForeignKey, Integer,
    MetaData, String, Table, Time, URL, JSON, UniqueConstraint, create_engine, event, inspect, select,
)
from sqlalchemy.types import TypeDecorator
from app.errors import NotFoundError


class UTCDateTime(TypeDecorator):
    """Store UTC and restore an aware UTC value on every supported database."""
    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(DateTime(timezone=dialect.name != "sqlite"))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timezone-aware datetime required")
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


metadata = MetaData()
tasks = Table(
    "tasks", metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String(120), nullable=False),
    Column("description", String(2000), nullable=False),
    Column("estimated_minutes", Integer, nullable=False),
    Column("priority", String(10), nullable=False),
    Column("due_date", Date),
    Column("status", String(12), nullable=False),
    Column("category", String(120), nullable=False),
    Column("weekly_target_count", Integer, nullable=False),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    CheckConstraint("estimated_minutes BETWEEN 1 AND 120"),
    CheckConstraint("weekly_target_count BETWEEN 1 AND 7"),
    CheckConstraint("priority IN ('LOW', 'MEDIUM', 'HIGH')"),
    CheckConstraint("status IN ('TODO', 'PLANNED', 'COMPLETED')"),
    sqlite_autoincrement=True,
)
schedules = Table(
    "schedules", metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String(120), nullable=False),
    Column("start_datetime", UTCDateTime(), nullable=False, index=True),
    Column("end_datetime", UTCDateTime(), nullable=False),
    Column("description", String(2000), nullable=False),
    Column("fixed", Boolean, nullable=False),
    Column("completed", Boolean, nullable=False, default=False),
    CheckConstraint("end_datetime > start_datetime"),
    CheckConstraint("fixed"),
    sqlite_autoincrement=True,
)
preferences = Table(
    "preferences", metadata,
    Column("id", Integer, primary_key=True),
    Column("weekday_available_from", Time, nullable=False),
    Column("weekday_available_until", Time, nullable=False),
    Column("weekend_available_from", Time, nullable=False),
    Column("weekend_available_until", Time, nullable=False),
    Column("max_daily_planning_minutes", Integer, nullable=False),
    CheckConstraint("id = 1"),
    CheckConstraint("max_daily_planning_minutes BETWEEN 1 AND 1440"),
)
plans = Table(
    "plans", metadata,
    Column("id", Integer, primary_key=True),
    Column("task_id", ForeignKey("tasks.id", ondelete="RESTRICT"), nullable=False, index=True),
    Column("title", String(120), nullable=False),
    Column("start_datetime", UTCDateTime(), nullable=False, index=True),
    Column("end_datetime", UTCDateTime(), nullable=False),
    Column("status", String(12), nullable=False),
    Column("source", String(10), nullable=False),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    CheckConstraint("end_datetime > start_datetime"),
    CheckConstraint("status IN ('PLANNED', 'COMPLETED')"),
    CheckConstraint("source IN ('MANUAL', 'AGENT')"),
    sqlite_autoincrement=True,
)


pending_actions = Table(
    "pending_actions", metadata,
    Column("id", Integer, primary_key=True),
    Column("action_type", String(20), nullable=False),
    Column("status", String(12), nullable=False, index=True),
    Column("payload", JSON, nullable=False),
    Column("baseline", JSON, nullable=False),
    Column("result", JSON),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    Column("approved_at", UTCDateTime()),
    Column("executed_at", UTCDateTime()),
    CheckConstraint("action_type = 'PLAN_CHANGES'"),
    CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')"),
    sqlite_autoincrement=True,
)

recurring_tasks = Table(
    "recurring_tasks", metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String(120), nullable=False),
    Column("cadence", String(10), nullable=False),
    Column("weekdays", JSON, nullable=False),
    Column("start_date", Date, nullable=False),
    Column("active", Boolean, nullable=False),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    CheckConstraint("cadence IN ('DAILY', 'WEEKLY')"),
    sqlite_autoincrement=True,
)

today_items = Table(
    "today_items", metadata,
    Column("id", Integer, primary_key=True),
    Column("title", String(120), nullable=False),
    Column("item_date", Date, nullable=False, index=True),
    Column("status", String(12), nullable=False),
    Column("source", String(10), nullable=False),
    Column("recurrence_id", ForeignKey("recurring_tasks.id", ondelete="SET NULL"), index=True),
    Column("task_id", ForeignKey("tasks.id", ondelete="SET NULL"), index=True),
    Column("completion_count", Integer, nullable=False, default=0),
    Column("completion_target", Integer, nullable=False, default=1),
    Column("order_index", Integer, nullable=False, default=0),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    CheckConstraint("status IN ('TODO', 'COMPLETED')"),
    CheckConstraint("source IN ('MANUAL', 'RECURRING', 'TASK')"),
    CheckConstraint("completion_count >= 0"),
    CheckConstraint("completion_target >= 1"),
    CheckConstraint("order_index >= 0"),
    UniqueConstraint("recurrence_id", "item_date", name="uq_today_items_recurrence_date"),
    UniqueConstraint("task_id", "item_date", name="uq_today_items_task_date"),
    sqlite_autoincrement=True,
)

body_settings = Table(
    "body_settings", metadata,
    Column("id", Integer, primary_key=True),
    Column("height_cm", Float, nullable=False),
    CheckConstraint("id = 1"),
    CheckConstraint("height_cm > 50 AND height_cm <= 250"),
)

weight_records = Table(
    "weight_records", metadata,
    Column("id", Integer, primary_key=True),
    Column("measured_on", Date, nullable=False, unique=True, index=True),
    Column("weight_kg", Float, nullable=False),
    Column("created_at", UTCDateTime(), nullable=False),
    Column("updated_at", UTCDateTime(), nullable=False),
    CheckConstraint("weight_kg >= 20 AND weight_kg <= 400"),
    sqlite_autoincrement=True,
)


class Database:
    def __init__(self, location: str | Path):
        raw_location = str(location)
        self.is_sqlite = "://" not in raw_location
        self.path = Path(raw_location).resolve() if self.is_sqlite else None
        if self.is_sqlite:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            url = URL.create("sqlite", database=str(self.path))
            engine_options = {"connect_args": {"timeout": 5}}
        else:
            # Neon supplies a standard PostgreSQL URL. Select psycopg 3 explicitly.
            if raw_location.startswith("postgres://"):
                raw_location = "postgresql://" + raw_location[len("postgres://"):]
            if raw_location.startswith("postgresql://"):
                raw_location = "postgresql+psycopg://" + raw_location[len("postgresql://"):]
            url = raw_location
            engine_options = {"pool_pre_ping": True}

        self.engine = create_engine(url, hide_parameters=True, **engine_options)

        if self.is_sqlite:
            @event.listens_for(self.engine, "connect")
            def configure(connection, _):
                connection.isolation_level = None
                connection.execute("PRAGMA foreign_keys=ON")

        metadata.create_all(self.engine)
        if "schedules" in inspect(self.engine).get_table_names():
            schedule_columns = {
                column["name"] for column in inspect(self.engine).get_columns("schedules")
            }
            if "completed" not in schedule_columns:
                with self.engine.begin() as connection:
                    connection.exec_driver_sql(
                        "ALTER TABLE schedules ADD COLUMN completed BOOLEAN NOT NULL DEFAULT FALSE"
                    )
        if "recurring_tasks" in inspect(self.engine).get_table_names():
            recurring_columns = {
                column["name"] for column in inspect(self.engine).get_columns("recurring_tasks")
            }
            if "start_date" not in recurring_columns:
                with self.engine.begin() as connection:
                    connection.exec_driver_sql(
                        "ALTER TABLE recurring_tasks ADD COLUMN start_date "
                        "DATE NOT NULL DEFAULT '1970-01-01'"
                    )
                    connection.exec_driver_sql(
                        "UPDATE recurring_tasks SET start_date = "
                        + ("date(created_at)" if self.is_sqlite else "CAST(created_at AS DATE)")
                    )
        if self.is_sqlite and "today_items" in inspect(self.engine).get_table_names():
            columns = {column["name"] for column in inspect(self.engine).get_columns("today_items")}
            with self.engine.begin() as connection:
                if "task_id" not in columns:
                    connection.exec_driver_sql(
                        "ALTER TABLE today_items ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL"
                    )
                if "completion_count" not in columns:
                    connection.exec_driver_sql(
                        "ALTER TABLE today_items ADD COLUMN completion_count INTEGER NOT NULL DEFAULT 0"
                    )
                if "completion_target" not in columns:
                    connection.exec_driver_sql(
                        "ALTER TABLE today_items ADD COLUMN completion_target INTEGER NOT NULL DEFAULT 1"
                    )
                if "order_index" not in columns:
                    connection.exec_driver_sql(
                        "ALTER TABLE today_items ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0"
                    )
                connection.exec_driver_sql(
                    "UPDATE today_items SET order_index = id WHERE order_index = 0"
                )
                connection.exec_driver_sql(
                    "CREATE INDEX IF NOT EXISTS ix_today_items_task_id ON today_items (task_id)"
                )
                connection.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_today_items_task_date "
                    "ON today_items (task_id, item_date) WHERE task_id IS NOT NULL"
                )

    @contextmanager
    def transaction(self, *, write=False):
        with self.engine.connect() as connection:
            if self.is_sqlite:
                # Serialize SQLite writes before reading constraints.
                connection.exec_driver_sql("BEGIN IMMEDIATE" if write else "BEGIN")
            else:
                connection.begin()
                if write:
                    # Preserve the single-writer invariant used by approval validation.
                    connection.exec_driver_sql("SELECT pg_advisory_xact_lock(731942611)")
            try:
                yield Repository(connection)
                connection.commit()
            except BaseException:
                connection.rollback()
                raise

    def close(self):
        self.engine.dispose()


class Repository:
    def __init__(self, connection):
        self.connection = connection

    def list(self, table, *conditions):
        return [dict(row) for row in self.connection.execute(
            select(table).where(*conditions).order_by(table.c.id)).mappings()]

    def get(self, table, identifier):
        row = self.connection.execute(select(table).where(table.c.id == identifier)).mappings().first()
        if row is None:
            raise NotFoundError(f"{table.name} item not found")
        return dict(row)

    def insert(self, table, values):
        result = self.connection.execute(table.insert().values(**values))
        return self.get(table, result.inserted_primary_key[0])

    def update(self, table, identifier, values):
        self.get(table, identifier)
        self.connection.execute(table.update().where(table.c.id == identifier).values(**values))
        return self.get(table, identifier)

    def delete(self, table, identifier):
        self.get(table, identifier)
        self.connection.execute(table.delete().where(table.c.id == identifier))
