-- 一次性回填：修复 site_message.created_at 异常时间（如前端显示 1970-01-01 08:00）
-- 注意：当前库中 created_at 为 BIGINT（Unix 秒时间戳），异常值通常为 0
-- 规则：仅更新 created_at<=0 的记录，并优先使用 snapshot_json.settled_at 回填

-- 1) 预览待修复数量
SELECT COUNT(*) AS pending_rows
FROM site_message
WHERE created_at <= 0
AND snapshot_json IS NOT NULL
AND JSON_EXTRACT(snapshot_json, '$.settled_at') IS NOT NULL;

-- 2) settled_at 为纯数字（秒/毫秒时间戳）时回填
UPDATE site_message
SET created_at = CASE
    WHEN CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at'))) >= 13
        THEN CAST(CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at')) AS UNSIGNED) / 1000 AS UNSIGNED)
    ELSE CAST(
        CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at')) AS UNSIGNED)
    AS UNSIGNED)
END
WHERE created_at <= 0
AND snapshot_json IS NOT NULL
AND JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at')) REGEXP '^[0-9]{10,17}$';

-- 3) settled_at 为日期字符串时回填（兼容 2026-04-13T12:34:56Z / 2026-04-13 12:34:56）
UPDATE site_message
SET created_at = UNIX_TIMESTAMP(
    STR_TO_DATE(
        LEFT(
            REPLACE(
                REPLACE(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at')), 'T', ' '),
                'Z',
                ''
            ),
            19
        ),
        '%Y-%m-%d %H:%i:%s'
    )
)
WHERE created_at <= 0
AND snapshot_json IS NOT NULL
AND JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.settled_at')) REGEXP '^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(Z)?$';

-- 4) 回填后核验
SELECT COUNT(*) AS remaining_abnormal_rows
FROM site_message
WHERE created_at <= 0;
