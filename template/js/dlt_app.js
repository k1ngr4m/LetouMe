/**
 * 大乐透主应用逻辑
 */

let sportLotteryAppData = {
    lotteryHistory: null,
    aiPredictions: null,
    predictionsHistory: null
};

let sportLotteryUiState = {
    compound: {
        activeTabIndex: 0,
        sortOrder: 'desc',
        selectedModelIds: [],
        commonOnly: false,
        isModelDropdownOpen: false
    }
};

let sportLotteryCharts = [];

async function initSportsLotteryApp() {
    try {
        await loadSportsLotteryAllData();
        renderSportsLotteryHeroBanner();
        renderSportsLotteryModelsGrid();
        renderSportsLotteryHistoryTab();
        setupSportsLotteryEventListeners();
        hideSportsLotteryLoadingScreen();
    } catch (error) {
        console.error('大乐透页面初始化失败:', error);
        alert('大乐透数据加载失败，请刷新页面重试');
    }
}

async function loadSportsLotteryAllData() {
    const [lotteryHistory, aiPredictions, predictionsHistory] = await Promise.all([
        SportsLotteryDataLoader.loadLotteryHistory(),
        SportsLotteryDataLoader.loadPredictions(),
        SportsLotteryDataLoader.loadPredictionsHistory()
    ]);

    sportLotteryAppData.lotteryHistory = lotteryHistory;
    sportLotteryAppData.aiPredictions = aiPredictions;
    sportLotteryAppData.predictionsHistory = predictionsHistory;
    sportLotteryUiState.compound.selectedModelIds = aiPredictions.models.map(model => model.model_id);
}

function renderSportsLotteryHeroBanner() {
    if (!sportLotteryAppData.lotteryHistory || !sportLotteryAppData.aiPredictions) return;

    const nextDraw = sportLotteryAppData.lotteryHistory.next_draw || {};

    const heroPeriodEl = document.getElementById('heroPeriod');
    if (heroPeriodEl) heroPeriodEl.textContent = nextDraw.next_period || sportLotteryAppData.aiPredictions.target_period || '-';

    const heroDateDisplayEl = document.getElementById('heroDateDisplay');
    if (heroDateDisplayEl) heroDateDisplayEl.textContent = nextDraw.next_date_display || '-';

    const heroDrawTimeEl = document.getElementById('heroDrawTime');
    if (heroDrawTimeEl) heroDrawTimeEl.textContent = `${nextDraw.draw_time || '21:25'} 开奖`;

    const heroPredictionDateEl = document.getElementById('heroPredictionDate');
    if (heroPredictionDateEl) heroPredictionDateEl.textContent = sportLotteryAppData.aiPredictions.prediction_date || '-';

    const heroCountdownEl = document.getElementById('heroCountdown');
    if (heroCountdownEl) {
        const daysUntil = calculateSportsLotteryDaysUntil(nextDraw.next_date);
        heroCountdownEl.textContent = daysUntil > 0 ? `距离开奖仅剩 ${daysUntil} 天` : '即将开奖';
    }
}

function renderSportsLotteryModelsGrid() {
    const modelsGridEl = document.getElementById('modelsGrid');
    if (!modelsGridEl || !sportLotteryAppData.aiPredictions) return;

    modelsGridEl.innerHTML = '';

    const targetPeriod = sportLotteryAppData.aiPredictions.target_period;
    const latestDraw = sportLotteryAppData.lotteryHistory?.data?.[0];
    let actualResult = null;

    if (latestDraw && parseInt(targetPeriod, 10) <= parseInt(latestDraw.period, 10)) {
        actualResult = sportLotteryAppData.lotteryHistory.data.find(draw => draw.period === targetPeriod) || null;
        if (actualResult) {
            modelsGridEl.appendChild(createSportsLotteryDrawnStatusBanner(actualResult));
        }
    }

    sportLotteryAppData.aiPredictions.models.forEach(model => {
        modelsGridEl.appendChild(SportsLotteryComponents.createModelCard(model, actualResult));
    });

    // 渲染复式号码推荐（汇总所有模型预测）
    renderSportsLotteryCompoundSelection();
}

