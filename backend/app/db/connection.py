from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from threading import Lock
from time import perf_counter
from typing import TYPE_CHECKING, Any, Iterator

from backend.app.config import Settings, load_settings
from backend.app.db.lottery_tables import rewrite_lottery_tables
from backend.app.db.schema import get_schema_statements
from backend.app.db.sqlite_schema import get_sqlite_schema_statements
from backend.app.logging_utils import get_logger

if TYPE_CHECKING:
    import pymysql


logger = get_logger("db")
_db_ready = False
_schema_ready = False
_ready_lock = Lock()
_pool_lock = Lock()
_connection_pool: list[Any] = []
_pool_signature: tuple[Any, ...] | None = None
_ready_signature: tuple[Any, ...] | None = None
_request_metrics: ContextVar[dict[str, float | int]] = ContextVar("db_request_metrics", default={"query_count": 0, "db_time_ms": 0.0})
_SHOW_COLUMNS_PATTERN = re.compile(r"SHOW\s+COLUMNS\s+FROM\s+([a-zA-Z0-9_]+)\s+LIKE\s+'([^']+)'", re.IGNORECASE)


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


def _settings_signature(settings: Settings) -> tuple[Any, ...]:
    if settings.db_driver == "mysql":
        return ("mysql", settings.mysql_host, settings.mysql_port, settings.mysql_user, settings.mysql_database)
    return ("sqlite", str(settings.sqlite_source_path.resolve()))


def get_database_signature() -> tuple[Any, ...]:
    return _settings_signature(load_settings())


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


