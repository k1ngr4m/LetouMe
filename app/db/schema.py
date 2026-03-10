SCHEMA_STATEMENTS = [
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