function createSportsLotteryDrawnStatusBanner(actualResult) {
    const banner = document.createElement('div');
    banner.className = 'drawn-status-banner';
    banner.innerHTML = `
        <div class="drawn-status-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        </div>
        <div class="drawn-status-content">
            <h3 class="drawn-status-title">第 ${actualResult.period} 期已开奖</h3>
            <p class="drawn-status-subtitle">以下为大乐透 AI 预测命中情况对比</p>
        </div>
        <div class="drawn-status-balls"></div>
    `;

    const ballsContainer = banner.querySelector('.drawn-status-balls');
    actualResult.red_balls.forEach(num => {
        const span = document.createElement('span');
        span.className = 'mini-result-ball red';
        span.textContent = num;
        ballsContainer.appendChild(span);
    });
    actualResult.blue_balls.forEach(num => {
        const span = document.createElement('span');
        span.className = 'mini-result-ball blue';
        span.textContent = num;
        ballsContainer.appendChild(span);
    });

    return banner;
}

function _buildConsensusStats(models) {
    const redFreq = {};
    const blueFreq = {};

    models.forEach(model => {
        model.predictions.forEach(pred => {
            pred.red_balls.forEach(ball => {
                redFreq[ball] = (redFreq[ball] || 0) + 1;
            });
            pred.blue_balls.forEach(ball => {
                blueFreq[ball] = (blueFreq[ball] || 0) + 1;
            });
        });
    });

    const totalPredictions = models.reduce((sum, m) => sum + m.predictions.length, 0);
    const toRankedList = (freqMap) => Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ball, count]) => ({
            ball,
            count,
            rate: totalPredictions ? Math.round((count / totalPredictions) * 100) : 0
        }));

    return {
        redRanked: toRankedList(redFreq),
        blueRanked: toRankedList(blueFreq),
        totalPredictions,
        modelCount: models.length
    };
}

function _pickByConsensus(rankedList, pickCount, minRate) {
    let picked = rankedList.filter(item => item.rate >= minRate);
    if (picked.length < pickCount) {
        picked = rankedList.slice(0, pickCount);
    } else if (picked.length > pickCount) {
        picked = picked
            .sort((a, b) => b.count - a.count || a.ball.localeCompare(b.ball))
            .slice(0, pickCount);
    }
    return picked.sort((a, b) => a.ball.localeCompare(b.ball));
}

function generateConsensusCompound(models, config) {
    const stats = _buildConsensusStats(models);
    return {
        red: _pickByConsensus(stats.redRanked, config.redCount, config.redMinRate),
        blue: _pickByConsensus(stats.blueRanked, config.blueCount, config.blueMinRate),
        totalPredictions: stats.totalPredictions,
        modelCount: stats.modelCount
    };
}

function _expandToFullBallRange(rankedList, start, end, totalPredictions) {
    const rankedMap = {};
    rankedList.forEach(item => {
        rankedMap[item.ball] = item;
    });

    const full = [];
    for (let n = start; n <= end; n++) {
        const ball = String(n).padStart(2, '0');
        const hit = rankedMap[ball];
        const count = hit ? hit.count : 0;
        full.push({
            ball,
            count,
            rate: totalPredictions ? Math.round((count / totalPredictions) * 100) : 0
        });
    }
    return full;
}

function generateModelPredictionSummary(models) {
    const stats = _buildConsensusStats(models);
    return {
        red: _expandToFullBallRange(stats.redRanked, 1, 35, stats.totalPredictions).filter(item => item.count > 0),
        blue: _expandToFullBallRange(stats.blueRanked, 1, 12, stats.totalPredictions).filter(item => item.count > 0),
        totalPredictions: stats.totalPredictions,
        modelCount: stats.modelCount
    };
}

