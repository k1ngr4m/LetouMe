from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg2
from psycopg2.extras import RealDictCursor

from app.config import load_settings
from app.db.schema import SCHEMA_STATEMENTS


@contextmanager
def get_connection() -> Iterator[psycopg2.extensions.connection]:
    settings = load_settings()
    connection = psycopg2.connect(settings.database_dsn, cursor_factory=RealDictCursor)
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
            for statement in SCHEMA_STATEMENTS:
                cursor.execute(statement)
