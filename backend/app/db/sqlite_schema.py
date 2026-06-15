SQLITE_SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS app_role (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_code TEXT NOT NULL UNIQUE,
            role_name TEXT NOT NULL,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_permission (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            permission_code TEXT NOT NULL UNIQUE,
            permission_name TEXT NOT NULL,
            permission_description TEXT NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_role_permission (
            role_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            PRIMARY KEY (role_id, permission_id),
            FOREIGN KEY (role_id) REFERENCES app_role(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES app_permission(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS model_provider (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_code TEXT NOT NULL UNIQUE,
            provider_name TEXT NOT NULL,
            api_format TEXT NOT NULL DEFAULT 'openai_compatible',
            remark TEXT NULL,
            website_url TEXT NULL,
            api_key TEXT NULL,
            base_url TEXT NULL,
            is_system_preset INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS provider_model_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_id INTEGER NOT NULL,
            model_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES model_provider(id) ON DELETE CASCADE,
            UNIQUE (provider_id, model_id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS model_provider_option (
            provider_id INTEGER NOT NULL,
            option_key TEXT NOT NULL,
            option_value TEXT NULL,
            PRIMARY KEY (provider_id, option_key),
            FOREIGN KEY (provider_id) REFERENCES model_provider(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_model (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_code TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            provider_model_id INTEGER NOT NULL,
            api_model_name TEXT NULL,
            version TEXT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            base_url TEXT NULL,
            api_key TEXT NULL,
            app_code TEXT NULL,
            temperature REAL NULL,
            extra_options_json TEXT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (provider_model_id) REFERENCES provider_model_config(id)
        )
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
    CREATE TABLE IF NOT EXISTS ai_model_lottery (
            model_id INTEGER NOT NULL,
            lottery_code TEXT NOT NULL,
            PRIMARY KEY (model_id, lottery_code),
            FOREIGN KEY (model_id) REFERENCES ai_model(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NULL,
            table_name TEXT NOT NULL,
            action TEXT NOT NULL,
            target_key TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            error_message TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS write_log_detail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            new_value_text TEXT NULL,
            FOREIGN KEY (log_id) REFERENCES write_log(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NULL,
            nickname TEXT NULL,
            avatar_url TEXT NULL,
            password_hash TEXT NOT NULL,
            role_id INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_login_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (role_id) REFERENCES app_role(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_email_code (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            purpose TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS user_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT NULL,
            ip_address TEXT NULL,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS site_message (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lottery_code TEXT NOT NULL DEFAULT 'dlt',
            target_period TEXT NOT NULL,
            my_bet_record_id INTEGER NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'bet_settlement',
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            snapshot_json TEXT NULL,
            read_at TEXT NULL,
            deleted_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
            UNIQUE (user_id, lottery_code, target_period, my_bet_record_id, message_type)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_match (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id TEXT NOT NULL UNIQUE,
            sporttery_match_id TEXT NULL,
            match_num TEXT NULL,
            match_num_str TEXT NULL,
            match_num_date TEXT NULL,
            tax_date_no TEXT NULL,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            kickoff_at TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT '世界杯',
            league_name TEXT NULL,
            business_date TEXT NULL,
            sell_status TEXT NULL,
            match_status TEXT NOT NULL DEFAULT 'scheduled',
            score TEXT NULL,
            remark TEXT NULL,
            data_sources_json TEXT NULL,
            source_updated_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_odds_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            odds_id TEXT NOT NULL UNIQUE,
            match_id TEXT NOT NULL,
            play_type TEXT NOT NULL,
            odds_json TEXT NOT NULL,
            goal_line TEXT NULL,
            single_status TEXT NULL,
            sell_status TEXT NULL,
            source TEXT NOT NULL DEFAULT 'sporttery',
            source_updated_at TEXT NULL,
            fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES worldcup_match(match_id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_recommendation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recommendation_id TEXT NOT NULL UNIQUE,
            match_id TEXT NOT NULL,
            play_type TEXT NOT NULL,
            selection TEXT NOT NULL,
            odds_value TEXT NULL,
            implied_probability REAL NULL,
            confidence_level TEXT NOT NULL DEFAULT 'medium',
            risk_level TEXT NOT NULL DEFAULT 'medium',
            budget_min INTEGER NOT NULL DEFAULT 0,
            budget_max INTEGER NOT NULL DEFAULT 0,
            reason TEXT NOT NULL,
            input_summary_json TEXT NULL,
            ai_payload_json TEXT NULL,
            model_code TEXT NULL,
            model_name TEXT NULL,
            model_sources_json TEXT NULL,
            risk_tags_json TEXT NULL,
            status TEXT NOT NULL DEFAULT 'published',
            compliance_notice TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES worldcup_match(match_id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_favorite (
            user_id INTEGER NOT NULL,
            recommendation_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, recommendation_id),
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
            FOREIGN KEY (recommendation_id) REFERENCES worldcup_recommendation(recommendation_id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_simulation_ticket (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            total_amount INTEGER NOT NULL DEFAULT 0,
            multiplier INTEGER NOT NULL DEFAULT 1,
            note TEXT NULL,
            source_recommendation_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
            FOREIGN KEY (source_recommendation_id) REFERENCES worldcup_recommendation(recommendation_id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS worldcup_simulation_ticket_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            match_id TEXT NOT NULL,
            recommendation_id TEXT NULL,
            play_type TEXT NOT NULL,
            selection TEXT NOT NULL,
            odds_value TEXT NULL,
            odds_snapshot_json TEXT NULL,
            confidence_level TEXT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES worldcup_simulation_ticket(id) ON DELETE CASCADE,
            FOREIGN KEY (match_id) REFERENCES worldcup_match(match_id) ON DELETE CASCADE,
            FOREIGN KEY (recommendation_id) REFERENCES worldcup_recommendation(recommendation_id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_conversation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            model_code TEXT NOT NULL,
            lottery_code TEXT NOT NULL DEFAULT 'dlt',
            title TEXT NOT NULL,
            context_summary TEXT NULL,
            context_json TEXT NULL,
            last_active_at INTEGER NOT NULL DEFAULT 0,
            deleted_at INTEGER NULL,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_message (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            model_code TEXT NOT NULL,
            context_json TEXT NULL,
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT NULL,
            created_at INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (conversation_id) REFERENCES assistant_conversation(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_task (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_code TEXT NOT NULL UNIQUE,
            task_name TEXT NOT NULL,
            task_type TEXT NOT NULL,
            lottery_code TEXT NOT NULL DEFAULT 'dlt',
            fetch_limit INTEGER NOT NULL DEFAULT 30,
            generation_mode TEXT NOT NULL DEFAULT 'current',
            prediction_play_mode TEXT NOT NULL DEFAULT 'direct',
            overwrite_existing INTEGER NOT NULL DEFAULT 0,
            schedule_mode TEXT NOT NULL DEFAULT 'preset',
            preset_type TEXT NULL,
            time_of_day TEXT NULL,
            cron_expression TEXT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            next_run_at TEXT NULL,
            last_run_at TEXT NULL,
            last_run_status TEXT NULL,
            last_error_message TEXT NULL,
            last_task_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_task_model (
            task_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (task_id, model_id),
            FOREIGN KEY (task_id) REFERENCES scheduled_task(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES ai_model(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS scheduled_task_weekday (
            task_id INTEGER NOT NULL,
            weekday INTEGER NOT NULL,
            PRIMARY KEY (task_id, weekday),
            FOREIGN KEY (task_id) REFERENCES scheduled_task(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS maintenance_run_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            schedule_task_code TEXT NULL,
            lottery_code TEXT NOT NULL DEFAULT 'dlt',
            trigger_type TEXT NOT NULL DEFAULT 'manual',
            task_type TEXT NOT NULL DEFAULT 'lottery_fetch',
            mode TEXT NULL,
            model_code TEXT NULL,
            status TEXT NOT NULL,
            started_at TEXT NULL,
            finished_at TEXT NULL,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            saved_count INTEGER NOT NULL DEFAULT 0,
            processed_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            latest_period TEXT NULL,
            duration_ms REAL NOT NULL DEFAULT 0,
            error_message TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (task_id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS lottery_bootstrap_checkpoint (
            lottery_code TEXT NOT NULL PRIMARY KEY,
            phase TEXT NOT NULL DEFAULT 'base',
            last_period TEXT NULL,
            base_done INTEGER NOT NULL DEFAULT 0,
            detail_done INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_lottery_bootstrap_checkpoint_phase ON lottery_bootstrap_checkpoint (phase, updated_at)
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_draw_issue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_no TEXT NOT NULL UNIQUE,
            draw_date TEXT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_draw_result (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL UNIQUE,
            jackpot_pool_balance INTEGER NOT NULL DEFAULT 0,
            sales_amount INTEGER NOT NULL DEFAULT 0,
            prize_total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (issue_id) REFERENCES dlt_draw_issue(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_draw_result_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (draw_result_id) REFERENCES dlt_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_batch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_issue_id INTEGER NOT NULL,
            prediction_date TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'script',
            status TEXT NOT NULL DEFAULT 'current',
            archived_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (target_issue_id) REFERENCES dlt_draw_issue(id),
            UNIQUE (target_issue_id, status)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_model_run (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_batch_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            prediction_play_mode TEXT NOT NULL DEFAULT 'direct',
            completed_at TEXT NULL,
            run_status TEXT NOT NULL DEFAULT 'success',
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_batch_id) REFERENCES dlt_prediction_batch(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES ai_model(id),
            UNIQUE (prediction_batch_id, model_id, prediction_play_mode)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_group (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL,
            group_no INTEGER NOT NULL,
            play_type TEXT NULL,
            sum_value TEXT NULL,
            strategy_text TEXT NULL,
            description_text TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES dlt_prediction_model_run(id) ON DELETE CASCADE,
            UNIQUE (model_run_id, group_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_group_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (prediction_group_id) REFERENCES dlt_prediction_group(id) ON DELETE CASCADE,
            UNIQUE (prediction_group_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_hit_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL UNIQUE,
            draw_result_id INTEGER NOT NULL,
            red_hit_count INTEGER NOT NULL DEFAULT 0,
            blue_hit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_group_id) REFERENCES dlt_prediction_group(id) ON DELETE CASCADE,
            FOREIGN KEY (draw_result_id) REFERENCES dlt_draw_result(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_prediction_hit_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hit_summary_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (hit_summary_id) REFERENCES dlt_prediction_hit_summary(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_draw_result_prize (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            prize_level TEXT NOT NULL,
            prize_type TEXT NOT NULL DEFAULT 'basic',
            winner_count INTEGER NOT NULL DEFAULT 0,
            prize_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (draw_result_id) REFERENCES dlt_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, prize_level, prize_type)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_model_batch_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL UNIQUE,
            best_group_id INTEGER NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES dlt_prediction_model_run(id) ON DELETE CASCADE,
            FOREIGN KEY (best_group_id) REFERENCES dlt_prediction_group(id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_simulation_ticket (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_simulation_ticket_number (
            ticket_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (ticket_id, number_role, number_position, number_value),
            FOREIGN KEY (ticket_id) REFERENCES dlt_simulation_ticket(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_my_bet_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            target_period TEXT NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            discount_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_my_bet_record_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            line_no INTEGER NOT NULL DEFAULT 1,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES dlt_my_bet_record(id) ON DELETE CASCADE,
            UNIQUE (record_id, line_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_my_bet_record_line_number (
            line_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (line_id, number_role, number_position, number_value),
            FOREIGN KEY (line_id) REFERENCES dlt_my_bet_record_line(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS dlt_my_bet_record_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'manual',
            ticket_image_url TEXT NULL,
            ocr_text TEXT NULL,
            ocr_provider TEXT NULL,
            ocr_recognized_at TEXT NULL,
            ticket_purchased_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES dlt_my_bet_record(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_draw_issue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_no TEXT NOT NULL UNIQUE,
            draw_date TEXT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_draw_result (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL UNIQUE,
            jackpot_pool_balance INTEGER NOT NULL DEFAULT 0,
            sales_amount INTEGER NOT NULL DEFAULT 0,
            prize_total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (issue_id) REFERENCES pl3_draw_issue(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_draw_result_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (draw_result_id) REFERENCES pl3_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_batch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_issue_id INTEGER NOT NULL,
            prediction_date TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'script',
            status TEXT NOT NULL DEFAULT 'current',
            archived_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (target_issue_id) REFERENCES pl3_draw_issue(id),
            UNIQUE (target_issue_id, status)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_model_run (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_batch_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            prediction_play_mode TEXT NOT NULL DEFAULT 'direct',
            completed_at TEXT NULL,
            run_status TEXT NOT NULL DEFAULT 'success',
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_batch_id) REFERENCES pl3_prediction_batch(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES ai_model(id),
            UNIQUE (prediction_batch_id, model_id, prediction_play_mode)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_group (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL,
            group_no INTEGER NOT NULL,
            play_type TEXT NULL,
            sum_value TEXT NULL,
            strategy_text TEXT NULL,
            description_text TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES pl3_prediction_model_run(id) ON DELETE CASCADE,
            UNIQUE (model_run_id, group_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_group_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (prediction_group_id) REFERENCES pl3_prediction_group(id) ON DELETE CASCADE,
            UNIQUE (prediction_group_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_hit_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL UNIQUE,
            draw_result_id INTEGER NOT NULL,
            red_hit_count INTEGER NOT NULL DEFAULT 0,
            blue_hit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_group_id) REFERENCES pl3_prediction_group(id) ON DELETE CASCADE,
            FOREIGN KEY (draw_result_id) REFERENCES pl3_draw_result(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_prediction_hit_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hit_summary_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (hit_summary_id) REFERENCES pl3_prediction_hit_summary(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_draw_result_prize (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            prize_level TEXT NOT NULL,
            prize_type TEXT NOT NULL DEFAULT 'basic',
            winner_count INTEGER NOT NULL DEFAULT 0,
            prize_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (draw_result_id) REFERENCES pl3_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, prize_level, prize_type)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_model_batch_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL UNIQUE,
            best_group_id INTEGER NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES pl3_prediction_model_run(id) ON DELETE CASCADE,
            FOREIGN KEY (best_group_id) REFERENCES pl3_prediction_group(id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_simulation_ticket (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_simulation_ticket_number (
            ticket_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (ticket_id, number_role, number_position, number_value),
            FOREIGN KEY (ticket_id) REFERENCES pl3_simulation_ticket(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_my_bet_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            target_period TEXT NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            discount_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_my_bet_record_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            line_no INTEGER NOT NULL DEFAULT 1,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES pl3_my_bet_record(id) ON DELETE CASCADE,
            UNIQUE (record_id, line_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_my_bet_record_line_number (
            line_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (line_id, number_role, number_position, number_value),
            FOREIGN KEY (line_id) REFERENCES pl3_my_bet_record_line(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl3_my_bet_record_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'manual',
            ticket_image_url TEXT NULL,
            ocr_text TEXT NULL,
            ocr_provider TEXT NULL,
            ocr_recognized_at TEXT NULL,
            ticket_purchased_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES pl3_my_bet_record(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_draw_issue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_no TEXT NOT NULL UNIQUE,
            draw_date TEXT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_draw_result (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL UNIQUE,
            jackpot_pool_balance INTEGER NOT NULL DEFAULT 0,
            sales_amount INTEGER NOT NULL DEFAULT 0,
            prize_total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (issue_id) REFERENCES pl5_draw_issue(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_draw_result_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (draw_result_id) REFERENCES pl5_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_batch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_issue_id INTEGER NOT NULL,
            prediction_date TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'script',
            status TEXT NOT NULL DEFAULT 'current',
            archived_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (target_issue_id) REFERENCES pl5_draw_issue(id),
            UNIQUE (target_issue_id, status)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_model_run (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_batch_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            prediction_play_mode TEXT NOT NULL DEFAULT 'direct',
            completed_at TEXT NULL,
            run_status TEXT NOT NULL DEFAULT 'success',
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_batch_id) REFERENCES pl5_prediction_batch(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES ai_model(id),
            UNIQUE (prediction_batch_id, model_id, prediction_play_mode)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_group (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL,
            group_no INTEGER NOT NULL,
            play_type TEXT NULL,
            sum_value TEXT NULL,
            strategy_text TEXT NULL,
            description_text TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES pl5_prediction_model_run(id) ON DELETE CASCADE,
            UNIQUE (model_run_id, group_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_group_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (prediction_group_id) REFERENCES pl5_prediction_group(id) ON DELETE CASCADE,
            UNIQUE (prediction_group_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_hit_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL UNIQUE,
            draw_result_id INTEGER NOT NULL,
            red_hit_count INTEGER NOT NULL DEFAULT 0,
            blue_hit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_group_id) REFERENCES pl5_prediction_group(id) ON DELETE CASCADE,
            FOREIGN KEY (draw_result_id) REFERENCES pl5_draw_result(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_prediction_hit_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hit_summary_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (hit_summary_id) REFERENCES pl5_prediction_hit_summary(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_draw_result_prize (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            prize_level TEXT NOT NULL,
            prize_type TEXT NOT NULL DEFAULT 'basic',
            winner_count INTEGER NOT NULL DEFAULT 0,
            prize_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (draw_result_id) REFERENCES pl5_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, prize_level, prize_type)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_model_batch_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL UNIQUE,
            best_group_id INTEGER NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES pl5_prediction_model_run(id) ON DELETE CASCADE,
            FOREIGN KEY (best_group_id) REFERENCES pl5_prediction_group(id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_simulation_ticket (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_simulation_ticket_number (
            ticket_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (ticket_id, number_role, number_position, number_value),
            FOREIGN KEY (ticket_id) REFERENCES pl5_simulation_ticket(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_my_bet_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            target_period TEXT NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            discount_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_my_bet_record_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            line_no INTEGER NOT NULL DEFAULT 1,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES pl5_my_bet_record(id) ON DELETE CASCADE,
            UNIQUE (record_id, line_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_my_bet_record_line_number (
            line_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (line_id, number_role, number_position, number_value),
            FOREIGN KEY (line_id) REFERENCES pl5_my_bet_record_line(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS pl5_my_bet_record_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'manual',
            ticket_image_url TEXT NULL,
            ocr_text TEXT NULL,
            ocr_provider TEXT NULL,
            ocr_recognized_at TEXT NULL,
            ticket_purchased_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES pl5_my_bet_record(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_draw_issue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_no TEXT NOT NULL UNIQUE,
            draw_date TEXT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_draw_result (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL UNIQUE,
            jackpot_pool_balance INTEGER NOT NULL DEFAULT 0,
            sales_amount INTEGER NOT NULL DEFAULT 0,
            prize_total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (issue_id) REFERENCES qxc_draw_issue(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_draw_result_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (draw_result_id) REFERENCES qxc_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_batch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_issue_id INTEGER NOT NULL,
            prediction_date TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'script',
            status TEXT NOT NULL DEFAULT 'current',
            archived_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (target_issue_id) REFERENCES qxc_draw_issue(id),
            UNIQUE (target_issue_id, status)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_model_run (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_batch_id INTEGER NOT NULL,
            model_id INTEGER NOT NULL,
            prediction_play_mode TEXT NOT NULL DEFAULT 'direct',
            completed_at TEXT NULL,
            run_status TEXT NOT NULL DEFAULT 'success',
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_batch_id) REFERENCES qxc_prediction_batch(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES ai_model(id),
            UNIQUE (prediction_batch_id, model_id, prediction_play_mode)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_group (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL,
            group_no INTEGER NOT NULL,
            play_type TEXT NULL,
            sum_value TEXT NULL,
            strategy_text TEXT NULL,
            description_text TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES qxc_prediction_model_run(id) ON DELETE CASCADE,
            UNIQUE (model_run_id, group_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_group_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NOT NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (prediction_group_id) REFERENCES qxc_prediction_group(id) ON DELETE CASCADE,
            UNIQUE (prediction_group_id, ball_color, ball_position)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_hit_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_group_id INTEGER NOT NULL UNIQUE,
            draw_result_id INTEGER NOT NULL,
            red_hit_count INTEGER NOT NULL DEFAULT 0,
            blue_hit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prediction_group_id) REFERENCES qxc_prediction_group(id) ON DELETE CASCADE,
            FOREIGN KEY (draw_result_id) REFERENCES qxc_draw_result(id)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_prediction_hit_number (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hit_summary_id INTEGER NOT NULL,
            ball_color TEXT NOT NULL,
            ball_position INTEGER NULL,
            ball_value TEXT NOT NULL,
            FOREIGN KEY (hit_summary_id) REFERENCES qxc_prediction_hit_summary(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_draw_result_prize (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draw_result_id INTEGER NOT NULL,
            prize_level TEXT NOT NULL,
            prize_type TEXT NOT NULL DEFAULT 'basic',
            winner_count INTEGER NOT NULL DEFAULT 0,
            prize_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (draw_result_id) REFERENCES qxc_draw_result(id) ON DELETE CASCADE,
            UNIQUE (draw_result_id, prize_level, prize_type)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_model_batch_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_run_id INTEGER NOT NULL UNIQUE,
            best_group_id INTEGER NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (model_run_id) REFERENCES qxc_prediction_model_run(id) ON DELETE CASCADE,
            FOREIGN KEY (best_group_id) REFERENCES qxc_prediction_group(id) ON DELETE SET NULL
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_simulation_ticket (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_simulation_ticket_number (
            ticket_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (ticket_id, number_role, number_position, number_value),
            FOREIGN KEY (ticket_id) REFERENCES qxc_simulation_ticket(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_my_bet_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            target_period TEXT NOT NULL,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            discount_amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_my_bet_record_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL,
            line_no INTEGER NOT NULL DEFAULT 1,
            play_type TEXT NOT NULL DEFAULT 'dlt',
            multiplier INTEGER NOT NULL DEFAULT 1,
            is_append INTEGER NOT NULL DEFAULT 0,
            bet_count INTEGER NOT NULL DEFAULT 0,
            amount INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES qxc_my_bet_record(id) ON DELETE CASCADE,
            UNIQUE (record_id, line_no)
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_my_bet_record_line_number (
            line_id INTEGER NOT NULL,
            number_role TEXT NOT NULL,
            number_position INTEGER NOT NULL,
            number_value TEXT NOT NULL,
            PRIMARY KEY (line_id, number_role, number_position, number_value),
            FOREIGN KEY (line_id) REFERENCES qxc_my_bet_record_line(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE TABLE IF NOT EXISTS qxc_my_bet_record_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_id INTEGER NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'manual',
            ticket_image_url TEXT NULL,
            ocr_text TEXT NULL,
            ocr_provider TEXT NULL,
            ocr_recognized_at TEXT NULL,
            ticket_purchased_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (record_id) REFERENCES qxc_my_bet_record(id) ON DELETE CASCADE
        )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_provider_model_config_idx_provider_model_config_provider_active ON provider_model_config (provider_id, is_deleted, sort_order)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_idx_ai_model_provider_model_active ON ai_model (provider_model_id, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_idx_ai_model_provider_model ON ai_model (provider_model_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_idx_ai_model_deleted_active ON ai_model (is_deleted, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_ai_model_lottery_idx_ai_model_lottery_code ON ai_model_lottery (lottery_code)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_idx_write_log_table_created ON write_log (table_name, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_idx_write_log_status_created ON write_log (status, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_idx_write_log_target_key ON write_log (target_key)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_write_log_detail_idx_write_log_detail_log ON write_log_detail (log_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_user_idx_app_user_role_active ON app_user (role_id, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_auth_email_code_idx_auth_email_code_lookup ON auth_email_code (email, purpose, consumed_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_auth_email_code_idx_auth_email_code_expires ON auth_email_code (expires_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_user_session_idx_user_session_user ON user_session (user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_user_session_idx_user_session_expiry ON user_session (expires_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_site_message_idx_site_message_user_created ON site_message (user_id, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_site_message_idx_site_message_user_read ON site_message (user_id, read_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_site_message_idx_site_message_user_deleted_created ON site_message (user_id, deleted_at, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_assistant_conversation_idx_assistant_conversation_user_active ON assistant_conversation (user_id, deleted_at, last_active_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_assistant_conversation_idx_assistant_conversation_model ON assistant_conversation (model_code, lottery_code)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_assistant_message_idx_assistant_message_conversation_created ON assistant_message (conversation_id, created_at, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_idx_scheduled_task_type_active ON scheduled_task (task_type, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_idx_scheduled_task_lottery_active ON scheduled_task (lottery_code, is_active)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_idx_scheduled_task_next_run ON scheduled_task (is_active, next_run_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_model_idx_scheduled_task_model_sort ON scheduled_task_model (task_id, sort_order)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_maintenance_run_log_idx_maintenance_run_log_schedule_created ON maintenance_run_log (schedule_task_code, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_maintenance_run_log_idx_maintenance_run_log_created ON maintenance_run_log (created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_maintenance_run_log_idx_maintenance_run_log_lottery_created ON maintenance_run_log (lottery_code, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_maintenance_run_log_idx_maintenance_run_log_status_created ON maintenance_run_log (status, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_issue_idx_draw_issue_status_date ON dlt_draw_issue (status, draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_issue_idx_draw_issue_draw_date ON dlt_draw_issue (draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_result_number_idx_draw_result_number_result_order ON dlt_draw_result_number (draw_result_id, ball_color, ball_position, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_result_number_idx_draw_result_number_color_value ON dlt_draw_result_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_batch_idx_prediction_batch_status_date ON dlt_prediction_batch (status, prediction_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_batch_idx_prediction_batch_target_issue ON dlt_prediction_batch (target_issue_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_model_run_idx_prediction_model_run_batch ON dlt_prediction_model_run (prediction_batch_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_model_run_idx_prediction_model_run_batch_order ON dlt_prediction_model_run (prediction_batch_id, display_order, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_model_run_idx_prediction_model_run_model ON dlt_prediction_model_run (model_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_group_idx_prediction_group_model_run ON dlt_prediction_group (model_run_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_group_idx_prediction_group_run_order ON dlt_prediction_group (model_run_id, group_no, id, play_type, sum_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_group_number_idx_prediction_group_number_color_value ON dlt_prediction_group_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_group_number_idx_prediction_group_number_group ON dlt_prediction_group_number (prediction_group_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_hit_summary_idx_prediction_hit_summary_result ON dlt_prediction_hit_summary (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_prediction_hit_number_idx_prediction_hit_number_value ON dlt_prediction_hit_number (hit_summary_id, ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_result_prize_idx_draw_result_prize_result ON dlt_draw_result_prize (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_draw_result_prize_idx_draw_result_prize_result_order ON dlt_draw_result_prize (draw_result_id, id, prize_level, prize_type)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_simulation_ticket_idx_simulation_ticket_user_created ON dlt_simulation_ticket (user_id, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_simulation_ticket_number_idx_simulation_ticket_number_ticket ON dlt_simulation_ticket_number (ticket_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_my_bet_record_idx_my_bet_record_user_period ON dlt_my_bet_record (user_id, target_period, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_my_bet_record_idx_my_bet_record_user_list ON dlt_my_bet_record (user_id, target_period, created_at, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_my_bet_record_line_idx_my_bet_record_line_record ON dlt_my_bet_record_line (record_id, line_no)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_my_bet_record_line_number_idx_my_bet_record_line_number_line ON dlt_my_bet_record_line_number (line_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_dlt_my_bet_record_meta_idx_my_bet_record_meta_created ON dlt_my_bet_record_meta (created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_issue_idx_draw_issue_status_date ON pl3_draw_issue (status, draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_issue_idx_draw_issue_draw_date ON pl3_draw_issue (draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_result_number_idx_draw_result_number_result_order ON pl3_draw_result_number (draw_result_id, ball_color, ball_position, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_result_number_idx_draw_result_number_color_value ON pl3_draw_result_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_batch_idx_prediction_batch_status_date ON pl3_prediction_batch (status, prediction_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_batch_idx_prediction_batch_target_issue ON pl3_prediction_batch (target_issue_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_model_run_idx_prediction_model_run_batch ON pl3_prediction_model_run (prediction_batch_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_model_run_idx_prediction_model_run_batch_order ON pl3_prediction_model_run (prediction_batch_id, display_order, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_model_run_idx_prediction_model_run_model ON pl3_prediction_model_run (model_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_group_idx_prediction_group_model_run ON pl3_prediction_group (model_run_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_group_idx_prediction_group_run_order ON pl3_prediction_group (model_run_id, group_no, id, play_type, sum_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_group_number_idx_prediction_group_number_color_value ON pl3_prediction_group_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_group_number_idx_prediction_group_number_group ON pl3_prediction_group_number (prediction_group_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_hit_summary_idx_prediction_hit_summary_result ON pl3_prediction_hit_summary (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_prediction_hit_number_idx_prediction_hit_number_value ON pl3_prediction_hit_number (hit_summary_id, ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_result_prize_idx_draw_result_prize_result ON pl3_draw_result_prize (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_draw_result_prize_idx_draw_result_prize_result_order ON pl3_draw_result_prize (draw_result_id, id, prize_level, prize_type)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_simulation_ticket_idx_simulation_ticket_user_created ON pl3_simulation_ticket (user_id, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_simulation_ticket_number_idx_simulation_ticket_number_ticket ON pl3_simulation_ticket_number (ticket_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_my_bet_record_idx_my_bet_record_user_period ON pl3_my_bet_record (user_id, target_period, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_my_bet_record_idx_my_bet_record_user_list ON pl3_my_bet_record (user_id, target_period, created_at, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_my_bet_record_line_idx_my_bet_record_line_record ON pl3_my_bet_record_line (record_id, line_no)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_my_bet_record_line_number_idx_my_bet_record_line_number_line ON pl3_my_bet_record_line_number (line_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl3_my_bet_record_meta_idx_my_bet_record_meta_created ON pl3_my_bet_record_meta (created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_issue_idx_draw_issue_status_date ON pl5_draw_issue (status, draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_issue_idx_draw_issue_draw_date ON pl5_draw_issue (draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_result_number_idx_draw_result_number_result_order ON pl5_draw_result_number (draw_result_id, ball_color, ball_position, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_result_number_idx_draw_result_number_color_value ON pl5_draw_result_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_batch_idx_prediction_batch_status_date ON pl5_prediction_batch (status, prediction_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_batch_idx_prediction_batch_target_issue ON pl5_prediction_batch (target_issue_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_model_run_idx_prediction_model_run_batch ON pl5_prediction_model_run (prediction_batch_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_model_run_idx_prediction_model_run_batch_order ON pl5_prediction_model_run (prediction_batch_id, display_order, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_model_run_idx_prediction_model_run_model ON pl5_prediction_model_run (model_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_group_idx_prediction_group_model_run ON pl5_prediction_group (model_run_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_group_idx_prediction_group_run_order ON pl5_prediction_group (model_run_id, group_no, id, play_type, sum_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_group_number_idx_prediction_group_number_color_value ON pl5_prediction_group_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_group_number_idx_prediction_group_number_group ON pl5_prediction_group_number (prediction_group_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_hit_summary_idx_prediction_hit_summary_result ON pl5_prediction_hit_summary (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_prediction_hit_number_idx_prediction_hit_number_value ON pl5_prediction_hit_number (hit_summary_id, ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_result_prize_idx_draw_result_prize_result ON pl5_draw_result_prize (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_draw_result_prize_idx_draw_result_prize_result_order ON pl5_draw_result_prize (draw_result_id, id, prize_level, prize_type)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_simulation_ticket_idx_simulation_ticket_user_created ON pl5_simulation_ticket (user_id, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_simulation_ticket_number_idx_simulation_ticket_number_ticket ON pl5_simulation_ticket_number (ticket_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_my_bet_record_idx_my_bet_record_user_period ON pl5_my_bet_record (user_id, target_period, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_my_bet_record_idx_my_bet_record_user_list ON pl5_my_bet_record (user_id, target_period, created_at, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_my_bet_record_line_idx_my_bet_record_line_record ON pl5_my_bet_record_line (record_id, line_no)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_my_bet_record_line_number_idx_my_bet_record_line_number_line ON pl5_my_bet_record_line_number (line_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_pl5_my_bet_record_meta_idx_my_bet_record_meta_created ON pl5_my_bet_record_meta (created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_issue_idx_draw_issue_status_date ON qxc_draw_issue (status, draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_issue_idx_draw_issue_draw_date ON qxc_draw_issue (draw_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_result_number_idx_draw_result_number_result_order ON qxc_draw_result_number (draw_result_id, ball_color, ball_position, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_result_number_idx_draw_result_number_color_value ON qxc_draw_result_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_batch_idx_prediction_batch_status_date ON qxc_prediction_batch (status, prediction_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_batch_idx_prediction_batch_target_issue ON qxc_prediction_batch (target_issue_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_model_run_idx_prediction_model_run_batch ON qxc_prediction_model_run (prediction_batch_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_model_run_idx_prediction_model_run_batch_order ON qxc_prediction_model_run (prediction_batch_id, display_order, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_model_run_idx_prediction_model_run_model ON qxc_prediction_model_run (model_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_group_idx_prediction_group_model_run ON qxc_prediction_group (model_run_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_group_idx_prediction_group_run_order ON qxc_prediction_group (model_run_id, group_no, id, play_type, sum_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_group_number_idx_prediction_group_number_color_value ON qxc_prediction_group_number (ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_group_number_idx_prediction_group_number_group ON qxc_prediction_group_number (prediction_group_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_hit_summary_idx_prediction_hit_summary_result ON qxc_prediction_hit_summary (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_prediction_hit_number_idx_prediction_hit_number_value ON qxc_prediction_hit_number (hit_summary_id, ball_color, ball_value)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_result_prize_idx_draw_result_prize_result ON qxc_draw_result_prize (draw_result_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_draw_result_prize_idx_draw_result_prize_result_order ON qxc_draw_result_prize (draw_result_id, id, prize_level, prize_type)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_simulation_ticket_idx_simulation_ticket_user_created ON qxc_simulation_ticket (user_id, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_simulation_ticket_number_idx_simulation_ticket_number_ticket ON qxc_simulation_ticket_number (ticket_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_my_bet_record_idx_my_bet_record_user_period ON qxc_my_bet_record (user_id, target_period, created_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_my_bet_record_idx_my_bet_record_user_list ON qxc_my_bet_record (user_id, target_period, created_at, id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_my_bet_record_line_idx_my_bet_record_line_record ON qxc_my_bet_record_line (record_id, line_no)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_my_bet_record_line_number_idx_my_bet_record_line_number_line ON qxc_my_bet_record_line_number (line_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_qxc_my_bet_record_meta_idx_my_bet_record_meta_created ON qxc_my_bet_record_meta (created_at)
    """,
]


def get_sqlite_schema_statements() -> list[str]:
    return list(SQLITE_SCHEMA_STATEMENTS)