function _createBallMetaMap(start, end) {
    const metaMap = {};
    for (let n = start; n <= end; n++) {
        const ball = String(n).padStart(2, '0');
        metaMap[ball] = {
            ball,
            count: 0,
            models: new Set()
        };
    }
    return metaMap;
}

function _sortSummaryBalls(items, sortOrder) {
    return items.sort((a, b) => {
        if (sortOrder === 'asc') {
            return a.count - b.count || a.ball.localeCompare(b.ball);
        }
        return b.count - a.count || a.ball.localeCompare(b.ball);
    });
}

function generateFilteredModelPredictionSummary(models, selectedModelIds, sortOrder = 'desc') {
    const selectedModels = models.filter(model => selectedModelIds.includes(model.model_id));
    const selectedModelCount = selectedModels.length;
    const totalPredictions = selectedModels.reduce((sum, model) => sum + model.predictions.length, 0);
    const redMetaMap = _createBallMetaMap(1, 35);
    const blueMetaMap = _createBallMetaMap(1, 12);

    selectedModels.forEach(model => {
        const modelRedHits = new Set();
        const modelBlueHits = new Set();

        model.predictions.forEach(prediction => {
            prediction.red_balls.forEach(ball => {
                redMetaMap[ball].count += 1;
                modelRedHits.add(ball);
            });
            prediction.blue_balls.forEach(ball => {
                blueMetaMap[ball].count += 1;
                modelBlueHits.add(ball);
            });
        });

        modelRedHits.forEach(ball => redMetaMap[ball].models.add(model.model_id));
        modelBlueHits.forEach(ball => blueMetaMap[ball].models.add(model.model_id));
    });

    const toSummaryZone = (metaMap, commonOnly) => {
        if (!selectedModelCount) return [];

        return _sortSummaryBalls(
            Object.values(metaMap)
                .filter(item => item.count > 0)
                .map(item => ({
                    ball: item.ball,
                    count: item.count,
                    predictionCount: item.count,
                    rate: totalPredictions ? Math.round((item.count / totalPredictions) * 100) : 0,
                    matchedModels: Array.from(item.models),
                    matchedModelCount: item.models.size
                }))
                .filter(item => !commonOnly || item.matchedModelCount === selectedModelCount),
            sortOrder
        );
    };

    const commonOnly = sportLotteryUiState.compound.commonOnly;
    const redZone = toSummaryZone(redMetaMap, commonOnly);
    const blueZone = toSummaryZone(blueMetaMap, commonOnly);

    return {
        red: redZone,
        blue: blueZone,
        totalPredictions,
        selectedModelCount,
        selectedModels: selectedModels.map(model => ({
            model_id: model.model_id,
            model_name: model.model_name
        })),
        totalDisplayedNumbers: redZone.length + blueZone.length,
        sortOrder,
        commonOnly,
        zoneMeta: {
            red: {
                isCommonOnly: commonOnly
            },
            blue: {
                isCommonOnly: commonOnly
            }
        }
    };
}

function generateCompound6x3(models) {
    return generateConsensusCompound(models, {
        redCount: 6,
        blueCount: 3,
        redMinRate: 30,
        blueMinRate: 25
    });
}

function generateCompound7x3(models) {
    return generateConsensusCompound(models, {
        redCount: 7,
        blueCount: 3,
        redMinRate: 25,
        blueMinRate: 20
    });
}

function generateCompound7x4(models) {
    return generateConsensusCompound(models, {
        redCount: 7,
        blueCount: 4,
        redMinRate: 20,
        blueMinRate: 15
    });
}

