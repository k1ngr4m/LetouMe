SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS data_write_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_key TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload_json TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lottery_draws (
        period TEXT PRIMARY KEY,
        draw_date TEXT,
        red_balls TEXT NOT NULL,
        blue_balls TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS current_predictions (
        target_period TEXT PRIMARY KEY,
        prediction_date TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_history (
        target_period TEXT PRIMARY KEY,
        prediction_date TEXT NOT NULL,
        actual_period TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
]
