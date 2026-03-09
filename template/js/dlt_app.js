/**
 * 大乐透主应用逻辑
 */

let sportLotteryAppData = {
    lotteryHistory: null,
    aiPredictions: null,
    predictionsHistory: null
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

function generateCompound5x2(models) {
    const redFreq = {};
    const blueFreq = {};

    models.forEach(model => {
        model.predictions.forEach(pred => {
            pred.red_balls.forEach(ball => { redFreq[ball] = (redFreq[ball] || 0) + 1; });
            pred.blue_balls.forEach(ball => { blueFreq[ball] = (blueFreq[ball] || 0) + 1; });
        });
    });

    const totalPredictions = models.reduce((sum, m) => sum + m.predictions.length, 0);

    const sortedRed = Object.entries(redFreq)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ball, count]) => ({ ball, count, rate: Math.round(count / totalPredictions * 100) }));

    const sortedBlue = Object.entries(blueFreq)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ball, count]) => ({ ball, count, rate: Math.round(count / totalPredictions * 100) }));

    const redThreshold = Math.max(3, Math.floor(totalPredictions * 0.25));
    let compoundRed = sortedRed.filter(item => item.count >= redThreshold);
    if (compoundRed.length < 5) compoundRed = sortedRed.slice(0, 5);
    if (compoundRed.length > 8) compoundRed = compoundRed.slice(0, 8);

    const blueThreshold = Math.max(2, Math.floor(totalPredictions * 0.2));
    let compoundBlue = sortedBlue.filter(item => item.count >= blueThreshold);
    if (compoundBlue.length < 2) compoundBlue = sortedBlue.slice(0, 2);
    if (compoundBlue.length > 4) compoundBlue = compoundBlue.slice(0, 4);

    compoundRed.sort((a, b) => a.ball.localeCompare(b.ball));
    compoundBlue.sort((a, b) => a.ball.localeCompare(b.ball));

    return {
        red: compoundRed,
        blue: compoundBlue,
        totalPredictions,
        modelCount: models.length
    };
}

function _calcHistoryStats(draws) {
    const pad = n => String(n).padStart(2, '0');
    const recent5 = draws.slice(0, 5);
    const recent10 = draws.slice(0, 10);
    const recent20 = draws.slice(0, 20);
    const recent30 = draws.slice(0, 30);

    const redStats = {};
    for (let i = 1; i <= 35; i++) {
        const ball = pad(i);
        const freq5 = recent5.filter(d => d.red_balls.includes(ball)).length;
        const freq10 = recent10.filter(d => d.red_balls.includes(ball)).length;
        const freq30 = recent30.filter(d => d.red_balls.includes(ball)).length;
        const missIdx = draws.findIndex(d => d.red_balls.includes(ball));
        const miss = missIdx === -1 ? draws.length : missIdx;

        const hotScore = freq5 * 5 + freq10 * 3 + freq30 * 2;
        const lastDraw = draws[0]?.red_balls || [];
        const hotAdj = lastDraw.includes(ball) ? hotScore * 0.6 : (miss >= 4 ? hotScore * 0.8 : hotScore);

        const coldRaw = miss >= 4 && miss <= 8 ? miss * 1.0 : (miss >= 9 && miss <= 16 ? miss * 1.4 : miss * 0.8);
        const reappear = miss === 0 && draws.slice(1, 5).every(d => !d.red_balls.includes(ball));
        const coldScore = reappear ? coldRaw * 1.3 : coldRaw;

        const trend = (freq5 / 5 - freq30 / 30) * 100 + (freq10 / 10 - freq30 / 30) * 50;
        const turnSignal = miss === 0 && draws.slice(1, 4).every(d => !d.red_balls.includes(ball));
        const cycleScore = turnSignal ? trend + 15 : trend;

        const balanceScore = freq30 >= 1 && freq30 <= 5 ? 10 : (freq30 > 5 ? 5 : 2);

        const composite = hotAdj * 0.30 + coldScore * 0.25 + balanceScore * 0.20 + cycleScore * 0.25;

        redStats[ball] = { ball, hotScore: hotAdj, coldScore, cycleScore, balanceScore, composite, miss, freq30, num: i };
    }

    const blueStats = {};
    for (let i = 1; i <= 12; i++) {
        const ball = pad(i);
        const freq20 = recent20.filter(d => (d.blue_balls || []).includes(ball)).length;
        const freq30 = recent30.filter(d => (d.blue_balls || []).includes(ball)).length;
        const missIdx = draws.findIndex(d => (d.blue_balls || []).includes(ball));
        const miss = missIdx === -1 ? draws.length : missIdx;
        const avgMiss = freq30 > 0 ? Math.round(30 / freq30) : 30;

        const hotScore = freq20 * 3 + freq30 * 1;
        const coldScore = miss >= 4 && miss <= 10 ? miss * 1.2 : miss * 0.7;
        const cycleScore = Math.max(0, 10 - Math.abs(miss - avgMiss));
        const midScore = freq30 >= 2 && freq30 <= 5 ? 8 : 3;
        const composite = hotScore * 0.35 + coldScore * 0.30 + cycleScore * 0.20 + midScore * 0.15;

        blueStats[ball] = { ball, hotScore, coldScore, cycleScore, composite, miss, freq20, freq30, avgMiss };
    }

    return { redStats, blueStats, totalDraws: draws.length };
}