function renderSportsLotteryCompoundSelection() {
    const container = document.getElementById('compoundSelectionContainer');
    if (!container || !sportLotteryAppData.aiPredictions) return;

    const models = sportLotteryAppData.aiPredictions.models;
    const summary = generateFilteredModelPredictionSummary(
        models,
        sportLotteryUiState.compound.selectedModelIds,
        sportLotteryUiState.compound.sortOrder
    );
    const compound6x3 = generateCompound6x3(models);
    const compound7x3 = generateCompound7x3(models);
    const compound7x4 = generateCompound7x4(models);

    container.innerHTML = '';
    container.appendChild(SportsLotteryComponents.createCompoundCard({
        types: [
            {
                label: '模型预测汇总',
                tag: '汇总',
                data: summary,
                rule: summary.selectedModelCount
                    ? (summary.commonOnly
                        ? '当前仅展示所有已选模型共同预测过的号码，并按号码在预测组中的累计出现次数排序。'
                        : '当前展示所有已选模型预测过的号码，并同时显示累计出现次数与命中模型数。')
                    : '请先在筛选框中选择至少一个模型，再查看共同预测号码汇总。',
                basis: 'prediction',
                summaryControls: {
                    selectedModelIds: sportLotteryUiState.compound.selectedModelIds,
                    sortOrder: sportLotteryUiState.compound.sortOrder,
                    commonOnly: sportLotteryUiState.compound.commonOnly,
                    isModelDropdownOpen: sportLotteryUiState.compound.isModelDropdownOpen,
                    models: models.map(model => ({
                        model_id: model.model_id,
                        model_name: model.model_name
                    }))
                }
            },
            {
                label: '6+3 进阶复式',
                tag: '6+3',
                data: compound6x3,
                rule: '基于 AI 模型预测共识度，采用中阈值筛选并扩展到 6+3，兼顾主共识号码与次共识号码',
                basis: 'prediction'
            },
            {
                label: '7+3 扩展复式',
                tag: '7+3',
                data: compound7x3,
                rule: '基于 AI 模型预测共识度，优先扩展前区覆盖范围，同时保持后区核心共识号码稳定性',
                basis: 'prediction'
            },
            {
                label: '7+4 豪华复式',
                tag: '7+4',
                data: compound7x4,
                rule: '基于 AI 模型预测共识度，采用低阈值扩容到 7+4，覆盖高共识到潜在共识区间',
                basis: 'prediction'
            }
        ],
        activeTabIndex: sportLotteryUiState.compound.activeTabIndex
    }));
}

function handleSportsLotteryCompoundInteractions(event) {
    const compoundCard = event.target.closest('.compound-selection-card');
    if (!compoundCard) {
        if (sportLotteryUiState.compound.isModelDropdownOpen) {
            sportLotteryUiState.compound.isModelDropdownOpen = false;
            renderSportsLotteryCompoundSelection();
        }
        return;
    }

    const tabButton = event.target.closest('.compound-tab');
    if (tabButton) {
        sportLotteryUiState.compound.activeTabIndex = Number(tabButton.dataset.idx) || 0;
        renderSportsLotteryCompoundSelection();
        return;
    }

    const sortButton = event.target.closest('[data-sort-order]');
    if (sortButton) {
        sportLotteryUiState.compound.sortOrder = sortButton.dataset.sortOrder;
        renderSportsLotteryCompoundSelection();
        return;
    }

    const dropdownToggle = event.target.closest('[data-role="model-filter-toggle"]');
    if (dropdownToggle) {
        sportLotteryUiState.compound.isModelDropdownOpen = !sportLotteryUiState.compound.isModelDropdownOpen;
        renderSportsLotteryCompoundSelection();
        return;
    }

    if (!event.target.closest('.summary-filter-dropdown')) {
        if (sportLotteryUiState.compound.isModelDropdownOpen) {
            sportLotteryUiState.compound.isModelDropdownOpen = false;
            renderSportsLotteryCompoundSelection();
        }
    }
}

