# 权重与评分逻辑说明

本文档说明 LetouMe 当前实际存在的三套“权重 / 评分”逻辑，并明确它们各自的职责边界：

1. 最新模型评分系统：用于评估历史归档中各模型的综合表现
2. AI 选号权重：用于约束模型生成 5 组预测号码
3. 前端号码汇总加权：用于前端按模型评分对号码做展示加权

三者用途不同，不能混用：

- 最新模型评分系统决定模型在历史列表、模型统计、前端评分视图中的分数表现
- AI 选号权重是 Prompt 内的分析框架，不直接参与后端历史评分
- 前端号码汇总加权只影响展示层，不会改写预测记录或反向影响模型评分

---

## 一、最新模型评分系统

这是当前系统中的主评分体系，来源于后端 `backend/app/services/prediction_service.py`，并通过：

- `backend/app/schemas/history.py`
- `frontend/src/shared/types/api.ts`

暴露给前端。

该体系不再使用旧版的 `score100 / bestScore / avgScore` 评分方式，当前以收益、命中、稳定性、上限、下限五个维度为核心。

### 1. 评分输入数据

模型评分不是直接对号码命中个数做简单平均，而是先把每个模型在每一期归档记录中的表现转成一条“期表现记录”。

每条期表现记录包含以下核心指标：

- `bet_count`：该期该模型提交的预测组数
- `winning_bet_count`：该期中奖组数
- `cost_amount`：投注成本，当前固定为 `bet_count × 2`
- `prize_amount`：该期总奖金
- `net_profit`：净收益，等于 `prize_amount - cost_amount`
- `roi`：投资回报率，等于 `net_profit / cost_amount`
- `best_hit_count`：该期单组预测中的最高命中总数
- `hit_rate_by_period`：该期是否至少有一组中奖，有则为 `1`，否则为 `0`
- `hit_rate_by_bet`：该期中奖组数 / 该期总投注组数

这些数据由历史归档记录聚合而来，而不是由前端临时计算。

### 2. 双窗口结构

每个模型最终都有两套窗口分：

- `recent_window`：最近 `20` 期，常量为 `RECENT_SCORE_WINDOW = 20`
- `long_term_window`：该模型全部历史期数

设计意图：

- `recent_window` 反映近期状态
- `long_term_window` 反映长期稳定表现

最终对外展示的总分不是只看近期，也不是只看全历史，而是按固定权重融合：

```text
融合分 = clamp(近期窗口分 × 0.6 + 长期窗口分 × 0.4)
```

这里的 `clamp` 表示结果会被裁剪到 `0 ~ 100`，并四舍五入为整数。

### 3. 单窗口内的基础统计

对某个窗口中的若干期记录，先计算以下基础统计量：

- `periods`：窗口内期数
- `bets`：窗口内总投注组数
- `total_cost`：窗口内总成本
- `total_prize`：窗口内总奖金
- `total_net`：窗口内总净收益
- `period_hit_rate`：窗口内按期中奖率，等于各期 `hit_rate_by_period` 的平均值
- `bet_hit_rate`：窗口内按注中奖率，等于总中奖组数 / 总投注组数
- `avg_best_hit_rate`：各期 `best_hit_count / 7` 的平均值
- `roi`：窗口总 ROI，等于 `total_net / total_cost`
- `avg_period_roi`：各期 ROI 的平均值
- `period_roi_std`：各期 ROI 的标准差，用于衡量波动
- `losing_period_ratio`：窗口内亏损期占比
- `best_period`：按净收益优先、命中数次级排序得到的最佳期
- `worst_period`：按净收益优先、命中数次级排序得到的最差期

### 4. 五个组件分

当前系统把单窗口表现拆成五个组件分，每个分值都被压到 `0 ~ 100`。

#### 4.1 收益分 `profit_score`

用于衡量模型整体赚钱能力，综合：

- 窗口总 ROI
- 各期平均 ROI

公式：

```text
profit_score = bounded_center_score(roi × 0.65 + avg_period_roi × 0.35, scale = 1.5)
```

解释：

- 总 ROI 权重更高，反映整体盈亏
- 平均单期 ROI 用于避免极少数大额中奖把总表现“拉歪”
- `bounded_center_score` 使用平滑函数把结果映射到 `0 ~ 100`
- 当收益表现接近中性时，分数会靠近中间值；明显盈利上升，明显亏损下降

#### 4.2 命中分 `hit_score`

用于衡量模型到底“经常中不中、单注中不中、最高能中到什么程度”。

公式：

```text
hit_score =
  clamp(
    (period_hit_rate × 0.55 +
     bet_hit_rate × 0.25 +
     avg_best_hit_rate × 0.20) × 100
  )
```

解释：

- 按期中奖率权重最高，强调“这一期至少能不能打中”
- 按注中奖率反映多组预测整体效率
- `avg_best_hit_rate` 反映单期天花板命中能力

#### 4.3 稳定性分 `stability_score`

用于衡量模型是否容易大起大落。

公式：

```text
stability_score =
  clamp(
    (
      1
      - min(1, period_roi_std / 2.0) × 0.45
      - losing_period_ratio × 0.35
      - min(1, max(0, -worst_period_roi) / 1.5) × 0.20
    ) × 100
  )
```

