from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING, Any, Iterator

from backend.app.config import Settings, load_settings
from backend.app.db.schema import SCHEMA_MIGRATIONS, SCHEMA_STATEMENTS

if TYPE_CHECKING:
    import pymysql


def _load_pymysql():
    try:
        import pymysql  # type: ignore
        from pymysql.cursors import DictCursor  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError("PyMySQL is required. Install it with `pip install pymysql`.") from exc
    return pymysql, DictCursor


class CursorContext:
    def __init__(self, connection) -> None:
        self._connection = connection
        self._cursor = None

    def __enter__(self):
        self._cursor = self._connection.cursor()
        return MySQLCursorAdapter(self._cursor)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._cursor is not None:
            self._cursor.close()


class MySQLCursorAdapter:
    def __init__(self, cursor) -> None:
        self._cursor = cursor

    @property
    def lastrowid(self) -> int:
        return int(self._cursor.lastrowid or 0)

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    def execute(self, query: str, params: tuple[Any, ...] | list[Any] | None = None) -> int:
        normalized_query = query.replace("?", "%s")
        return self._cursor.execute(normalized_query, params)

    def executemany(self, query: str, params: list[tuple[Any, ...]]) -> int:
        normalized_query = query.replace("?", "%s")
        return self._cursor.executemany(normalized_query, params)

    def fetchone(self) -> dict[str, Any] | None:
        return self._cursor.fetchone()

    def fetchall(self) -> list[dict[str, Any]]:
        return list(self._cursor.fetchall())


class MySQLConnectionAdapter:
    def __init__(self, connection) -> None:
        self._connection = connection

    def cursor(self) -> CursorContext:
        return CursorContext(self._connection)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def _open_mysql_connection(settings: Settings, *, with_database: bool):
    pymysql, DictCursor = _load_pymysql()
    connect_kwargs: dict[str, Any] = {
        "host": settings.mysql_host,
        "port": settings.mysql_port,
        "user": settings.mysql_user,
        "password": settings.mysql_password,
        "charset": "utf8mb4",
        "cursorclass": DictCursor,
        "autocommit": False,
    }
    if with_database:
        connect_kwargs["database"] = settings.mysql_database
    return pymysql.connect(**connect_kwargs)


def _ensure_database_exists(settings: Settings) -> None:
    connection = _open_mysql_connection(settings, with_database=False)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` "
                "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        connection.commit()
    finally:
        connection.close()


@contextmanager
def get_connection() -> Iterator[MySQLConnectionAdapter]:
    settings = load_settings()
    _ensure_database_exists(settings)
    connection = MySQLConnectionAdapter(_open_mysql_connection(settings, with_database=True))
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema() -> None:
    settings = load_settings()
    _ensure_database_exists(settings)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for statement in SCHEMA_STATEMENTS:
                cursor.execute(statement)

            for table_name, migrations in SCHEMA_MIGRATIONS.items():
                cursor.execute(
                    """
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                    """,
                    (settings.mysql_database, table_name),
                )
                existing_columns = {str(row["COLUMN_NAME"]) for row in cursor.fetchall()}
                for column_name, statement in migrations.items():
                    if column_name not in existing_columns:
                        cursor.execute(statement)