function handleSportsLotteryCompoundChange(event) {
    if (event.target.matches('[data-role="common-only-toggle"]')) {
        sportLotteryUiState.compound.commonOnly = event.target.checked;
        renderSportsLotteryCompoundSelection();
        return;
    }

    if (!event.target.matches('.summary-filter-option input[type="checkbox"]')) return;

    const modelId = event.target.value;
    const nextSelectedModelIds = new Set(sportLotteryUiState.compound.selectedModelIds);
    if (event.target.checked) {
        nextSelectedModelIds.add(modelId);
    } else {
        nextSelectedModelIds.delete(modelId);
    }

    sportLotteryUiState.compound.selectedModelIds = sportLotteryAppData.aiPredictions.models
        .map(model => model.model_id)
        .filter(id => nextSelectedModelIds.has(id));
    renderSportsLotteryCompoundSelection();
}

function renderSportsLotteryHistoryTab() {
    renderSportsLotteryAccuracyChart();
    renderSportsLotteryAccuracyCards();
    renderSportsLotteryHistoryTable();
}

function renderSportsLotteryAccuracyChart() {
    const chartEl = document.getElementById('accuracyChart');
    if (!chartEl || !sportLotteryAppData.predictionsHistory) return;

    destroySportsLotteryChart(chartEl);
    const chartData = prepareSportsLotteryChartData();

    const chart = new Chart(chartEl, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: chartData.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 7,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: '命中球数'
                    }
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function prepareSportsLotteryChartData() {
    const history = sportLotteryAppData.predictionsHistory.predictions_history || [];
    const reversedHistory = [...history].reverse();
    const labels = [];
    const modelsData = {};

    reversedHistory.forEach(record => {
        labels.push(record.target_period);
        record.models.forEach(model => {
            if (!modelsData[model.model_name]) {
                modelsData[model.model_name] = [];
            }
            const bestHit = Math.max(...model.predictions.map(p => p.hit_result?.total_hits || 0), 0);
            modelsData[model.model_name].push(bestHit);
        });
    });

    const colors = {
        'GPT-4o': '#10b981',
        'Claude-4.6': '#8b5cf6',
        'Gemini-3': '#3b82f6',
        'DeepSeek-v3.2': '#f59e0b'
    };

    const datasets = Object.keys(modelsData).map(modelName => ({
        label: modelName,
        data: modelsData[modelName],
        borderColor: colors[modelName] || '#6b7280',
        backgroundColor: colors[modelName] || '#6b7280',
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        tension: 0.15
    }));

    return { labels, datasets };
}

function renderSportsLotteryAccuracyCards() {
    const containerEl = document.getElementById('accuracyCardsContainer');
    if (!containerEl || !sportLotteryAppData.predictionsHistory) return;

    containerEl.innerHTML = '';
    const records = sportLotteryAppData.predictionsHistory.predictions_history || [];

    if (records.length === 0) {
        containerEl.appendChild(SportsLotteryComponents.createEmptyState('暂无大乐透历史预测命中记录。'));
        return;
    }

    records.forEach(record => {
        containerEl.appendChild(SportsLotteryComponents.createAccuracyCard(record));
    });
}

function renderSportsLotteryHistoryTable() {
    const tableBodyEl = document.getElementById('historyTableBody');
    if (!tableBodyEl || !sportLotteryAppData.lotteryHistory) return;

    tableBodyEl.innerHTML = '';
    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        tableBodyEl.appendChild(SportsLotteryComponents.createHistoryTableRow(draw));
    });
}

