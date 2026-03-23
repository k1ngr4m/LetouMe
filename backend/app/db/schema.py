import re

from backend.app.db.lottery_tables import LOTTERY_SCOPED_TABLES
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS draw_issue (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_no VARCHAR(32) NOT NULL UNIQUE,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        draw_date VARCHAR(32) NULL,
        sales_close_at VARCHAR(64) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_draw_issue_status_date (lottery_code, status, draw_date),
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
    CREATE TABLE IF NOT EXISTS ai_model_lottery (
        model_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL,
        PRIMARY KEY (model_id, lottery_code),
        CONSTRAINT fk_ai_model_lottery_model FOREIGN KEY (model_id) REFERENCES ai_model(id) ON DELETE CASCADE,
        INDEX idx_ai_model_lottery_code (lottery_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS prediction_batch (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        target_issue_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        prediction_date VARCHAR(32) NOT NULL,
        source_type VARCHAR(32) NOT NULL DEFAULT 'script',
        status VARCHAR(32) NOT NULL DEFAULT 'current',
        archived_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_prediction_batch_issue FOREIGN KEY (target_issue_id) REFERENCES draw_issue(id),
        INDEX idx_prediction_batch_status_date (lottery_code, status, prediction_date),
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
        play_type VARCHAR(32) NULL,
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
        INDEX idx_prediction_hit_number_value (hit_summary_id, ball_color, ball_value)
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
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_simulation_ticket_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_simulation_ticket_user_created (user_id, lottery_code, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS my_bet_record (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        target_period VARCHAR(32) NOT NULL,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        multiplier INT NOT NULL DEFAULT 1,
        is_append TINYINT(1) NOT NULL DEFAULT 0,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_my_bet_record_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_user_period (user_id, lottery_code, target_period, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS my_bet_record_line (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        line_no INT NOT NULL DEFAULT 1,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        multiplier INT NOT NULL DEFAULT 1,
        is_append TINYINT(1) NOT NULL DEFAULT 0,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_my_bet_record_line_record FOREIGN KEY (record_id) REFERENCES my_bet_record(id) ON DELETE CASCADE,
        UNIQUE KEY uq_my_bet_record_line_no (record_id, line_no),
        INDEX idx_my_bet_record_line_record (record_id, line_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS my_bet_record_meta (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL UNIQUE,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
        ticket_image_url TEXT NULL,
        ocr_text MEDIUMTEXT NULL,
        ocr_provider VARCHAR(32) NULL,
        ocr_recognized_at DATETIME NULL,
        ticket_purchased_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_my_bet_record_meta_record FOREIGN KEY (record_id) REFERENCES my_bet_record(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_meta_lottery_created (lottery_code, created_at)
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
    """
    CREATE TABLE IF NOT EXISTS scheduled_task (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        task_code VARCHAR(64) NOT NULL UNIQUE,
        task_name VARCHAR(128) NOT NULL,
        task_type VARCHAR(32) NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        model_codes_json TEXT NULL,
        generation_mode VARCHAR(32) NOT NULL DEFAULT 'current',
        overwrite_existing TINYINT(1) NOT NULL DEFAULT 0,
        schedule_mode VARCHAR(32) NOT NULL DEFAULT 'preset',
        preset_type VARCHAR(32) NULL,
        time_of_day VARCHAR(8) NULL,
        weekdays_json VARCHAR(128) NULL,
        cron_expression VARCHAR(128) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        next_run_at DATETIME NULL,
        last_run_at DATETIME NULL,
        last_run_status VARCHAR(32) NULL,
        last_error_message TEXT NULL,
        last_task_id VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scheduled_task_type_active (task_type, is_active),
        INDEX idx_scheduled_task_lottery_active (lottery_code, is_active),
        INDEX idx_scheduled_task_next_run (is_active, next_run_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]

_LOTTERY_SPLIT_SCHEMA_TEMPLATES = [
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_issue (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_no VARCHAR(32) NOT NULL UNIQUE,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        draw_date VARCHAR(32) NULL,
        sales_close_at VARCHAR(64) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_draw_issue_status_date (lottery_code, status, draw_date),
        INDEX idx_draw_issue_draw_date (draw_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_result (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_id BIGINT NOT NULL UNIQUE,
        red_hit_count_rule INT NOT NULL DEFAULT 5,
        blue_hit_count_rule INT NOT NULL DEFAULT 2,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_draw_result_issue FOREIGN KEY (issue_id) REFERENCES {table_prefix}_draw_issue(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_result_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        draw_result_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_position INT NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_{fk_prefix}_draw_result_number_result FOREIGN KEY (draw_result_id) REFERENCES {table_prefix}_draw_result(id) ON DELETE CASCADE,
        UNIQUE KEY uq_draw_result_number_position (draw_result_id, ball_color, ball_position),
        INDEX idx_draw_result_number_color_value (ball_color, ball_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_batch (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        target_issue_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        prediction_date VARCHAR(32) NOT NULL,
        source_type VARCHAR(32) NOT NULL DEFAULT 'script',
        status VARCHAR(32) NOT NULL DEFAULT 'current',
        archived_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_batch_issue FOREIGN KEY (target_issue_id) REFERENCES {table_prefix}_draw_issue(id),
        INDEX idx_prediction_batch_status_date (lottery_code, status, prediction_date),
        INDEX idx_prediction_batch_target_issue (target_issue_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_model_run (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_batch_id BIGINT NOT NULL,
        model_id BIGINT NOT NULL,
        requested_at DATETIME NULL,
        completed_at DATETIME NULL,
        run_status VARCHAR(32) NOT NULL DEFAULT 'success',
        display_order INT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_model_run_batch FOREIGN KEY (prediction_batch_id) REFERENCES {table_prefix}_prediction_batch(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_prediction_model_run_model FOREIGN KEY (model_id) REFERENCES ai_model(id),
        UNIQUE KEY uq_prediction_model_run_batch_model (prediction_batch_id, model_id),
        INDEX idx_prediction_model_run_batch (prediction_batch_id),
        INDEX idx_prediction_model_run_model (model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_group (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL,
        group_no INT NOT NULL,
        play_type VARCHAR(32) NULL,
        strategy_text TEXT NULL,
        description_text TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_group_model_run FOREIGN KEY (model_run_id) REFERENCES {table_prefix}_prediction_model_run(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_group_model_run_group (model_run_id, group_no),
        INDEX idx_prediction_group_model_run (model_run_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_group_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_group_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_position INT NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_{fk_prefix}_prediction_group_number_group FOREIGN KEY (prediction_group_id) REFERENCES {table_prefix}_prediction_group(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_group_number_position (prediction_group_id, ball_color, ball_position),
        INDEX idx_prediction_group_number_color_value (ball_color, ball_value),
        INDEX idx_prediction_group_number_group (prediction_group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_hit_summary (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_group_id BIGINT NOT NULL UNIQUE,
        draw_result_id BIGINT NOT NULL,
        red_hit_count INT NOT NULL DEFAULT 0,
        blue_hit_count INT NOT NULL DEFAULT 0,
        total_hit_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_hit_summary_group FOREIGN KEY (prediction_group_id) REFERENCES {table_prefix}_prediction_group(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_prediction_hit_summary_result FOREIGN KEY (draw_result_id) REFERENCES {table_prefix}_draw_result(id),
        INDEX idx_prediction_hit_summary_result (draw_result_id),
        INDEX idx_prediction_hit_summary_total (total_hit_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_hit_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hit_summary_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_value VARCHAR(8) NOT NULL,
        CONSTRAINT fk_{fk_prefix}_prediction_hit_number_summary FOREIGN KEY (hit_summary_id) REFERENCES {table_prefix}_prediction_hit_summary(id) ON DELETE CASCADE,
        INDEX idx_prediction_hit_number_value (hit_summary_id, ball_color, ball_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_result_prize (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        draw_result_id BIGINT NOT NULL,
        prize_level VARCHAR(32) NOT NULL,
        prize_type VARCHAR(32) NOT NULL DEFAULT 'basic',
        winner_count BIGINT NOT NULL DEFAULT 0,
        prize_amount BIGINT NOT NULL DEFAULT 0,
        total_amount BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_draw_result_prize_result FOREIGN KEY (draw_result_id) REFERENCES {table_prefix}_draw_result(id) ON DELETE CASCADE,
        UNIQUE KEY uq_draw_result_prize_level_type (draw_result_id, prize_level, prize_type),
        INDEX idx_draw_result_prize_result (draw_result_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_model_batch_summary (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL UNIQUE,
        best_group_id BIGINT NULL,
        best_hit_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_model_batch_summary_run FOREIGN KEY (model_run_id) REFERENCES {table_prefix}_prediction_model_run(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_model_batch_summary_group FOREIGN KEY (best_group_id) REFERENCES {table_prefix}_prediction_group(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_simulation_ticket (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_simulation_ticket_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_simulation_ticket_user_created (user_id, lottery_code, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        target_period VARCHAR(32) NOT NULL,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        multiplier INT NOT NULL DEFAULT 1,
        is_append TINYINT(1) NOT NULL DEFAULT 0,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_my_bet_record_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_user_period (user_id, lottery_code, target_period, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record_line (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        line_no INT NOT NULL DEFAULT 1,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        front_numbers VARCHAR(255) NOT NULL,
        back_numbers VARCHAR(255) NOT NULL,
        direct_ten_thousands VARCHAR(255) NULL,
        direct_thousands VARCHAR(255) NULL,
        direct_hundreds VARCHAR(255) NULL,
        direct_tens VARCHAR(255) NULL,
        direct_units VARCHAR(255) NULL,
        group_numbers VARCHAR(255) NULL,
        multiplier INT NOT NULL DEFAULT 1,
        is_append TINYINT(1) NOT NULL DEFAULT 0,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_my_bet_record_line_record FOREIGN KEY (record_id) REFERENCES {table_prefix}_my_bet_record(id) ON DELETE CASCADE,
        UNIQUE KEY uq_my_bet_record_line_no (record_id, line_no),
        INDEX idx_my_bet_record_line_record (record_id, line_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record_meta (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL UNIQUE,
        lottery_code VARCHAR(16) NOT NULL DEFAULT '{lottery_code}',
        source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
        ticket_image_url TEXT NULL,
        ocr_text MEDIUMTEXT NULL,
        ocr_provider VARCHAR(32) NULL,
        ocr_recognized_at DATETIME NULL,
        ticket_purchased_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_my_bet_record_meta_record FOREIGN KEY (record_id) REFERENCES {table_prefix}_my_bet_record(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_meta_lottery_created (lottery_code, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]


for _lottery_code in SUPPORTED_LOTTERY_CODES:
    for _template in _LOTTERY_SPLIT_SCHEMA_TEMPLATES:
        SCHEMA_STATEMENTS.append(
            _template.format(
                table_prefix=_lottery_code,
                fk_prefix=_lottery_code,
                lottery_code=_lottery_code,
            )
        )


SCHEMA_INDEX_MIGRATIONS: dict[str, dict[str, dict[str, str]]] = {
    "draw_result_number": {
        "drop": {
            "uq_draw_result_number_value": "ALTER TABLE draw_result_number DROP INDEX uq_draw_result_number_value",
        },
    },
    "prediction_group_number": {
        "drop": {
            "uq_prediction_group_number_value": "ALTER TABLE prediction_group_number DROP INDEX uq_prediction_group_number_value",
        },
    },
    "prediction_hit_number": {
        "drop": {
            "uq_prediction_hit_number_value": "ALTER TABLE prediction_hit_number DROP INDEX uq_prediction_hit_number_value",
        },
        "add": {
            "idx_prediction_hit_number_value": "ALTER TABLE prediction_hit_number ADD INDEX idx_prediction_hit_number_value (hit_summary_id, ball_color, ball_value)",
        },
    },
}

for _lottery_code in SUPPORTED_LOTTERY_CODES:
    _table_prefix = f"{_lottery_code}_"
    SCHEMA_INDEX_MIGRATIONS[f"{_table_prefix}draw_result_number"] = {
        "drop": {
            "uq_draw_result_number_value": f"ALTER TABLE {_table_prefix}draw_result_number DROP INDEX uq_draw_result_number_value",
        },
    }
    SCHEMA_INDEX_MIGRATIONS[f"{_table_prefix}prediction_group_number"] = {
        "drop": {
            "uq_prediction_group_number_value": f"ALTER TABLE {_table_prefix}prediction_group_number DROP INDEX uq_prediction_group_number_value",
        },
    }
    SCHEMA_INDEX_MIGRATIONS[f"{_table_prefix}prediction_hit_number"] = {
        "drop": {
            "uq_prediction_hit_number_value": f"ALTER TABLE {_table_prefix}prediction_hit_number DROP INDEX uq_prediction_hit_number_value",
        },
        "add": {
            "idx_prediction_hit_number_value": f"ALTER TABLE {_table_prefix}prediction_hit_number ADD INDEX idx_prediction_hit_number_value (hit_summary_id, ball_color, ball_value)",
        },
    }


SCHEMA_MIGRATIONS: dict[str, dict[str, str]] = {
    "app_user": {
        "nickname": "ALTER TABLE app_user ADD COLUMN nickname VARCHAR(128) NULL AFTER username",
    },
    "draw_issue": {
        "lottery_code": "ALTER TABLE draw_issue ADD COLUMN lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt' AFTER issue_no",
    },
    "prediction_batch": {
        "lottery_code": "ALTER TABLE prediction_batch ADD COLUMN lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt' AFTER target_issue_id",
    },
    "prediction_group": {
        "play_type": "ALTER TABLE prediction_group ADD COLUMN play_type VARCHAR(32) NULL AFTER group_no",
    },
    "simulation_ticket": {
        "lottery_code": "ALTER TABLE simulation_ticket ADD COLUMN lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt' AFTER user_id",
        "play_type": "ALTER TABLE simulation_ticket ADD COLUMN play_type VARCHAR(32) NOT NULL DEFAULT 'dlt' AFTER lottery_code",
        "direct_ten_thousands": "ALTER TABLE simulation_ticket ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": "ALTER TABLE simulation_ticket ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
        "direct_hundreds": "ALTER TABLE simulation_ticket ADD COLUMN direct_hundreds VARCHAR(255) NULL AFTER back_numbers",
        "direct_tens": "ALTER TABLE simulation_ticket ADD COLUMN direct_tens VARCHAR(255) NULL AFTER direct_hundreds",
        "direct_units": "ALTER TABLE simulation_ticket ADD COLUMN direct_units VARCHAR(255) NULL AFTER direct_tens",
        "group_numbers": "ALTER TABLE simulation_ticket ADD COLUMN group_numbers VARCHAR(255) NULL AFTER direct_units",
    },
    "my_bet_record": {
        "direct_ten_thousands": "ALTER TABLE my_bet_record ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": "ALTER TABLE my_bet_record ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
    },
    "my_bet_record_line": {
        "direct_ten_thousands": "ALTER TABLE my_bet_record_line ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": "ALTER TABLE my_bet_record_line ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
    },
    "app_permission": {
        "permission_description": "ALTER TABLE app_permission ADD COLUMN permission_description TEXT NULL AFTER permission_name",
    },
    "my_bet_record_meta": {
        "ticket_purchased_at": "ALTER TABLE my_bet_record_meta ADD COLUMN ticket_purchased_at DATETIME NULL AFTER ocr_recognized_at",
    }
}

for _lottery_code in SUPPORTED_LOTTERY_CODES:
    _table_prefix = f"{_lottery_code}_"
    SCHEMA_MIGRATIONS[f"{_table_prefix}my_bet_record_meta"] = {
        "ticket_purchased_at": (
            f"ALTER TABLE {_table_prefix}my_bet_record_meta "
            "ADD COLUMN ticket_purchased_at DATETIME NULL AFTER ocr_recognized_at"
        ),
    }
    SCHEMA_MIGRATIONS[f"{_table_prefix}simulation_ticket"] = {
        "direct_ten_thousands": f"ALTER TABLE {_table_prefix}simulation_ticket ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": f"ALTER TABLE {_table_prefix}simulation_ticket ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
    }
    SCHEMA_MIGRATIONS[f"{_table_prefix}my_bet_record"] = {
        "direct_ten_thousands": f"ALTER TABLE {_table_prefix}my_bet_record ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": f"ALTER TABLE {_table_prefix}my_bet_record ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
    }
    SCHEMA_MIGRATIONS[f"{_table_prefix}my_bet_record_line"] = {
        "direct_ten_thousands": f"ALTER TABLE {_table_prefix}my_bet_record_line ADD COLUMN direct_ten_thousands VARCHAR(255) NULL AFTER back_numbers",
        "direct_thousands": f"ALTER TABLE {_table_prefix}my_bet_record_line ADD COLUMN direct_thousands VARCHAR(255) NULL AFTER direct_ten_thousands",
    }

_CREATE_TABLE_PATTERN = re.compile(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([a-zA-Z0-9_]+)`?", re.IGNORECASE)


def _extract_table_name(statement: str) -> str | None:
    match = _CREATE_TABLE_PATTERN.search(statement)
    return str(match.group(1)) if match else None


def get_schema_statements(*, split_enabled: bool) -> list[str]:
    if not split_enabled:
        return list(SCHEMA_STATEMENTS)
    return [
        statement
        for statement in SCHEMA_STATEMENTS
        if (_extract_table_name(statement) not in LOTTERY_SCOPED_TABLES)
    ]


def get_schema_migrations(*, split_enabled: bool) -> dict[str, dict[str, str]]:
    if not split_enabled:
        return SCHEMA_MIGRATIONS
    return {
        table_name: migrations
        for table_name, migrations in SCHEMA_MIGRATIONS.items()
        if table_name not in LOTTERY_SCOPED_TABLES
    }


def get_schema_index_migrations(*, split_enabled: bool) -> dict[str, dict[str, dict[str, str]]]:
    if not split_enabled:
        return SCHEMA_INDEX_MIGRATIONS
    return {
        table_name: migrations
        for table_name, migrations in SCHEMA_INDEX_MIGRATIONS.items()
        if table_name not in LOTTERY_SCOPED_TABLES
    }
