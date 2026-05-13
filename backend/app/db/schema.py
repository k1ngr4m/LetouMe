from backend.app.lotteries import SUPPORTED_LOTTERY_CODES


SCHEMA_STATEMENTS = [
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
    CREATE TABLE IF NOT EXISTS model_provider (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        provider_code VARCHAR(64) NOT NULL UNIQUE,
        provider_name VARCHAR(128) NOT NULL,
        api_format VARCHAR(64) NOT NULL DEFAULT 'openai_compatible',
        remark TEXT NULL,
        website_url VARCHAR(512) NULL,
        api_key TEXT NULL,
        base_url VARCHAR(512) NULL,
        is_system_preset TINYINT(1) NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS provider_model_config (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        provider_id BIGINT NOT NULL,
        model_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_provider_model_config_provider FOREIGN KEY (provider_id) REFERENCES model_provider(id) ON DELETE CASCADE,
        UNIQUE KEY uq_provider_model_config_unique (provider_id, model_id),
        INDEX idx_provider_model_config_provider_active (provider_id, is_deleted, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS model_provider_option (
        provider_id BIGINT NOT NULL,
        option_key VARCHAR(128) NOT NULL,
        option_value TEXT NULL,
        PRIMARY KEY (provider_id, option_key),
        CONSTRAINT fk_model_provider_option_provider FOREIGN KEY (provider_id) REFERENCES model_provider(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_code VARCHAR(128) NOT NULL UNIQUE,
        display_name VARCHAR(255) NOT NULL,
        provider_model_id BIGINT NOT NULL,
        api_model_name VARCHAR(255) NULL,
        version VARCHAR(64) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        base_url VARCHAR(512) NULL,
        api_key TEXT NULL,
        app_code VARCHAR(255) NULL,
        temperature DOUBLE NULL,
        extra_options_json JSON NULL,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at BIGINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_ai_model_provider_model FOREIGN KEY (provider_model_id) REFERENCES provider_model_config(id),
        INDEX idx_ai_model_provider_model_active (provider_model_id, is_active),
        INDEX idx_ai_model_provider_model (provider_model_id),
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
        new_value_text TEXT NULL,
        CONSTRAINT fk_write_log_detail_log FOREIGN KEY (log_id) REFERENCES write_log(id) ON DELETE CASCADE,
        INDEX idx_write_log_detail_log (log_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS app_user (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(128) NOT NULL UNIQUE,
        email VARCHAR(255) NULL,
        nickname VARCHAR(128) NULL,
        avatar_url VARCHAR(1024) NULL,
        password_hash VARCHAR(255) NOT NULL,
        role_id BIGINT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_app_user_role_active (role_id, is_active),
        CONSTRAINT fk_app_user_role FOREIGN KEY (role_id) REFERENCES app_role(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_email_code (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        purpose VARCHAR(32) NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        attempt_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auth_email_code_lookup (email, purpose, consumed_at),
        INDEX idx_auth_email_code_expires (expires_at)
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
    CREATE TABLE IF NOT EXISTS site_message (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        target_period VARCHAR(32) NOT NULL,
        my_bet_record_id BIGINT NOT NULL,
        message_type VARCHAR(32) NOT NULL DEFAULT 'bet_settlement',
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        snapshot_json JSON NULL,
        read_at DATETIME NULL,
        deleted_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_site_message_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        UNIQUE KEY uq_site_message_unique (user_id, lottery_code, target_period, my_bet_record_id, message_type),
        INDEX idx_site_message_user_created (user_id, created_at),
        INDEX idx_site_message_user_read (user_id, read_at),
        INDEX idx_site_message_user_deleted_created (user_id, deleted_at, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_conversation (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL UNIQUE,
        user_id BIGINT NOT NULL,
        model_code VARCHAR(128) NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        title VARCHAR(255) NOT NULL,
        context_summary VARCHAR(512) NULL,
        context_json JSON NULL,
        last_active_at BIGINT NOT NULL DEFAULT 0,
        deleted_at BIGINT NULL,
        created_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_assistant_conversation_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_assistant_conversation_user_active (user_id, deleted_at, last_active_at),
        INDEX idx_assistant_conversation_model (model_code, lottery_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_message (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        conversation_id BIGINT NOT NULL,
        role VARCHAR(16) NOT NULL,
        content MEDIUMTEXT NOT NULL,
        model_code VARCHAR(128) NOT NULL,
        context_json JSON NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'success',
        error_message TEXT NULL,
        created_at BIGINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_assistant_message_conversation FOREIGN KEY (conversation_id) REFERENCES assistant_conversation(id) ON DELETE CASCADE,
        INDEX idx_assistant_message_conversation_created (conversation_id, created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_task (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        task_code VARCHAR(64) NOT NULL UNIQUE,
        task_name VARCHAR(128) NOT NULL,
        task_type VARCHAR(32) NOT NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        fetch_limit INT NOT NULL DEFAULT 30,
        generation_mode VARCHAR(32) NOT NULL DEFAULT 'current',
        prediction_play_mode VARCHAR(32) NOT NULL DEFAULT 'direct',
        overwrite_existing TINYINT(1) NOT NULL DEFAULT 0,
        schedule_mode VARCHAR(32) NOT NULL DEFAULT 'preset',
        preset_type VARCHAR(32) NULL,
        time_of_day VARCHAR(8) NULL,
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
    """
    CREATE TABLE IF NOT EXISTS scheduled_task_model (
        task_id BIGINT NOT NULL,
        model_id BIGINT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        PRIMARY KEY (task_id, model_id),
        CONSTRAINT fk_scheduled_task_model_task FOREIGN KEY (task_id) REFERENCES scheduled_task(id) ON DELETE CASCADE,
        CONSTRAINT fk_scheduled_task_model_model FOREIGN KEY (model_id) REFERENCES ai_model(id),
        INDEX idx_scheduled_task_model_sort (task_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_task_weekday (
        task_id BIGINT NOT NULL,
        weekday TINYINT NOT NULL,
        PRIMARY KEY (task_id, weekday),
        CONSTRAINT fk_scheduled_task_weekday_task FOREIGN KEY (task_id) REFERENCES scheduled_task(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS maintenance_run_log (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL,
        schedule_task_code VARCHAR(64) NULL,
        lottery_code VARCHAR(16) NOT NULL DEFAULT 'dlt',
        trigger_type VARCHAR(16) NOT NULL DEFAULT 'manual',
        task_type VARCHAR(32) NOT NULL DEFAULT 'lottery_fetch',
        mode VARCHAR(32) NULL,
        model_code VARCHAR(128) NULL,
        status VARCHAR(32) NOT NULL,
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        fetched_count INT NOT NULL DEFAULT 0,
        saved_count INT NOT NULL DEFAULT 0,
        processed_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        latest_period VARCHAR(32) NULL,
        duration_ms DOUBLE NOT NULL DEFAULT 0,
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_maintenance_run_log_task_id (task_id),
        INDEX idx_maintenance_run_log_schedule_created (schedule_task_code, created_at),
        INDEX idx_maintenance_run_log_created (created_at),
        INDEX idx_maintenance_run_log_lottery_created (lottery_code, created_at),
        INDEX idx_maintenance_run_log_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS lottery_bootstrap_checkpoint (
        lottery_code VARCHAR(16) NOT NULL PRIMARY KEY,
        phase VARCHAR(32) NOT NULL DEFAULT 'base',
        last_period VARCHAR(32) NULL,
        base_done TINYINT(1) NOT NULL DEFAULT 0,
        detail_done TINYINT(1) NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lottery_bootstrap_checkpoint_phase (phase, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
]

_LOTTERY_SPLIT_SCHEMA_TEMPLATES = [
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_issue (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_no VARCHAR(32) NOT NULL UNIQUE,
        draw_date DATE NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_draw_issue_status_date (status, draw_date),
        INDEX idx_draw_issue_draw_date (draw_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_draw_result (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_id BIGINT NOT NULL UNIQUE,
        jackpot_pool_balance BIGINT NOT NULL DEFAULT 0,
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
        INDEX idx_draw_result_number_result_order (draw_result_id, ball_color, ball_position, ball_value),
        INDEX idx_draw_result_number_color_value (ball_color, ball_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_batch (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        target_issue_id BIGINT NOT NULL,
        prediction_date DATE NOT NULL,
        source_type VARCHAR(32) NOT NULL DEFAULT 'script',
        status VARCHAR(32) NOT NULL DEFAULT 'current',
        archived_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_batch_issue FOREIGN KEY (target_issue_id) REFERENCES {table_prefix}_draw_issue(id),
        UNIQUE KEY uq_prediction_batch_issue_status (target_issue_id, status),
        INDEX idx_prediction_batch_status_date (status, prediction_date),
        INDEX idx_prediction_batch_target_issue (target_issue_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_model_run (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        prediction_batch_id BIGINT NOT NULL,
        model_id BIGINT NOT NULL,
        prediction_play_mode VARCHAR(32) NOT NULL DEFAULT 'direct',
        completed_at DATETIME NULL,
        run_status VARCHAR(32) NOT NULL DEFAULT 'success',
        display_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_model_run_batch FOREIGN KEY (prediction_batch_id) REFERENCES {table_prefix}_prediction_batch(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_prediction_model_run_model FOREIGN KEY (model_id) REFERENCES ai_model(id),
        UNIQUE KEY uq_prediction_model_run_batch_model_mode (prediction_batch_id, model_id, prediction_play_mode),
        INDEX idx_prediction_model_run_batch (prediction_batch_id),
        INDEX idx_prediction_model_run_batch_order (prediction_batch_id, display_order, id),
        INDEX idx_prediction_model_run_model (model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_group (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL,
        group_no INT NOT NULL,
        play_type VARCHAR(32) NULL,
        sum_value VARCHAR(8) NULL,
        strategy_text TEXT NULL,
        description_text TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_group_model_run FOREIGN KEY (model_run_id) REFERENCES {table_prefix}_prediction_model_run(id) ON DELETE CASCADE,
        UNIQUE KEY uq_prediction_group_model_run_group (model_run_id, group_no),
        INDEX idx_prediction_group_model_run (model_run_id),
        INDEX idx_prediction_group_run_order (model_run_id, group_no, id, play_type, sum_value)
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_prediction_hit_summary_group FOREIGN KEY (prediction_group_id) REFERENCES {table_prefix}_prediction_group(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_prediction_hit_summary_result FOREIGN KEY (draw_result_id) REFERENCES {table_prefix}_draw_result(id),
        INDEX idx_prediction_hit_summary_result (draw_result_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_prediction_hit_number (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hit_summary_id BIGINT NOT NULL,
        ball_color VARCHAR(16) NOT NULL,
        ball_position INT NULL,
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
        INDEX idx_draw_result_prize_result (draw_result_id),
        INDEX idx_draw_result_prize_result_order (draw_result_id, id, prize_level, prize_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_model_batch_summary (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        model_run_id BIGINT NOT NULL UNIQUE,
        best_group_id BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_model_batch_summary_run FOREIGN KEY (model_run_id) REFERENCES {table_prefix}_prediction_model_run(id) ON DELETE CASCADE,
        CONSTRAINT fk_{fk_prefix}_model_batch_summary_group FOREIGN KEY (best_group_id) REFERENCES {table_prefix}_prediction_group(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_simulation_ticket (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_simulation_ticket_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_simulation_ticket_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_simulation_ticket_number (
        ticket_id BIGINT NOT NULL,
        number_role VARCHAR(32) NOT NULL,
        number_position INT NOT NULL,
        number_value VARCHAR(8) NOT NULL,
        PRIMARY KEY (ticket_id, number_role, number_position, number_value),
        CONSTRAINT fk_{fk_prefix}_simulation_ticket_number_ticket FOREIGN KEY (ticket_id) REFERENCES {table_prefix}_simulation_ticket(id) ON DELETE CASCADE,
        INDEX idx_simulation_ticket_number_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        target_period VARCHAR(32) NOT NULL,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
        multiplier INT NOT NULL DEFAULT 1,
        is_append TINYINT(1) NOT NULL DEFAULT 0,
        bet_count INT NOT NULL DEFAULT 0,
        amount INT NOT NULL DEFAULT 0,
        discount_amount INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_my_bet_record_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_user_period (user_id, target_period, created_at),
        INDEX idx_my_bet_record_user_list (user_id, target_period, created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record_line (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        play_type VARCHAR(32) NOT NULL DEFAULT 'dlt',
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
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record_line_number (
        line_id BIGINT NOT NULL,
        number_role VARCHAR(32) NOT NULL,
        number_position INT NOT NULL,
        number_value VARCHAR(8) NOT NULL,
        PRIMARY KEY (line_id, number_role, number_position, number_value),
        CONSTRAINT fk_{fk_prefix}_my_bet_record_line_number_line FOREIGN KEY (line_id) REFERENCES {table_prefix}_my_bet_record_line(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_line_number_line (line_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """,
    """
    CREATE TABLE IF NOT EXISTS {table_prefix}_my_bet_record_meta (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        record_id BIGINT NOT NULL UNIQUE,
        source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
        ticket_image_url TEXT NULL,
        ocr_text MEDIUMTEXT NULL,
        ocr_provider VARCHAR(32) NULL,
        ocr_recognized_at DATETIME NULL,
        ticket_purchased_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_{fk_prefix}_my_bet_record_meta_record FOREIGN KEY (record_id) REFERENCES {table_prefix}_my_bet_record(id) ON DELETE CASCADE,
        INDEX idx_my_bet_record_meta_created (created_at)
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


def get_schema_statements() -> list[str]:
    return list(SCHEMA_STATEMENTS)