function renderSportsLotteryStatisticsCards() {
    if (!sportLotteryAppData.lotteryHistory) return;

    const redFrequency = {};
    for (let i = 1; i <= 35; i++) {
        redFrequency[String(i).padStart(2, '0')] = 0;
    }

    const blueFrequency = {};
    for (let i = 1; i <= 12; i++) {
        blueFrequency[String(i).padStart(2, '0')] = 0;
    }

    let totalSum = 0;

    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        draw.red_balls.forEach(ball => {
            redFrequency[ball] = (redFrequency[ball] || 0) + 1;
        });
        draw.blue_balls.forEach(ball => {
            blueFrequency[ball] = (blueFrequency[ball] || 0) + 1;
        });
        totalSum += draw.red_balls.reduce((acc, ball) => acc + parseInt(ball, 10), 0);
    });

    const hottestRed = Object.entries(redFrequency).sort((a, b) => b[1] - a[1])[0];
    const hottestBluePair = Object.entries(blueFrequency).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const avgSum = Math.round(totalSum / sportLotteryAppData.lotteryHistory.data.length);

    const totalDrawsEl = document.getElementById('statTotalDraws');
    if (totalDrawsEl) totalDrawsEl.textContent = `${sportLotteryAppData.lotteryHistory.data.length} 期`;

    const hottestRedEl = document.getElementById('statHottestRed');
    if (hottestRedEl && hottestRed) hottestRedEl.textContent = `${hottestRed[0]} (${hottestRed[1]}次)`;

    const hottestBlueEl = document.getElementById('statHottestBlue');
    if (hottestBlueEl && hottestBluePair.length > 0) {
        hottestBlueEl.textContent = hottestBluePair.map(item => `${item[0]}(${item[1]})`).join(' / ');
    }

    const avgSumEl = document.getElementById('statAvgSum');
    if (avgSumEl) avgSumEl.textContent = avgSum;
}

