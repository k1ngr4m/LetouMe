/**
 * 大乐透数据加载模块
 * 负责加载并规范化历史开奖、AI 预测与历史命中数据
 */

const SportsLotteryDataLoader = {
    historyPath: './data/dlt_data.json',
    predictionsPath: './data/dlt_ai_predictions.json',
    predictionsHistoryPath: './data/dlt_predictions_history.json',

    padNumber(value) {
        return String(value).padStart(2, '0');
    },

    normalizeBlueBalls(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.padNumber(item)).sort();
        }
        if (typeof value === 'string' && value) {
            return [this.padNumber(value)];
        }
        return [];
    },

    normalizeDraw(draw) {
        const redBalls = Array.isArray(draw.red_balls)
            ? draw.red_balls.map(item => this.padNumber(item)).sort()
            : [];
        const blueBalls = this.normalizeBlueBalls(draw.blue_balls ?? draw.blue_ball);

        return {
            ...draw,
            red_balls: redBalls,
            blue_balls: blueBalls,
            blue_ball: blueBalls[0] || null,
            date: draw.date || ''
        };
    },

    normalizePredictionGroup(group) {
        const redBalls = Array.isArray(group.red_balls)
            ? group.red_balls.map(item => this.padNumber(item)).sort()
            : [];
        const blueBalls = this.normalizeBlueBalls(group.blue_balls ?? group.blue_ball);
        const hitResult = group.hit_result
            ? {
                ...group.hit_result,
                red_hits: Array.isArray(group.hit_result.red_hits)
                    ? group.hit_result.red_hits.map(item => this.padNumber(item)).sort()
                    : [],
                blue_hits: this.normalizeBlueBalls(group.hit_result.blue_hits ?? (group.hit_result.blue_hit ? [group.blue_ball] : []))
            }
            : undefined;

        return {
            ...group,
            red_balls: redBalls,
            blue_balls: blueBalls,
            blue_ball: blueBalls[0] || null,
            hit_result: hitResult
                ? {
                    ...hitResult,
                    red_hit_count: typeof hitResult.red_hit_count === 'number' ? hitResult.red_hit_count : hitResult.red_hits.length,
                    blue_hit_count: typeof hitResult.blue_hit_count === 'number' ? hitResult.blue_hit_count : hitResult.blue_hits.length,
                    total_hits: typeof hitResult.total_hits === 'number'
                        ? hitResult.total_hits
                        : hitResult.red_hits.length + hitResult.blue_hits.length
                }
                : undefined
        };
    },

    normalizePredictions(predictionsData) {
        return {
            ...predictionsData,
            models: Array.isArray(predictionsData.models)
                ? predictionsData.models.map(model => ({
                    ...model,
                    predictions: Array.isArray(model.predictions)
                        ? model.predictions.map(group => this.normalizePredictionGroup(group))
                        : []
                }))
                : []
        };
    },

    normalizePredictionsHistory(historyData) {
        return {
            ...historyData,
            predictions_history: Array.isArray(historyData.predictions_history)
                ? historyData.predictions_history.map(record => ({
                    ...record,
                    actual_result: record.actual_result ? this.normalizeDraw(record.actual_result) : null,
                    models: Array.isArray(record.models)
                        ? record.models.map(model => ({
                            ...model,
                            predictions: Array.isArray(model.predictions)
                                ? model.predictions.map(group => this.normalizePredictionGroup(group))
                                : []
                        }))
                        : []
                }))
                : []
        };
    },

    async fetchJson(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async loadLotteryHistory() {
        try {
            const data = await this.fetchJson(this.historyPath);
            return {
                ...data,
                data: Array.isArray(data.data) ? data.data.map(draw => this.normalizeDraw(draw)) : []
            };
        } catch (error) {
            console.error('加载大乐透历史开奖数据失败:', error);
            throw error;
        }
    },

    async loadPredictions() {
        try {
            const data = await this.fetchJson(this.predictionsPath);
            return this.normalizePredictions(data);
        } catch (error) {
            console.error('加载大乐透 AI 预测数据失败:', error);
            throw error;
        }
    },

    async loadPredictionsHistory() {
        try {
            const data = await this.fetchJson(this.predictionsHistoryPath);
            return this.normalizePredictionsHistory(data);
        } catch (error) {
            console.error('加载大乐透历史预测对比数据失败:', error);
            throw error;
        }
    },

    async loadAllData() {
        const [lotteryData, predictionData, predictionsHistoryData] = await Promise.all([
            this.loadLotteryHistory(),
            this.loadPredictions(),
            this.loadPredictionsHistory()
        ]);

        return {
            lottery: lotteryData,
            predictions: predictionData,
            predictionsHistory: predictionsHistoryData
        };
    }
};

window.SportsLotteryDataLoader = SportsLotteryDataLoader;
