from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import load_settings
from app.db.schema import SCHEMA_MIGRATIONS, SCHEMA_STATEMENTS


def _dict_row_factory(cursor: sqlite3.Cursor, row: tuple[object, ...]) -> dict[str, object]:
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


class CursorContext:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection
        self._cursor: sqlite3.Cursor | None = None

    def __enter__(self) -> sqlite3.Cursor:
        self._cursor = self._connection.cursor()
        return self._cursor

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._cursor is not None:
            self._cursor.close()


class SQLiteConnectionAdapter:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def cursor(self) -> CursorContext:
        return CursorContext(self._connection)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def _open_sqlite_connection(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = _dict_row_factory
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def get_connection() -> Iterator[SQLiteConnectionAdapter]:
    settings = load_settings()
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = SQLiteConnectionAdapter(_open_sqlite_connection(settings.database_path))
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            table_statements = []
            other_statements = []
            for statement in SCHEMA_STATEMENTS:
                normalized = statement.strip().upper()
                if normalized.startswith("CREATE TABLE") or normalized.startswith("PRAGMA"):
                    table_statements.append(statement)
                else:
                    other_statements.append(statement)

            for statement in table_statements:
                cursor.execute(statement)

            for table_name, migrations in SCHEMA_MIGRATIONS.items():
                cursor.execute(f"PRAGMA table_info({table_name})")
                existing_columns = {str(row["name"]) for row in cursor.fetchall()}
                for column_name, statement in migrations.items():
                    if column_name not in existing_columns:
                        cursor.execute(statement)

            for statement in other_statements:
                cursor.execute(statement)
