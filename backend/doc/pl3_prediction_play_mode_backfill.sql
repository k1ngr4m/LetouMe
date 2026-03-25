-- 说明：
-- 1) 本脚本用于修复历史数据中的模式错标（direct -> direct_sum）。
-- 2) 前端历史展示已以接口 play_type_filters 结果为准；本脚本用于数据一致性治理，而非展示前置条件。
--
-- 非分表场景（prediction_model_run / prediction_group）
-- 1) 预检查：统计模式为 direct 但实际包含和值分组的记录数量
SELECT COUNT(DISTINCT pmr.id) AS suspect_count
FROM prediction_model_run pmr
INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id
INNER JOIN prediction_group pg ON pg.model_run_id = pmr.id
WHERE pb.lottery_code = 'pl3'
  AND pmr.prediction_play_mode = 'direct'
  AND pg.play_type = 'direct_sum';

-- 2) 更新：回填为 direct_sum
-- 注意：为避免唯一键冲突，跳过“同一 batch+model 已存在 direct_sum”的记录
UPDATE prediction_model_run pmr
INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id
SET pmr.prediction_play_mode = 'direct_sum'
WHERE pb.lottery_code = 'pl3'
  AND pmr.prediction_play_mode = 'direct'
  AND EXISTS (
    SELECT 1
    FROM prediction_group pg
    WHERE pg.model_run_id = pmr.id
      AND pg.play_type = 'direct_sum'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM prediction_model_run pmr2
    WHERE pmr2.prediction_batch_id = pmr.prediction_batch_id
      AND pmr2.model_id = pmr.model_id
      AND pmr2.prediction_play_mode = 'direct_sum'
      AND pmr2.id <> pmr.id
  );

-- 3) 核验：确认 direct_sum 数量已回填
SELECT
  pmr.prediction_play_mode,
  COUNT(*) AS run_count
FROM prediction_model_run pmr
INNER JOIN prediction_batch pb ON pb.id = pmr.prediction_batch_id
WHERE pb.lottery_code = 'pl3'
GROUP BY pmr.prediction_play_mode
ORDER BY pmr.prediction_play_mode;


-- 分表场景（pl3_prediction_model_run / pl3_prediction_group）
-- 1) 预检查
SELECT COUNT(DISTINCT pmr.id) AS suspect_count
FROM pl3_prediction_model_run pmr
INNER JOIN pl3_prediction_group pg ON pg.model_run_id = pmr.id
WHERE pmr.prediction_play_mode = 'direct'
  AND pg.play_type = 'direct_sum';

-- 2) 更新
-- 注意：为避免唯一键冲突，跳过“同一 batch+model 已存在 direct_sum”的记录
UPDATE pl3_prediction_model_run pmr
SET pmr.prediction_play_mode = 'direct_sum'
WHERE pmr.prediction_play_mode = 'direct'
  AND EXISTS (
    SELECT 1
    FROM pl3_prediction_group pg
    WHERE pg.model_run_id = pmr.id
      AND pg.play_type = 'direct_sum'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pl3_prediction_model_run pmr2
    WHERE pmr2.prediction_batch_id = pmr.prediction_batch_id
      AND pmr2.model_id = pmr.model_id
      AND pmr2.prediction_play_mode = 'direct_sum'
      AND pmr2.id <> pmr.id
  );

-- 2.1) 可选：查看被跳过的冲突项（同一 batch+model 已有 direct_sum）
SELECT
  pmr.prediction_batch_id,
  pmr.model_id,
  COUNT(*) AS run_count
FROM pl3_prediction_model_run pmr
WHERE pmr.prediction_play_mode IN ('direct', 'direct_sum')
GROUP BY pmr.prediction_batch_id, pmr.model_id
HAVING SUM(CASE WHEN pmr.prediction_play_mode = 'direct_sum' THEN 1 ELSE 0 END) > 0
   AND SUM(CASE WHEN pmr.prediction_play_mode = 'direct' THEN 1 ELSE 0 END) > 0;

-- 3) 核验
SELECT
  prediction_play_mode,
  COUNT(*) AS run_count
FROM pl3_prediction_model_run
GROUP BY prediction_play_mode
ORDER BY prediction_play_mode;
