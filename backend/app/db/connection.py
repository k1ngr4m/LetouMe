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


def _format_mysql_operational_error(settings: Settings, exc: Exception) -> str:
    pymysql, _ = _load_pymysql()
    if not isinstance(exc, pymysql.err.OperationalError):  # type: ignore[attr-defined]
        return f"MySQL connection failed: {exc}"

    code = exc.args[0] if exc.args else None
    details = (
        f"user={settings.mysql_user} host={settings.mysql_host} port={settings.mysql_port} "
        f"database={settings.mysql_database}"
    )

    if code == 1130:
        return (
            "MySQL rejected this client host (1130).\n"
            f"Connection details: {details}\n"
            "Fix options:\n"
            "- Use a local MySQL for dev (edit `.env` / `.env.dev`).\n"
            "- Or on the MySQL server, grant this user for your client IP, e.g. "
            "`CREATE USER ...; GRANT ...; FLUSH PRIVILEGES;`.\n"
        )
    if code == 1045:
        return (
            "MySQL access denied (1045) — username/password or host grants are wrong.\n"
            f"Connection details: {details}\n"
            "Fix options:\n"
            "- Update `MYSQL_USER` / `MYSQL_PASSWORD` (prefer putting secrets in `.env`).\n"
            "- Or create a dedicated dev user and grant privileges to the `letoume` database.\n"
        )
    if code == 2003:
        return (
            "Cannot connect to MySQL (2003) — server not reachable.\n"
            f"Connection details: {details}\n"
            "Fix options:\n"
            "- Ensure MySQL is running and listening on the given host/port.\n"
            "- If using Docker/VM/remote, check firewall/security group and bind address.\n"
        )
    return f"MySQL connection failed ({code}): {exc}\nConnection details: {details}\n"


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
    try:
        return pymysql.connect(**connect_kwargs)
    except Exception as exc:
        raise RuntimeError(_format_mysql_operational_error(settings, exc)) from exc


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
