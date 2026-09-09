"""SQLite persistence; no database operations are exposed as Agent tools."""
from contextlib import contextmanager
from datetime import timezone
from pathlib import Path

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Integer,
    MetaData, String, Table, Time, URL, create_engine, event, select,
)
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Store UTC (SQLite drops offsets), restore aware UTC on every read."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timezone-aware datetime required")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


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
    CheckConstraint("end_datetime > start_datetime"),
    CheckConstraint("fixed = 1"),
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


class Database:
    def __init__(self, path: str | Path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            URL.create("sqlite", database=str(self.path)),
            connect_args={"timeout": 5}, hide_parameters=True,
        )

        @event.listens_for(self.engine, "connect")
        def configure(connection, _):
            connection.isolation_level = None
            connection.execute("PRAGMA foreign_keys=ON")

        metadata.create_all(self.engine)

    @contextmanager
    def transaction(self, *, write=False):
        with self.engine.connect() as connection:
            # Serialize SQLite writes before reading constraints; rollback every failure.
            connection.exec_driver_sql("BEGIN IMMEDIATE" if write else "BEGIN")
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
            raise ValueError(f"{table.name} item not found")
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