class MySQLCursorContext:
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
    driver = "mysql"

    def __init__(self, connection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings

    def cursor(self) -> MySQLCursorContext:
        return MySQLCursorContext(self._connection, self._settings)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        _release_raw_mysql_connection(self._settings, self._connection)


class SQLiteCursorContext:
    def __init__(self, connection: sqlite3.Connection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings
        self._cursor: sqlite3.Cursor | None = None

    def __enter__(self):
        self._cursor = self._connection.cursor()
        return SQLiteCursorAdapter(self._cursor, settings=self._settings)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._cursor is not None:
            self._cursor.close()


class SQLiteCursorAdapter:
    def __init__(self, cursor: sqlite3.Cursor, *, settings: Settings) -> None:
        self._cursor = cursor
        self._settings = settings
        self._override_rows: list[dict[str, Any]] | None = None

    @property
    def lastrowid(self) -> int:
        return int(self._cursor.lastrowid or 0)

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    def execute(self, query: str, params: tuple[Any, ...] | list[Any] | None = None) -> int:
        routed_query = rewrite_lottery_tables(query)
        normalized_query = _normalize_sqlite_query(routed_query)
        started_at = perf_counter()
        self._override_rows = None
        try:
            show_columns_match = _SHOW_COLUMNS_PATTERN.fullmatch(" ".join(normalized_query.split()))
            if show_columns_match:
                self._override_rows = _sqlite_show_columns(self._cursor, show_columns_match.group(1), show_columns_match.group(2))
                return len(self._override_rows)
            return self._cursor.execute(normalized_query, params or ()).rowcount
        finally:
            _track_query((perf_counter() - started_at) * 1000, routed_query)

    def executemany(self, query: str, params: list[tuple[Any, ...]]) -> int:
        routed_query = rewrite_lottery_tables(query)
        normalized_query = _normalize_sqlite_query(routed_query)
        started_at = perf_counter()
        try:
            return self._cursor.executemany(normalized_query, params).rowcount
        finally:
            _track_query((perf_counter() - started_at) * 1000, routed_query)

    def fetchone(self) -> dict[str, Any] | None:
        if self._override_rows is not None:
            return self._override_rows.pop(0) if self._override_rows else None
        row = self._cursor.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self) -> list[dict[str, Any]]:
        if self._override_rows is not None:
            rows = self._override_rows
            self._override_rows = []
            return rows
        return [dict(row) for row in self._cursor.fetchall()]


class SQLiteConnectionAdapter:
    driver = "sqlite"

    def __init__(self, connection: sqlite3.Connection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings

    def cursor(self) -> SQLiteCursorContext:
        return SQLiteCursorContext(self._connection, self._settings)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def _normalize_sqlite_query(query: str) -> str:
    normalized = query
    normalized = re.sub(r"\bINSERT\s+IGNORE\s+INTO\b", "INSERT OR IGNORE INTO", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bON\s+DUPLICATE\s+KEY\s+UPDATE\b", "ON CONFLICT DO UPDATE SET", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bVALUES\((`?[a-zA-Z0-9_]+`?)\)", r"excluded.\1", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bLAST_INSERT_ID\(([^)]+)\)", r"\1", normalized, flags=re.IGNORECASE)
    normalized = re.sub(
        r"JSON_UNQUOTE\(\s*JSON_EXTRACT\(([^,]+),\s*'([^']+)'\)\s*\)",
        r"json_extract(\1, '\2')",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\bJSON_EXTRACT\(([^,]+),\s*'([^']+)'\)", r"json_extract(\1, '\2')", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bSIGNED\b", "INTEGER", normalized, flags=re.IGNORECASE)
    return normalized


def _sqlite_show_columns(cursor: sqlite3.Cursor, table_name: str, column_name: str) -> list[dict[str, Any]]:
    cursor.execute(f"PRAGMA table_info({table_name})")
    rows = cursor.fetchall()
    result = []
    for row in rows:
        row_dict = dict(row)
        if str(row_dict.get("name")) == column_name:
            result.append({"Field": row_dict.get("name"), "Type": row_dict.get("type")})
    return result


def _open_sqlite_connection(settings: Settings) -> sqlite3.Connection:
    sqlite_path = settings.sqlite_source_path
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(sqlite_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


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
        if settings.db_driver == "sqlite":
            settings.sqlite_source_path.parent.mkdir(parents=True, exist_ok=True)
            _db_ready = True
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
def get_connection() -> Iterator[MySQLConnectionAdapter | SQLiteConnectionAdapter]:
    settings = load_settings()
    _ensure_database_exists(settings)
    if settings.db_driver == "mysql":
        connection: MySQLConnectionAdapter | SQLiteConnectionAdapter = MySQLConnectionAdapter(_acquire_raw_mysql_connection(settings), settings)
    else:
        connection = SQLiteConnectionAdapter(_open_sqlite_connection(settings), settings)
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
    settings = load_settings()
    signature = _settings_signature(settings)
    if _schema_ready and _ready_signature == signature:
        return
    _ensure_database_exists(settings)
    with _ready_lock:
        if _ready_signature != signature:
            _schema_ready = False
        if _schema_ready:
            return
        with get_connection() as connection:
            with connection.cursor() as cursor:
                schema_statements = get_schema_statements() if settings.db_driver == "mysql" else get_sqlite_schema_statements()
                for statement in schema_statements:
                    cursor.execute(statement)
                _ensure_compat_columns(cursor, settings.db_driver)
        _schema_ready = True


def _ensure_compat_columns(cursor: MySQLCursorAdapter | SQLiteCursorAdapter, db_driver: str) -> None:
    integer_type = "BIGINT" if db_driver == "mysql" else "INTEGER"
    for lottery_code in ("dlt", "pl3", "pl5", "qxc"):
        table_name = f"{lottery_code}_draw_result"
        for column_name in ("sales_amount", "prize_total_amount"):
            cursor.execute(f"SHOW COLUMNS FROM {table_name} LIKE '{column_name}'")
            if cursor.fetchone() is None:
                cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {integer_type} NOT NULL DEFAULT 0")

    text_type = "TEXT"
    json_type = "JSON" if db_driver == "mysql" else "TEXT"
    double_type = "DOUBLE" if db_driver == "mysql" else "REAL"
    datetime_type = "DATETIME" if db_driver == "mysql" else "TEXT"
    worldcup_match_columns = {
        "sporttery_match_id": "VARCHAR(64)" if db_driver == "mysql" else text_type,
        "match_num": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "match_num_str": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "match_num_date": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "tax_date_no": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "league_name": "VARCHAR(128)" if db_driver == "mysql" else text_type,
        "business_date": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "sell_status": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "half_time_score": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "remark": text_type,
        "data_sources_json": json_type,
        "source_updated_at": datetime_type,
    }
    _ensure_table_columns(cursor, "worldcup_match", worldcup_match_columns)
    worldcup_recommendation_columns = {
        "odds_value": "VARCHAR(32)" if db_driver == "mysql" else text_type,
        "implied_probability": double_type,
        "confidence_score": double_type,
        "input_summary_json": json_type,
        "ai_payload_json": json_type,
        "model_code": "VARCHAR(128)" if db_driver == "mysql" else text_type,
        "model_name": "VARCHAR(255)" if db_driver == "mysql" else text_type,
    }
    _ensure_table_columns(cursor, "worldcup_recommendation", worldcup_recommendation_columns)
    worldcup_simulation_ticket_columns = {
        "multiplier": integer_type,
        "note": text_type,
        "source_recommendation_id": "VARCHAR(64)" if db_driver == "mysql" else text_type,
    }
    _ensure_table_columns(cursor, "worldcup_simulation_ticket", worldcup_simulation_ticket_columns)
    worldcup_simulation_item_columns = {
        "odds_snapshot_json": json_type,
        "confidence_level": "VARCHAR(16)" if db_driver == "mysql" else text_type,
    }
    _ensure_table_columns(cursor, "worldcup_simulation_ticket_item", worldcup_simulation_item_columns)


def _ensure_table_columns(cursor: MySQLCursorAdapter | SQLiteCursorAdapter, table_name: str, columns: dict[str, str]) -> None:
    for column_name, column_type in columns.items():
        cursor.execute(f"SHOW COLUMNS FROM {table_name} LIKE '{column_name}'")
        if cursor.fetchone() is None:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type} NULL")
