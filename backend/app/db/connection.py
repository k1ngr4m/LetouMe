from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from threading import Lock
from time import perf_counter
from typing import TYPE_CHECKING, Any, Iterator

from backend.app.config import Settings, load_settings
from backend.app.db.lottery_tables import rewrite_lottery_tables
from backend.app.db.schema import SCHEMA_INDEX_MIGRATIONS, SCHEMA_MIGRATIONS, SCHEMA_STATEMENTS
from backend.app.logging_utils import get_logger

if TYPE_CHECKING:
    import pymysql


logger = get_logger("db")
_db_ready = False
_schema_ready = False
_ready_lock = Lock()
_pool_lock = Lock()
_connection_pool: list[Any] = []
_pool_signature: tuple[str, int, str, str] | None = None
_ready_signature: tuple[str, int, str, str] | None = None
_request_metrics: ContextVar[dict[str, float | int]] = ContextVar("db_request_metrics", default={"query_count": 0, "db_time_ms": 0.0})


def reset_request_metrics() -> None:
    _request_metrics.set({"query_count": 0, "db_time_ms": 0.0})


def get_request_metrics() -> dict[str, float | int]:
    metrics = _request_metrics.get()
    return {
        "query_count": int(metrics.get("query_count", 0)),
        "db_time_ms": round(float(metrics.get("db_time_ms", 0.0)), 2),
    }


def _track_query(duration_ms: float, query: str) -> None:
    metrics = dict(_request_metrics.get())
    metrics["query_count"] = int(metrics.get("query_count", 0)) + 1
    metrics["db_time_ms"] = float(metrics.get("db_time_ms", 0.0)) + duration_ms
    _request_metrics.set(metrics)
    if duration_ms >= 200:
        logger.warning("Slow SQL detected", extra={"context": {"duration_ms": round(duration_ms, 2), "query": " ".join(query.split())[:240]}})


def _settings_signature(settings: Settings) -> tuple[str, int, str, str]:
    return (settings.mysql_host, settings.mysql_port, settings.mysql_user, settings.mysql_database)


def _close_pool_locked() -> None:
    while _connection_pool:
        connection = _connection_pool.pop()
        try:
            connection.close()
        except Exception:
            continue


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
    def __init__(self, connection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings
        self._cursor = None

    def __enter__(self):
        self._cursor = self._connection.cursor()
        return MySQLCursorAdapter(self._cursor, settings=self._settings)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._cursor is not None:
            self._cursor.close()


class MySQLCursorAdapter:
    def __init__(self, cursor, *, settings: Settings) -> None:
        self._cursor = cursor
        self._settings = settings

    @property
    def lastrowid(self) -> int:
        return int(self._cursor.lastrowid or 0)

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    def execute(self, query: str, params: tuple[Any, ...] | list[Any] | None = None) -> int:
        routed_query = rewrite_lottery_tables(
            query,
            split_enabled=self._settings.lottery_split_tables_enabled,
        )
        normalized_query = routed_query.replace("?", "%s")
        started_at = perf_counter()
        try:
            return self._cursor.execute(normalized_query, params)
        finally:
            _track_query((perf_counter() - started_at) * 1000, routed_query)

    def executemany(self, query: str, params: list[tuple[Any, ...]]) -> int:
        routed_query = rewrite_lottery_tables(
            query,
            split_enabled=self._settings.lottery_split_tables_enabled,
        )
        normalized_query = routed_query.replace("?", "%s")
        started_at = perf_counter()
        try:
            return self._cursor.executemany(normalized_query, params)
        finally:
            _track_query((perf_counter() - started_at) * 1000, routed_query)

    def fetchone(self) -> dict[str, Any] | None:
        return self._cursor.fetchone()

    def fetchall(self) -> list[dict[str, Any]]:
        return list(self._cursor.fetchall())


class MySQLConnectionAdapter:
    def __init__(self, connection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings

    def cursor(self) -> CursorContext:
        return CursorContext(self._connection, self._settings)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        _release_raw_mysql_connection(self._settings, self._connection)


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
    global _db_ready, _schema_ready, _ready_signature
    signature = _settings_signature(settings)
    if _db_ready:
        if _ready_signature == signature:
            return
    with _ready_lock:
        if _ready_signature != signature:
            _db_ready = False
            _schema_ready = False
            _ready_signature = signature
        if _db_ready:
            return
        connection = _open_mysql_connection(settings, with_database=False)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` "
                    "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            connection.commit()
            _db_ready = True
        finally:
            connection.close()


def _acquire_raw_mysql_connection(settings: Settings):
    global _pool_signature
    signature = _settings_signature(settings)
    with _pool_lock:
        if _pool_signature != signature:
            _close_pool_locked()
            _pool_signature = signature
        raw_connection = _connection_pool.pop() if _connection_pool else None
    if raw_connection is None:
        return _open_mysql_connection(settings, with_database=True)
    try:
        raw_connection.ping(reconnect=True)
        return raw_connection
    except Exception:
        try:
            raw_connection.close()
        except Exception:
            pass
        return _open_mysql_connection(settings, with_database=True)


def _release_raw_mysql_connection(settings: Settings, connection) -> None:
    signature = _settings_signature(settings)
    with _pool_lock:
        if _pool_signature != signature or len(_connection_pool) >= settings.mysql_pool_size:
            try:
                connection.close()
            except Exception:
                pass
            return
        _connection_pool.append(connection)


@contextmanager
def get_connection() -> Iterator[MySQLConnectionAdapter]:
    settings = load_settings()
    _ensure_database_exists(settings)
    connection = MySQLConnectionAdapter(_acquire_raw_mysql_connection(settings), settings)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema() -> None:
    global _schema_ready, _ready_signature
    if _schema_ready:
        return
    settings = load_settings()
    _ensure_database_exists(settings)
    with _ready_lock:
        if _ready_signature != _settings_signature(settings):
            _schema_ready = False
        if _schema_ready:
            return
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

                for table_name, index_migrations in SCHEMA_INDEX_MIGRATIONS.items():
                    cursor.execute(
                        """
                        SELECT INDEX_NAME
                        FROM INFORMATION_SCHEMA.STATISTICS
                        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                        """,
                        (settings.mysql_database, table_name),
                    )
                    existing_indexes = {str(row["INDEX_NAME"]) for row in cursor.fetchall()}
                    for index_name, statement in index_migrations.get("add", {}).items():
                        if index_name not in existing_indexes:
                            cursor.execute(statement)
                            existing_indexes.add(index_name)
                    for index_name, statement in index_migrations.get("drop", {}).items():
                        if index_name in existing_indexes:
                            cursor.execute(statement)
                            existing_indexes.discard(index_name)
        _schema_ready = True
