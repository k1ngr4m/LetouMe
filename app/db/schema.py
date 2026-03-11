SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS data_write_logs (
        id BIGSERIAL PRIMARY KEY,
        table_name VARCHAR(64) NOT NULL,
        action VARCHAR(32) NOT NULL,
        target_key VARCHAR(128) NOT NULL,
        summary TEXT NOT NULL,
        payload_json JSONB,
        status VARCHAR(16) NOT NULL,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE data_write_logs
    ADD COLUMN IF NOT EXISTS payload_json JSONB
    """,
    """
    CREATE TABLE IF NOT EXISTS lottery_draws (
        period VARCHAR(16) PRIMARY KEY,
        draw_date DATE,
        red_balls JSONB NOT NULL,
        blue_balls JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE lottery_draws
    DROP COLUMN IF EXISTS blue_ball
    """,
    """
    CREATE TABLE IF NOT EXISTS current_predictions (
        target_period VARCHAR(16) PRIMARY KEY,
        prediction_date DATE NOT NULL,
        payload_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_history (
        target_period VARCHAR(16) PRIMARY KEY,
        prediction_date DATE NOT NULL,
        actual_period VARCHAR(16) NOT NULL,
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
]
