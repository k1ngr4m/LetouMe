from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from backend.app.config import REPO_ROOT, load_settings
from backend.app.logging_utils import get_logger
from backend.scripts.mysql_backup import backup_mysql_database


logger = get_logger("scripts.clone_mysql_database")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clone a MySQL schema into a temporary development schema.")
    parser.add_argument("--source-db", default=None, help="Source schema name. Defaults to current MYSQL_DATABASE.")
    parser.add_argument("--target-db", default=None, help="Target schema name. Defaults to <source>_dev.")
    parser.add_argument("--replace", action="store_true", help="Drop and recreate the target schema if it already exists.")
    parser.add_argument("--skip-backup", action="store_true", help="Skip source backup before cloning.")
    return parser.parse_args()


def _load_pymysql():
    try:
        import pymysql  # type: ignore
        from pymysql.cursors import DictCursor  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError("PyMySQL is required. Install it with `pip install pymysql`.") from exc
    return pymysql, DictCursor


def _open_server_connection(settings):
    pymysql, DictCursor = _load_pymysql()
    return pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


def _backup_source_database(source_db: str) -> Path:
    settings = load_settings()
    if source_db == settings.mysql_database:
        return backup_mysql_database(file_prefix=f"pre_clone_{source_db}")

    pymysql, _ = _load_pymysql()
    backup_root = REPO_ROOT / "backups"
    backup_root.mkdir(parents=True, exist_ok=True)
    backup_path = backup_root / f"pre_clone_{source_db}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    connection = pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=source_db,
        charset="utf8mb4",
        autocommit=True,
        cursorclass=pymysql.cursors.Cursor,
    )
    try:
        with backup_path.open("w", encoding="utf-8") as output:
            output.write(f"-- Backup for {source_db}\n")
            output.write("SET FOREIGN_KEY_CHECKS = 0;\n")
            with connection.cursor() as cursor:
                cursor.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
                table_names = [str(row[0]) for row in cursor.fetchall()]
                for table_name in table_names:
                    cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
                    create_sql = str(cursor.fetchone()[1])
                    output.write(f"\nDROP TABLE IF EXISTS `{table_name}`;\n")
                    output.write(f"{create_sql};\n")
                    cursor.execute(f"SELECT * FROM `{table_name}`")
                    rows = cursor.fetchall()
                    column_names = [str(desc[0]) for desc in (cursor.description or [])]
                    if not rows or not column_names:
                        continue
                    column_sql = ", ".join(f"`{column}`" for column in column_names)
                    for row in rows:
                        values_sql = ", ".join(str(connection.escape(value)) if value is not None else "NULL" for value in row)
                        output.write(f"INSERT INTO `{table_name}` ({column_sql}) VALUES ({values_sql});\n")
            output.write("SET FOREIGN_KEY_CHECKS = 1;\n")
    finally:
        connection.close()
    return backup_path


def _fetch_table_names(cursor, schema_name: str) -> list[str]:
    cursor.execute(
        """
        SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC
        """,
        (schema_name,),
    )
    return [str(row["table_name"]) for row in cursor.fetchall()]


def clone_mysql_database(*, source_db: str, target_db: str, replace: bool) -> dict[str, int]:
    settings = load_settings()
    connection = _open_server_connection(settings)
    try:
        with connection.cursor() as cursor:
            source_tables = _fetch_table_names(cursor, source_db)
            if not source_tables:
                raise RuntimeError(f"源数据库为空或不存在: {source_db}")
            cursor.execute("SELECT SCHEMA_NAME AS schema_name FROM information_schema.schemata WHERE schema_name = %s", (target_db,))
            target_exists = cursor.fetchone() is not None
            if target_exists and not replace:
                raise RuntimeError(f"目标数据库已存在: {target_db}，如需覆盖请使用 --replace")
            if target_exists and replace:
                cursor.execute(f"DROP DATABASE `{target_db}`")
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{target_db}` "
                "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table_name in source_tables:
                cursor.execute(f"CREATE TABLE `{target_db}`.`{table_name}` LIKE `{source_db}`.`{table_name}`")
            for table_name in source_tables:
                cursor.execute(
                    f"INSERT INTO `{target_db}`.`{table_name}` SELECT * FROM `{source_db}`.`{table_name}`"
                )
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
            connection.commit()

            copied_tables = _fetch_table_names(cursor, target_db)
            if copied_tables != source_tables:
                raise RuntimeError("目标数据库表结构校验失败")

            for table_name in source_tables:
                cursor.execute(f"SELECT COUNT(*) AS total FROM `{source_db}`.`{table_name}`")
                source_count = int(cursor.fetchone()["total"])
                cursor.execute(f"SELECT COUNT(*) AS total FROM `{target_db}`.`{table_name}`")
                target_count = int(cursor.fetchone()["total"])
                if source_count != target_count:
                    raise RuntimeError(f"表行数校验失败: {table_name} ({source_count} != {target_count})")

        return {"table_count": len(source_tables)}
    finally:
        connection.close()


def main() -> None:
    args = _parse_args()
    settings = load_settings()
    source_db = str(args.source_db or settings.mysql_database).strip()
    target_db = str(args.target_db or f"{source_db}_dev").strip()

    if not args.skip_backup:
        backup_path = _backup_source_database(source_db)
        logger.info("MySQL backup completed before clone", extra={"context": {"backup_file": str(backup_path)}})

    result = clone_mysql_database(source_db=source_db, target_db=target_db, replace=bool(args.replace))
    logger.info(
        "MySQL clone completed",
        extra={"context": {"source_db": source_db, "target_db": target_db, **result}},
    )
    print(target_db)


if __name__ == "__main__":
    main()