解释：

- ROI 波动越大，稳定性越差
- 亏损期占比越高，稳定性越差
- 最差一期如果亏得很深，会继续拉低稳定性

#### 4.4 上限分 `ceiling_score`

用于衡量模型“状态好时能打到多高”。

公式：

```text
ceiling_score =
  clamp(
    positive_score(best_period_roi, scale = 2.0) × 0.55 +
    best_period_hit_rate_by_bet × 100 × 0.20 +
    (best_period_best_hit_count / 7) × 100 × 0.25
  )
```

解释：

- 最佳期 ROI 是上限分的核心
- 最佳期按注中奖率和最佳命中数提供辅助判断
- 该分数高，说明模型在顺风期可能有更强爆发力

#### 4.5 下限分 `floor_score`

用于衡量模型“差的时候是否还能守住底线”。

公式：

```text
floor_score =
  clamp(
    inverse_negative_score(worst_period_roi, scale = 1.5) × 0.70 +
    worst_period_hit_rate_by_bet × 100 × 0.30
  )
```

解释：

- 最差期亏得越轻，下限分越高
- 即使处于最差期，如果仍有一定中奖能力，也会拉高下限分

### 5. 派生分

除了五个组件分，单窗口还会额外生成两个更直观的效率分：

#### 5.1 单注分 `per_bet_score`

```text
per_bet_score =
  clamp(
    bet_hit_rate × 100 × 0.45 +
    profit_score × 0.35 +
    stability_score × 0.20
  )
```

含义：更偏向“每投一组号码值不值”。

#### 5.2 单期分 `per_period_score`

```text
per_period_score =
  clamp(
    period_hit_rate × 100 × 0.40 +
    profit_score × 0.25 +
    stability_score × 0.20 +
    floor_score × 0.15
  )
```

含义：更偏向“以开奖期为单位看，这个模型是否经常有可交付表现”。

### 6. 单窗口综合分 `overall_score`

每个窗口内部的综合分公式如下：

```text
overall_score =
  clamp(
    profit_score × 0.28 +
    hit_score × 0.22 +
    stability_score × 0.22 +
    ceiling_score × 0.16 +
    floor_score × 0.12
  )
```

解释：

- 收益能力仍是第一权重
- 命中能力与稳定性权重相同，都是核心维度
- 上限和下限作为补充，避免只看平均表现

### 7. 近期 / 长期融合后的最终画像

系统会对以下字段做 `0.6 × recent + 0.4 × long_term` 融合：

- `overall_score`
- `per_bet_score`
- `per_period_score`
- `component_scores.profit`
- `component_scores.hit_rate`
- `component_scores.stability`
- `component_scores.ceiling`
- `component_scores.floor`

同时直接保留：

- `recent_score = recent_window.overall_score`
- `long_term_score = long_term_window.overall_score`

因此：

- `overall_score`：最终主排序分
- `recent_score`：近期状态分
- `long_term_score`：长期能力分

### 8. 最佳期 / 最差期快照

系统还会生成：

- `best_period_snapshot`
- `worst_period_snapshot`

它们是从近期窗口和长期窗口中分别取“更优最佳期”和“更差最差期”后对外暴露的摘要，字段结构来自 `ScoreSnapshot`：

- `target_period`
- `prediction_date`
- `bet_count`
- `winning_bet_count`
- `cost_amount`
- `prize_amount`
- `net_profit`
- `roi`
- `best_hit_count`

这两个快照主要用于前端说明模型的代表性高点和低点。

### 9. 样本量字段

当前评分结果还会附带：

- `sample_size_periods`：该模型参与评分的历史期数
- `sample_size_bets`：该模型参与评分的历史总投注组数

它们不直接参与打分，但用于辅助判断分数可信度：

- 样本越大，长期分越有参考意义
- 样本越小，近期爆发分更可能带有偶然性

### 10. 对外字段映射

后端 `ScoreProfile` / 前端 `ScoreProfile` 当前公开字段如下：

- `overall_score`
- `per_bet_score`
- `per_period_score`
- `recent_score`
- `long_term_score`
- `component_scores`
- `recent_window`
- `long_term_window`
- `best_period_snapshot`
- `worst_period_snapshot`
- `sample_size_periods`
- `sample_size_bets`

其中：

- `component_scores` 的键固定为：`profit`、`hit_rate`、`stability`、`ceiling`、`floor`
- `recent_window` / `long_term_window` 的结构为 `ScoreWindowProfile`
- `best_period_snapshot` / `worst_period_snapshot` 的结构为 `ScoreSnapshot`

### 11. 排序与使用场景

当前模型统计排序优先依据：

1. `score_profile.overall_score`
2. `prize_amount`
3. `win_rate_by_period`
4. `model_name`

因此 `overall_score` 是当前最核心的模型横向比较指标。

---

## 二、AI 选号权重

这部分来源于 `backend/doc/dlt_prompt2.0.md`，用于指导 AI 生成当期 5 组预测方案。

它的作用是：