function renderSportsLotteryFrequencyChart() {
    if (!sportLotteryAppData.lotteryHistory) return;
    const chartEl = document.getElementById('frequencyChart');
    if (!chartEl) return;

    destroySportsLotteryChart(chartEl);

    const frequency = {};
    for (let i = 1; i <= 35; i++) {
        frequency[String(i).padStart(2, '0')] = 0;
    }

    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        draw.red_balls.forEach(ball => {
            frequency[ball] = (frequency[ball] || 0) + 1;
        });
    });

    const labels = Object.keys(frequency).sort();
    const data = labels.map(label => frequency[label]);

    const chart = new Chart(chartEl, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '出现次数',
                data,
                backgroundColor: '#fca5a5',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function renderSportsLotteryBlueFrequencyChart() {
    if (!sportLotteryAppData.lotteryHistory) return;
    const chartEl = document.getElementById('blueFrequencyChart');
    if (!chartEl) return;

    destroySportsLotteryChart(chartEl);

    const frequency = {};
    for (let i = 1; i <= 12; i++) {
        frequency[String(i).padStart(2, '0')] = 0;
    }

    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        draw.blue_balls.forEach(ball => {
            frequency[ball] = (frequency[ball] || 0) + 1;
        });
    });

    const labels = Object.keys(frequency).sort();
    const data = labels.map(label => frequency[label]);

    const chart = new Chart(chartEl, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '出现次数',
                data,
                backgroundColor: '#93c5fd',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function renderSportsLotteryOddEvenChart() {
    if (!sportLotteryAppData.lotteryHistory) return;
    const chartEl = document.getElementById('oddEvenChart');
    if (!chartEl) return;

    destroySportsLotteryChart(chartEl);

    const ratioCount = {};

    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        const oddCount = draw.red_balls.filter(ball => parseInt(ball, 10) % 2 === 1).length;
        const evenCount = draw.red_balls.length - oddCount;
        const ratio = `${oddCount}:${evenCount}`;
        ratioCount[ratio] = (ratioCount[ratio] || 0) + 1;
    });

    const commonRatios = ['0:5', '1:4', '2:3', '3:2', '4:1', '5:0'];
    const labels = commonRatios.filter(ratio => ratioCount[ratio]);
    const data = labels.map(label => ratioCount[label]);

    const chart = new Chart(chartEl, {
        type: 'doughnut',
        data: {
            labels: labels.map(label => `${label} (奇:偶)`),
            datasets: [{
                data,
                backgroundColor: ['#ef4444', '#f97316', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: { size: 11 }
                    }
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function renderSportsLotterySumTrendChart() {
    if (!sportLotteryAppData.lotteryHistory) return;
    const chartEl = document.getElementById('sumTrendChart');
    if (!chartEl) return;

    destroySportsLotteryChart(chartEl);

    const recentDraws = sportLotteryAppData.lotteryHistory.data.slice(0, 30).reverse();
    const labels = recentDraws.map(draw => draw.period);
    const sums = recentDraws.map(draw => draw.red_balls.reduce((acc, ball) => acc + parseInt(ball, 10), 0));
    const avgSum = sums.reduce((acc, value) => acc + value, 0) / sums.length;

    const minValue = Math.min(...sums) - 10;
    const maxValue = Math.max(...sums) + 10;

    const chart = new Chart(chartEl, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '前区和值',
                    data: sums,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: '平均值',
                    data: Array(sums.length).fill(avgSum),
                    borderColor: '#94a3b8',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.max(0, minValue),
                    max: maxValue
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function renderSportsLotteryZoneDistributionChart() {
    if (!sportLotteryAppData.lotteryHistory) return;
    const chartEl = document.getElementById('zoneDistributionChart');
    if (!chartEl) return;

    destroySportsLotteryChart(chartEl);

    const zones = {
        '01-12': 0,
        '13-24': 0,
        '25-35': 0
    };

    sportLotteryAppData.lotteryHistory.data.forEach(draw => {
        draw.red_balls.forEach(ball => {
            const num = parseInt(ball, 10);
            if (num <= 12) zones['01-12']++;
            else if (num <= 24) zones['13-24']++;
            else zones['25-35']++;
        });
    });

    const labels = Object.keys(zones);
    const data = Object.values(zones);

    const chart = new Chart(chartEl, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '出现次数',
                data,
                backgroundColor: ['#fca5a5', '#93c5fd', '#d8b4fe'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 10 }
                }
            }
        }
    });

    sportLotteryCharts.push(chart);
}

function renderSportsLotteryAllAnalysisCharts() {
    renderSportsLotteryStatisticsCards();
    renderSportsLotteryFrequencyChart();
    renderSportsLotteryBlueFrequencyChart();
    renderSportsLotteryOddEvenChart();
    renderSportsLotterySumTrendChart();
    renderSportsLotteryZoneDistributionChart();
}

function setupSportsLotteryEventListeners() {
    const navItems = document.querySelectorAll('.nav-item[data-tab]');
    navItems.forEach(item => {
        item.addEventListener('click', () => handleSportsLotteryTabSwitch(item.dataset.tab));
    });

    const mobileNavItems = document.querySelectorAll('.mobile-nav-item[data-tab]');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => handleSportsLotteryTabSwitch(item.dataset.tab));
    });

    document.addEventListener('click', handleSportsLotteryCompoundInteractions);
    document.addEventListener('change', handleSportsLotteryCompoundChange);
}

function handleSportsLotteryTabSwitch(tabName) {
    document.querySelectorAll('.nav-item[data-tab], .mobile-nav-item[data-tab]').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tabName);
    });

    if (tabName === 'analysis') {
        setTimeout(() => renderSportsLotteryAllAnalysisCharts(), 100);
    }
}

function destroySportsLotteryChart(canvasEl) {
    const existingChart = Chart.getChart(canvasEl);
    if (existingChart) {
        existingChart.destroy();
        sportLotteryCharts = sportLotteryCharts.filter(chart => chart !== existingChart);
    }
}

function hideSportsLotteryLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const mainApp = document.getElementById('mainApp');

    if (loadingScreen) loadingScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
}

function calculateSportsLotteryDaysUntil(targetDateStr) {
    if (!targetDateStr) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(targetDateStr);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSportsLotteryApp);
} else {
    initSportsLotteryApp();
}
