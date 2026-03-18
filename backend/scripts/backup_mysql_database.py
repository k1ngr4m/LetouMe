#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path

from backend.app.logging_utils import get_logger
from backend.scripts.mysql_backup import backup_mysql_database


logger = get_logger("scripts.mysql_backup")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backup MySQL database to SQL file before schema refactor.")
    parser.add_argument("--output-dir", default=None, help="Backup output directory, default is <repo>/backups")
    parser.add_argument("--file-prefix", default="pre_split_backup", help="Backup file prefix")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    backup_file = backup_mysql_database(
        output_dir=Path(args.output_dir) if args.output_dir else None,
        file_prefix=args.file_prefix,
    )
    logger.info("MySQL backup completed", extra={"context": {"backup_file": str(backup_file)}})
    print(str(backup_file))


if __name__ == "__main__":
    main()
