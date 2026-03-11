SCHEMA_STATEMENTS = [
    "PRAGMA foreign_keys = ON",
    """
    CREATE TABLE IF NOT EXISTS draw_issue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_no TEXT NOT NULL UNIQUE,
        draw_date TEXT,
        sales_close_at TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_draw_issue_status_date
    ON draw_issue (status, draw_date DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_draw_issue_draw_date
    ON draw_issue (draw_date)
    """,
    """
    CREATE TABLE IF NOT EXISTS draw_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL UNIQUE,
        red_hit_count_rule INTEGER NOT NULL DEFAULT 5,
        blue_hit_count_rule INTEGER NOT NULL DEFAULT 2,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES draw_issue(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS draw_result_number (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        draw_result_id INTEGER NOT NULL,
        ball_color TEXT NOT NULL,
        ball_position INTEGER NOT NULL,
        ball_value TEXT NOT NULL,
        FOREIGN KEY (draw_result_id) REFERENCES draw_result(id) ON DELETE CASCADE,
        UNIQUE (draw_result_id, ball_color, ball_position),
        UNIQUE (draw_result_id, ball_color, ball_value)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_draw_result_number_color_value
    ON draw_result_number (ball_color, ball_value)
    """,
    """
    CREATE TABLE IF NOT EXISTS model_provider (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_code TEXT NOT NULL UNIQUE,
        provider_name TEXT NOT NULL,
        base_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        provider_id INTEGER NOT NULL,
        api_model_name TEXT,
        version TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        base_url TEXT,
        api_key TEXT,
        app_code TEXT,
        temperature REAL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES model_provider(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_provider_active
    ON ai_model (provider_id, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_deleted_active
    ON ai_model (is_deleted, is_active)
    """,
    """
    CREATE TABLE IF NOT EXISTS model_tag (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_code TEXT NOT NULL UNIQUE,
        tag_name TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model_tag (
        model_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (model_id, tag_id),
        FOREIGN KEY (model_id) REFERENCES ai_model(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES model_tag(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_issue_id INTEGER NOT NULL,
        prediction_date TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'script',
        status TEXT NOT NULL DEFAULT 'current',
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_issue_id) REFERENCES draw_issue(id)
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_batch_current_issue
    ON prediction_batch (target_issue_id)
    WHERE status = 'current'
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_batch_status_date
    ON prediction_batch (status, prediction_date DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_batch_target_issue
    ON prediction_batch (target_issue_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_model_run (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_batch_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        requested_at TEXT,
        completed_at TEXT,
        run_status TEXT NOT NULL DEFAULT 'success',
        display_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prediction_batch_id) REFERENCES prediction_batch(id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES ai_model(id),
        UNIQUE (prediction_batch_id, model_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_model_run_batch
    ON prediction_model_run (prediction_batch_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_model_run_model
    ON prediction_model_run (model_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_group (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_run_id INTEGER NOT NULL,
        group_no INTEGER NOT NULL,
        strategy_text TEXT,
        description_text TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_run_id) REFERENCES prediction_model_run(id) ON DELETE CASCADE,
        UNIQUE (model_run_id, group_no)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_group_model_run
    ON prediction_group (model_run_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_group_number (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_group_id INTEGER NOT NULL,
        ball_color TEXT NOT NULL,
        ball_position INTEGER NOT NULL,
        ball_value TEXT NOT NULL,
        FOREIGN KEY (prediction_group_id) REFERENCES prediction_group(id) ON DELETE CASCADE,
        UNIQUE (prediction_group_id, ball_color, ball_position),
        UNIQUE (prediction_group_id, ball_color, ball_value)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_group_number_color_value
    ON prediction_group_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_group_number_group
    ON prediction_group_number (prediction_group_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_hit_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_group_id INTEGER NOT NULL UNIQUE,
        draw_result_id INTEGER NOT NULL,
        red_hit_count INTEGER NOT NULL DEFAULT 0,
        blue_hit_count INTEGER NOT NULL DEFAULT 0,
        total_hit_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prediction_group_id) REFERENCES prediction_group(id) ON DELETE CASCADE,
        FOREIGN KEY (draw_result_id) REFERENCES draw_result(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_hit_summary_result
    ON prediction_hit_summary (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_prediction_hit_summary_total
    ON prediction_hit_summary (total_hit_count)
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_hit_number (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hit_summary_id INTEGER NOT NULL,
        ball_color TEXT NOT NULL,
        ball_value TEXT NOT NULL,
        FOREIGN KEY (hit_summary_id) REFERENCES prediction_hit_summary(id) ON DELETE CASCADE,
        UNIQUE (hit_summary_id, ball_color, ball_value)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS model_batch_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_run_id INTEGER NOT NULL UNIQUE,
        best_group_id INTEGER,
        best_hit_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_run_id) REFERENCES prediction_model_run(id) ON DELETE CASCADE,
        FOREIGN KEY (best_group_id) REFERENCES prediction_group(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_key TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_table_created
    ON write_log (table_name, created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_status_created
    ON write_log (status, created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_target_key
    ON write_log (target_key)
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log_detail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id INTEGER NOT NULL,
        field_name TEXT NOT NULL,
        old_value_text TEXT,
        new_value_text TEXT,
        FOREIGN KEY (log_id) REFERENCES write_log(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_detail_log
    ON write_log_detail (log_id)
    """,
]


SCHEMA_MIGRATIONS = {
    "ai_model": {
        "base_url": "ALTER TABLE ai_model ADD COLUMN base_url TEXT",
        "api_key": "ALTER TABLE ai_model ADD COLUMN api_key TEXT",
        "app_code": "ALTER TABLE ai_model ADD COLUMN app_code TEXT",
        "temperature": "ALTER TABLE ai_model ADD COLUMN temperature REAL",
        "is_deleted": "ALTER TABLE ai_model ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
    }
}