- 约束模型分析历史开奖数据的方式
- 保证 5 组预测覆盖不同选号策略

它不负责：

- 计算历史模型评分
- 排序历史模型
- 生成前端 `ScoreProfile`

### 1. 热号策略：多周期加权频率

前区热度得分：

```text
热度得分 =
  近5期出现次数 × 5 +
  近10期出现次数 × 3 +
  近30期出现次数 × 2
```

附加修正：

- 若该号码在上一期开出：得分 × `0.6`
- 若该号码连续 `4` 期未出现：得分 × `0.8`

后区热号策略：

- 统计最近 `20` 期后区号码频率
- 优先选择最近 `20` 期更活跃的号码

### 2. 冷号策略：遗漏加权

前区遗漏得分：

```text
若遗漏期数在 4 ~ 8：遗漏期数 × 1.0
若遗漏期数在 9 ~ 16：遗漏期数 × 1.4
其他情况：遗漏期数 × 0.8
```

回温修正：

```text
若某号码遗漏超过 10 期后在最近 4 期首次回补：得分 × 1.3
```

后区冷号策略：

- 优先考虑遗漏 `4 ~ 10` 期的号码
- 避免全部选择刚开出不久的号码

### 3. 趋势策略：多周期频率差

前区趋势分：

```text
趋势分 =
  (5期频率 / 5 - 30期频率 / 30) × 100 +
  (10期频率 / 10 - 30期频率 / 30) × 50
```

解释：

- 趋势分大于 `0`：视为上升趋势
- 趋势分小于 `0`：视为下降趋势

回补信号：

```text
若某号码连续 3 期未出现，但最近 2 期出现回补：趋势分 +15
```

后区趋势 / 节奏逻辑：

- 计算后区号码的历史平均遗漏期
- 优先选择当前遗漏期接近历史平均遗漏期的号码

### 4. 综合策略：多维评分融合

前区综合得分：

```text
综合得分 =
  热度得分 × 0.30 +
  遗漏得分 × 0.25 +
  平衡得分 × 0.20 +
  周期得分 × 0.25
```

后区综合得分：

```text
后区综合得分 =
  热度得分 × 0.35 +
  遗漏得分 × 0.30 +
  周期得分 × 0.20 +
  中频得分 × 0.15
```

说明：

- 这些权重只存在于 Prompt 约束层
- Python 后端不会逐项复刻这套 AI 分数
- 后端主要负责准备历史数据、调用模型、校验结构和归档结果

---

## 三、前端号码汇总加权

这部分来源于前端 `frontend/src/features/home/lib/home.ts` 的汇总逻辑。

它用于“模型预测汇总”区域，把多个模型给出的号码做统计，并支持两种展示方式：

1. 不加权统计
2. 按模型评分加权统计

### 1. 不加权模式

默认情况下：

- 某个号码在某个模型的一组预测中出现一次，记 `1`
- `appearanceCount` 表示原始出现次数

这种模式只看“出现得多不多”，不区分模型强弱。

### 2. 按模型评分加权模式

打开“按历史评分加权”后，每个模型的权重为：

```text
scoreWeight = overall_score / 100
```

这里的 `overall_score` 就是上一章定义的最新模型评分系统中的主综合分。

例如：

- `overall_score = 82`，则该模型每命中一次号码记 `0.82`
- `overall_score = 55`，则该模型每命中一次号码记 `0.55`

前端实现方式：

- 红球、蓝球分别建立号码统计表
- 某号码被某模型某组预测命中时：
  - `appearanceCount += 1`
  - `weightedScore += scoreWeight`

最终：

- `appearanceCount` 仍保留原始次数
- `weightedScore` 作为加权展示值

### 3. 该加权的含义

它表达的是：

- 如果强模型和弱模型都给出同一个号码，该号码的展示权重更高
- 如果某号码主要来自低分模型，即使出现次数多，加权后排名也可能下降

因此它更像“模型质量加权后的共识度”，而不是新的预测生成算法。

### 4. 边界说明

前端号码汇总加权：

- 不会修改数据库中的原始预测记录
- 不会回写后端 `score_profile`
- 不会影响模型历史评分
- 不会影响 AI 当期选号逻辑

它只是一层展示加权。

---

## 四、三套逻辑之间的关系

可以把它们理解成三层：

### 1. AI 选号层

使用 Prompt 中的热号 / 冷号 / 趋势 / 综合权重，生成 5 组候选号码。

### 2. 历史评估层

使用后端模型评分系统，对历史归档中的模型表现做长期评价，输出 `ScoreProfile`。

### 3. 前端展示层

使用 `overall_score / 100` 对号码汇总结果做展示加权，帮助用户查看“高分模型共识号码”。

因此流程是：

```text
AI 生成预测 → 归档开奖结果 → 后端计算模型评分 → 前端按评分展示模型与号码汇总
```

---

## 五、注意事项

- 本项目中的权重与评分属于启发式量化体系，不代表统计显著性证明
- 历史高分不代表未来必然继续高分
- AI 预测结果仅供参考，不构成任何投注建议
- 阅读或维护该系统时，应优先以 `PredictionService` 中的当前实现为准