function _ensureZoneBalance(candidates, count) {
    const zones = [
        candidates.filter(c => c.num >= 1 && c.num <= 12),
        candidates.filter(c => c.num >= 13 && c.num <= 24),
        candidates.filter(c => c.num >= 25 && c.num <= 35)
    ];
    const picked = [];
    zones.forEach(zone => {
        if (zone.length > 0) picked.push(zone[0]);
    });
    const remaining = candidates.filter(c => !picked.includes(c));
    remaining.forEach(c => { if (picked.length < count) picked.push(c); });
    return picked.slice(0, count).sort((a, b) => a.ball.localeCompare(b.ball));
}

function generateCompound6x3(draws) {
    const { redStats, blueStats, totalDraws } = _calcHistoryStats(draws);
    const allRed = Object.values(redStats);
    const allBlue = Object.values(blueStats);

    const hotPool = [...allRed].sort((a, b) => b.hotScore - a.hotScore).slice(0, 10);
    const coldPool = [...allRed].sort((a, b) => b.coldScore - a.coldScore).slice(0, 10);

    const merged = {};
    hotPool.forEach(c => { merged[c.ball] = { ...c, source: 'hot', score: c.hotScore * 0.6 + c.coldScore * 0.4 }; });
    coldPool.forEach(c => {
        if (merged[c.ball]) {
            merged[c.ball].score += c.coldScore * 0.3;
            merged[c.ball].source = 'both';
        } else {
            merged[c.ball] = { ...c, source: 'cold', score: c.hotScore * 0.4 + c.coldScore * 0.6 };
        }
    });

    const sortedCandidates = Object.values(merged).sort((a, b) => b.score - a.score);
    const redPicked = _ensureZoneBalance(sortedCandidates, 6);

    const blueByHot = [...allBlue].sort((a, b) => b.hotScore - a.hotScore);
    const blueByCold = [...allBlue].sort((a, b) => b.coldScore - a.coldScore);
    const blueScored = allBlue.map(b => ({
        ...b,
        finalScore: b.hotScore * 0.5 + b.coldScore * 0.3 + b.cycleScore * 0.2
    })).sort((a, b) => b.finalScore - a.finalScore);
    const bluePicked = blueScored.slice(0, 3).sort((a, b) => a.ball.localeCompare(b.ball));

    return {
        red: redPicked.map(c => ({ ball: c.ball, count: c.freq30, rate: Math.round(c.score * 10), source: c.source })),
        blue: bluePicked.map(c => ({ ball: c.ball, count: c.freq30, rate: Math.round(c.finalScore * 10) })),
        totalDraws
    };
}

function generateCompound7x4(draws) {
    const { redStats, blueStats, totalDraws } = _calcHistoryStats(draws);
    const allRed = Object.values(redStats);
    const allBlue = Object.values(blueStats);

    const compositeRanked = [...allRed].sort((a, b) => b.composite - a.composite).slice(0, 12);
    const redPicked = _ensureZoneBalance(compositeRanked, 7);

    const blueComposite = [...allBlue].sort((a, b) => b.composite - a.composite);
    const bluePicked = blueComposite.slice(0, 4).sort((a, b) => a.ball.localeCompare(b.ball));

    return {
        red: redPicked.map(c => ({ ball: c.ball, count: c.freq30, rate: Math.round(c.composite * 10) })),
        blue: bluePicked.map(c => ({ ball: c.ball, count: c.freq30, rate: Math.round(c.composite * 10) })),
        totalDraws
    };
}

function renderSportsLotteryCompoundSelection() {
    const container = document.getElementById('compoundSelectionContainer');
    if (!container || !sportLotteryAppData.aiPredictions) return;

    const models = sportLotteryAppData.aiPredictions.models;
    const draws = sportLotteryAppData.lotteryHistory?.data || [];

    const compound5x2 = generateCompound5x2(models);
    const compound6x3 = generateCompound6x3(draws);
    const compound7x4 = generateCompound7x4(draws);

    container.innerHTML = '';
    container.appendChild(SportsLotteryComponents.createCompoundCard({
        types: [
            {
                label: '5+2 基础复式',
                tag: '5+2',
                data: compound5x2,
                rule: '从 ' + compound5x2.modelCount + ' 个 AI 模型共 ' + compound5x2.totalPredictions + ' 组预测中，按号码出现频率筛选高共识度号码',
                basis: 'prediction'
            },
            {
                label: '6+3 进阶复式',
                tag: '6+3',
                data: compound6x3,
                rule: '基于近 30 期历史数据，融合热号加权频率与冷号遗漏回补得分，前区保证三区间覆盖，后区综合热度+遗漏+周期评分',
                basis: 'history'
            },
            {
                label: '7+4 豪华复式',
                tag: '7+4',
                data: compound7x4,
                rule: '基于近 30 期历史数据，采用四维综合评分（热度×0.30 + 遗漏×0.25 + 平衡×0.20 + 周期×0.25），前区保证三区间覆盖，后区同权综合排名',
                basis: 'history'
            }
        ]
    }));
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
        'GPT-5': '#10b981',
        'Claude 4.5': '#8b5cf6',
        'Gemini 2.5': '#3b82f6',
        'DeepSeek R1': '#f59e0b'
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
