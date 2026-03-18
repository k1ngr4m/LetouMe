SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS draw_issue (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_no VARCHAR(32) NOT NULL UNIQUE,
        draw_date VARCHAR(32) NULL,
        sales_close_at VARCHAR(64) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_draw_issue_status_date (status, draw_date),
        INDEX idx_draw_issue_draw_date (draw_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS draw_result (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_id BIGINT NOT NULL UNIQUE,
        red_hit_count_rule INT NOT NULL DEFAULT 5,
        blue_hit_count_rule INT NOT NULL DEFAULT 2,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_draw_result_issue FOREIGN KEY (issue_id) REFERENCES draw_issue(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS draw_result_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        draw_result_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_position INT NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_draw_result_number_result FOREIGN KEY (draw_result_id) REFERENCES draw_result(id) ON DELETE CASCADE,
        UNIQUE KEY uq_draw_result_number_position (draw_result_id, ball_color, ball_position),
        UNIQUE KEY uq_draw_result_number_value (draw_result_id, ball_color, ball_value),
        INDEX idx_draw_result_number_color_value (ball_color, ball_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS model_provider (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        provider_code VARCHAR(64) NOT NULL UNIQUE,
        provider_name VARCHAR(128) NOT NULL,
        base_url VARCHAR(512) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_code VARCHAR(128) NOT NULL UNIQUE,
        display_name VARCHAR(255) NOT NULL,
        provider_id BIGINT NOT NULL,
        api_model_name VARCHAR(255) NULL,
        version VARCHAR(64) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        base_url VARCHAR(512) NULL,
        api_key TEXT NULL,
        app_code VARCHAR(255) NULL,
        temperature DOUBLE NULL,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_model_provider FOREIGN KEY (provider_id) REFERENCES model_provider(id),
        INDEX idx_ai_model_provider_active (provider_id, is_active),
        INDEX idx_ai_model_deleted_active (is_deleted, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS model_tag (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tag_code VARCHAR(128) NOT NULL UNIQUE,
        tag_name VARCHAR(128) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model_tag (
        model_id BIGINT NOT NULL,
        tag_id BIGINT NOT NULL,
        PRIMARY KEY (model_id, tag_id),
        CONSTRAINT fk_ai_model_tag_model FOREIGN KEY (model_id) REFERENCES ai_model(id) ON DELETE CASCADE,
        CONSTRAINT fk_ai_model_tag_tag FOREIGN KEY (tag_id) REFERENCES model_tag(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_batch (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        target_issue_id BIGINT NOT NULL,
        prediction_date VARCHAR(32) NOT NULL,
        source_type VARCHAR(32) NOT NULL DEFAULT 'script',
        status VARCHAR(32) NOT NULL DEFAULT 'current',
        archived_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_prediction_batch_issue FOREIGN KEY (target_issue_id) REFERENCES draw_issue(id),
        INDEX idx_prediction_batch_status_date (status, prediction_date),
        INDEX idx_prediction_batch_target_issue (target_issue_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_model_run (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_batch_id BIGINT NOT NULL,
        model_id BIGINT NOT NULL,
        requested_at DATETIME NULL,
        completed_at DATETIME NULL,
        run_status VARCHAR(32) NOT NULL DEFAULT 'success',
        display_order INT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_prediction_model_run_batch FOREIGN KEY (prediction_batch_id) REFERENCES prediction_batch(id) ON DELETE CASCADE,
        CONSTRAINT fk_prediction_model_run_model FOREIGN KEY (model_id) REFERENCES ai_model(id),
        UNIQUE KEY uq_prediction_model_run_batch_model (prediction_batch_id, model_id),
        INDEX idx_prediction_model_run_batch (prediction_batch_id),
        INDEX idx_prediction_model_run_model (model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_group (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL,
        group_no INT NOT NULL,
        strategy_text TEXT NULL,
        description_text TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_prediction_group_model_run FOREIGN KEY (model_run_id) REFERENCES prediction_model_run(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_group_model_run_group (model_run_id, group_no),
        INDEX idx_prediction_group_model_run (model_run_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_group_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_group_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_position INT NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_prediction_group_number_group FOREIGN KEY (prediction_group_id) REFERENCES prediction_group(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_group_number_position (prediction_group_id, ball_color, ball_position),
        UNIQUE KEY uq_prediction_group_number_value (prediction_group_id, ball_color, ball_value),
        INDEX idx_prediction_group_number_color_value (ball_color, ball_value),
        INDEX idx_prediction_group_number_group (prediction_group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_hit_summary (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_group_id BIGINT NOT NULL UNIQUE,
        draw_result_id BIGINT NOT NULL,
        red_hit_count INT NOT NULL DEFAULT 0,
        blue_hit_count INT NOT NULL DEFAULT 0,
        total_hit_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_prediction_hit_summary_group FOREIGN KEY (prediction_group_id) REFERENCES prediction_group(id) ON DELETE CASCADE,
        CONSTRAINT fk_prediction_hit_summary_result FOREIGN KEY (draw_result_id) REFERENCES draw_result(id),
        INDEX idx_prediction_hit_summary_result (draw_result_id),
        INDEX idx_prediction_hit_summary_total (total_hit_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_hit_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hit_summary_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_prediction_hit_number_summary FOREIGN KEY (hit_summary_id) REFERENCES prediction_hit_summary(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_hit_number_value (hit_summary_id, ball_color, ball_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS draw_result_prize (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        draw_result_id BIGINT NOT NULL,
        prize_level VARCHAR(32) NOT NULL,
        prize_type VARCHAR(32) NOT NULL DEFAULT 'basic',
        winner_count BIGINT NOT NULL DEFAULT 0,
        prize_amount BIGINT NOT NULL DEFAULT 0,
        total_amount BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_draw_result_prize_result FOREIGN KEY (draw_result_id) REFERENCES draw_result(id) ON DELETE CASCADE,
        UNIQUE KEY uq_draw_result_prize_level_type (draw_result_id, prize_level, prize_type),
        INDEX idx_draw_result_prize_result (draw_result_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS model_batch_summary (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL UNIQUE,
        best_group_id BIGINT NULL,
        best_hit_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_model_batch_summary_run FOREIGN KEY (model_run_id) REFERENCES prediction_model_run(id) ON DELETE CASCADE,
        CONSTRAINT fk_model_batch_summary_group FOREIGN KEY (best_group_id) REFERENCES prediction_group(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(128) NULL,
        table_name VARCHAR(64) NOT NULL,
        action VARCHAR(32) NOT NULL,
        target_key VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL,
        summary TEXT NOT NULL,
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_write_log_table_created (table_name, created_at),
        INDEX idx_write_log_status_created (status, created_at),
        INDEX idx_write_log_target_key (target_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log_detail (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        log_id BIGINT NOT NULL,
        field_name VARCHAR(128) NOT NULL,
        old_value_text TEXT NULL,
        new_value_text TEXT NULL,
        CONSTRAINT fk_write_log_detail_log FOREIGN KEY (log_id) REFERENCES write_log(id) ON DELETE CASCADE,
        INDEX idx_write_log_detail_log (log_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS app_user (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(128) NOT NULL UNIQUE,
        nickname VARCHAR(128) NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_app_user_role_active (role, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS user_session (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_agent VARCHAR(255) NULL,
        ip_address VARCHAR(64) NULL,
        CONSTRAINT fk_user_session_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_user_session_user (user_id),
        INDEX idx_user_session_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS simulation_ticket (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_simulation_ticket_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_simulation_ticket_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS app_role (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        role_code VARCHAR(64) NOT NULL UNIQUE,
        role_name VARCHAR(128) NOT NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS app_permission (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        permission_code VARCHAR(64) NOT NULL UNIQUE,
        permission_name VARCHAR(128) NOT NULL,
        permission_description TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS app_role_permission (
        role_id BIGINT NOT NULL,
        permission_id BIGINT NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        CONSTRAINT fk_app_role_permission_role FOREIGN KEY (role_id) REFERENCES app_role(id) ON DELETE CASCADE,
        CONSTRAINT fk_app_role_permission_permission FOREIGN KEY (permission_id) REFERENCES app_permission(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]


SCHEMA_MIGRATIONS: dict[str, dict[str, str]] = {
    "app_user": {
        "nickname": "ALTER TABLE app_user ADD COLUMN nickname VARCHAR(128) NULL AFTER username",
    },
    "app_permission": {
        "permission_description": "ALTER TABLE app_permission ADD COLUMN permission_description TEXT NULL AFTER permission_name",
    }
}
