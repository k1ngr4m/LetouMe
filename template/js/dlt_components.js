/**
 * 大乐透 UI 组件模块
 * 负责 5+2 玩法的号码展示、命中对比与历史记录卡片渲染
 */

const SportsLotteryComponents = {
    createLotteryBall(number, color, size = 'md', isHit = false) {
        const ball = document.createElement('div');
        ball.className = `lottery-ball ${color} size-${size}${isHit ? ' hit' : ''}`;
        ball.innerHTML = `<span>${number}</span>`;
        return ball;
    },

    createBallDivider() {
        const divider = document.createElement('div');
        divider.className = 'ball-divider';
        return divider;
    },

    getModelHeaderClass(modelName) {
        if (modelName.includes('GPT')) return 'model-header-gpt';
        if (modelName.includes('Claude')) return 'model-header-claude';
        if (modelName.includes('DeepSeek')) return 'model-header-deepseek';
        if (modelName.includes('Gemini')) return 'model-header-gemini';
        return 'model-header-gpt';
    },

    compareNumbers(prediction, actualResult) {
        if (!actualResult) {
            return null;
        }

        const redHits = prediction.red_balls.filter(ball => actualResult.red_balls.includes(ball));
        const actualBlueBalls = actualResult.blue_balls || [];
        const predictedBlueBalls = prediction.blue_balls || [];
        const blueHits = predictedBlueBalls.filter(ball => actualBlueBalls.includes(ball));

        return {
            redHits,
            redHitCount: redHits.length,
            blueHits,
            blueHitCount: blueHits.length,
            totalHits: redHits.length + blueHits.length
        };
    },

    createBallsFragment(redBalls, blueBalls, options = {}) {
        const {
            redSize = 'md',
            blueSize = 'md',
            redHits = [],
            blueHits = []
        } = options;

        const fragment = document.createDocumentFragment();
        redBalls.forEach(num => {
            fragment.appendChild(this.createLotteryBall(num, 'red', redSize, redHits.includes(num)));
        });

        fragment.appendChild(this.createBallDivider());

        blueBalls.forEach(num => {
            fragment.appendChild(this.createLotteryBall(num, 'blue', blueSize, blueHits.includes(num)));
        });

        return fragment;
    },

    createModelCard(model, actualResult = null) {
        const card = document.createElement('div');
        card.className = 'model-card';

        const headerClass = this.getModelHeaderClass(model.model_name);
        const safeModelId = model.model_id.replace(/[^a-zA-Z0-9-_]/g, '-');

        let bestHitCount = 0;
        let bestGroupId = null;
        if (actualResult) {
            model.predictions.forEach(prediction => {
                const hitResult = this.compareNumbers(prediction, actualResult);
                if (hitResult && hitResult.totalHits > bestHitCount) {
                    bestHitCount = hitResult.totalHits;
                    bestGroupId = prediction.group_id;
                }
            });
        }

        card.innerHTML = `
            <div class="model-card-header ${headerClass}">
                <div class="model-card-header-left">
                    <div class="model-icon-box">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>
                        </svg>
                    </div>
                    <div class="model-name-wrapper">
                        <h3>${model.model_name}</h3>
                        <div class="model-id">
                            <span>ID: ${model.model_id}</span>
                        </div>
                    </div>
                </div>
                <div class="model-card-header-right">
                    ${actualResult && bestHitCount > 0 ? `
                        <div class="model-best-hit-badge">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            <span>最佳 ${bestHitCount} 中</span>
                        </div>
                    ` : ''}
                    <div class="model-card-ticket-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="model-card-content">
                <div class="strategy-group" id="strategies-${safeModelId}"></div>
            </div>
        `;

        const strategiesContainer = card.querySelector(`#strategies-${safeModelId}`);
        model.predictions.forEach((prediction, index) => {
            const isBest = actualResult && prediction.group_id === bestGroupId;
            strategiesContainer.appendChild(this.createStrategyRow(prediction, index === model.predictions.length - 1, actualResult, isBest));
        });

        return card;
    },

    createStrategyRow(prediction, isLast = false, actualResult = null, isBest = false) {
        const row = document.createElement('div');
        row.className = 'strategy-row';

        const hitResult = actualResult ? this.compareNumbers(prediction, actualResult) : null;

        const header = document.createElement('div');
        header.className = 'strategy-header';
        header.innerHTML = `
            <div class="strategy-label-row">
                <div class="strategy-group-badge${isBest ? ' best' : ''}">${isBest ? '★ ' : ''}G-${prediction.group_id}</div>
                <span class="strategy-name">${prediction.strategy}</span>
                ${hitResult ? `
                    <div class="strategy-hit-stats">
                        <span class="hit-stat red">${hitResult.redHitCount}前</span>
                        <span class="hit-stat ${hitResult.blueHitCount > 0 ? 'blue' : 'miss'}">${hitResult.blueHitCount}后</span>
                    </div>
                ` : ''}
            </div>
        `;
        row.appendChild(header);

        const ballsContainer = document.createElement('div');
        ballsContainer.className = 'strategy-balls';
        ballsContainer.appendChild(this.createBallsFragment(prediction.red_balls, prediction.blue_balls, {
            redHits: hitResult?.redHits || [],
            blueHits: hitResult?.blueHits || []
        }));
        row.appendChild(ballsContainer);

        const desc = document.createElement('p');
        desc.className = 'strategy-description';
        desc.textContent = prediction.description;
        row.appendChild(desc);

        if (!isLast) {
            const separator = document.createElement('div');
            separator.className = 'strategy-separator';
            row.appendChild(separator);
        }

        return row;
    },

    createAccuracyCard(record) {
        const card = document.createElement('div');
        card.className = 'accuracy-card';

        const result = record.actual_result;
        if (!result) return card;

        const header = document.createElement('div');
        header.className = 'accuracy-card-header';
        header.innerHTML = `
            <div class="accuracy-header-left">
                <div class="accuracy-trophy-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                </div>
                <div>
                    <h4 class="accuracy-header-title">第 ${result.period} 期</h4>
                    <span class="accuracy-header-subtitle">命中回溯报告</span>
                </div>
            </div>
            <span class="accuracy-header-date">${result.date}</span>
        `;
        card.appendChild(header);

        const actualSection = document.createElement('div');
        actualSection.className = 'actual-result-section';
        actualSection.innerHTML = `
            <div class="actual-result-label">
                <div class="actual-result-bar"></div>
                <p class="actual-result-text">开奖号码 Official Draw</p>
            </div>
        `;

        const actualBalls = document.createElement('div');
        actualBalls.className = 'actual-result-balls';
        actualBalls.appendChild(this.createBallsFragment(result.red_balls, result.blue_balls));
        actualSection.appendChild(actualBalls);
        card.appendChild(actualSection);

        const hitsList = document.createElement('div');
        hitsList.className = 'model-hits-list';
        record.models.forEach((model, index) => {
            hitsList.appendChild(this.createModelHitItem(model, index + 1, index === record.models.length - 1));
        });
        card.appendChild(hitsList);

        return card;
    },

    createModelHitItem(model, index, isLast = false) {
        const item = document.createElement('div');
        item.className = 'model-hit-item';
        const bestHit = Math.max(...model.predictions.map(p => p.hit_result?.total_hits || 0), 0);
        const safeModelId = model.model_id.replace(/[^a-zA-Z0-9-_]/g, '-');

        item.innerHTML = `
            ${!isLast ? '<div class="model-hit-connector"></div>' : ''}
            <div class="model-hit-row">
                <div class="model-hit-number">${index}</div>
                <div class="model-hit-content">
                    <div class="model-hit-header">
                        <h4 class="model-hit-name">${model.model_name}</h4>
                        ${bestHit >= 4 ? `
                        <span class="high-hit-badge">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            高命中: ${bestHit}
                        </span>` : ''}
                    </div>
                    <div class="prediction-groups" id="groups-${safeModelId}"></div>
                </div>
            </div>
        `;

        const groupsContainer = item.querySelector(`#groups-${safeModelId}`);
        model.predictions.forEach(prediction => {
            groupsContainer.appendChild(this.createPredictionGroupRow(prediction));
        });

        return item;
    },

    createPredictionGroupRow(prediction) {
        const row = document.createElement('div');
        const totalHits = prediction.hit_result?.total_hits || 0;
        const isWinning = totalHits >= 3;
        row.className = `prediction-group-row${isWinning ? ' winning' : ''}`;

        const ballsContainer = document.createElement('div');
        ballsContainer.className = 'prediction-group-balls';
        ballsContainer.innerHTML = `
            <span class="prediction-group-strategy">${prediction.strategy.substring(0, 8)}${prediction.strategy.length > 8 ? '..' : ''}</span>
        `;

        const ballsList = document.createElement('div');
        ballsList.className = 'prediction-group-balls-list';

        prediction.red_balls.forEach(num => {
            const isHit = prediction.hit_result?.red_hits?.includes(num);
            const miniBall = document.createElement('div');
            miniBall.className = `mini-ball${isHit ? ' hit' : ''}`;
            miniBall.textContent = num;
            ballsList.appendChild(miniBall);
        });

        prediction.blue_balls.forEach(num => {
            const isHit = prediction.hit_result?.blue_hits?.includes(num);
            const blueBall = document.createElement('div');
            blueBall.className = `mini-ball blue${isHit ? ' hit' : ''}`;
            blueBall.textContent = num;
            ballsList.appendChild(blueBall);
        });

        ballsContainer.appendChild(ballsList);
        row.appendChild(ballsContainer);

        const stats = document.createElement('div');
        stats.className = 'prediction-group-stats';
        const redHitCount = prediction.hit_result?.red_hit_count || 0;
        const blueHitCount = prediction.hit_result?.blue_hit_count || 0;

        stats.innerHTML = `
            <div class="stat-item">
                <span class="stat-value ${redHitCount > 0 ? 'has-hit' : 'no-hit'}">${redHitCount}</span>
                <span class="stat-label">前</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <span class="stat-value ${blueHitCount > 0 ? 'blue-hit' : 'no-hit'}">${blueHitCount}</span>
                <span class="stat-label">后</span>
            </div>
        `;
        row.appendChild(stats);

        return row;
    },

    createHistoryTableRow(draw) {
        const row = document.createElement('tr');

        const periodCell = document.createElement('td');
        periodCell.className = 'period-cell';
        periodCell.textContent = draw.period;
        row.appendChild(periodCell);

        const dateCell = document.createElement('td');
        dateCell.className = 'date-cell';
        dateCell.textContent = draw.date;
        row.appendChild(dateCell);

        const ballsCell = document.createElement('td');
        const ballsContainer = document.createElement('div');
        ballsContainer.className = 'balls-cell';
        ballsContainer.appendChild(this.createBallsFragment(draw.red_balls, draw.blue_balls, {
            redSize: 'sm',
            blueSize: 'sm'
        }));
        ballsCell.appendChild(ballsContainer);
        row.appendChild(ballsCell);

        return row;
    },

    createEmptyState(message) {
        const wrapper = document.createElement('div');
        wrapper.className = 'history-section';
        wrapper.style.textAlign = 'center';
        wrapper.style.color = 'var(--slate-500)';
        wrapper.style.fontSize = '0.95rem';
        wrapper.textContent = message;
        return wrapper;
    },

    createCompoundCard(compound) {
        const card = document.createElement('div');
        card.className = 'compound-selection-card';

        const header = document.createElement('div');
        header.className = 'compound-card-header';
        header.innerHTML = `
            <div class="compound-header-left">
                <div class="compound-icon-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                </div>
                <div>
                    <h3>AI 复式推荐</h3>
                    <span class="compound-subtitle">多维度统计分析生成三档复式方案</span>
                </div>
            </div>
        `;
        card.appendChild(header);

        const tabs = document.createElement('div');
        tabs.className = 'compound-tabs';
        compound.types.forEach((type, idx) => {
            const tab = document.createElement('button');
            tab.className = 'compound-tab' + (idx === 0 ? ' active' : '');
            tab.dataset.idx = idx;
            tab.innerHTML = `<span class="compound-tab-tag">${type.tag}</span>${type.label}`;
            tab.addEventListener('click', () => {
                tabs.querySelectorAll('.compound-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                card.querySelectorAll('.compound-type-panel').forEach(p => p.classList.remove('active'));
                card.querySelector(`.compound-type-panel[data-idx="${idx}"]`).classList.add('active');
            });
            tabs.appendChild(tab);
        });
        card.appendChild(tabs);

        const panelsWrap = document.createElement('div');
        panelsWrap.className = 'compound-panels';
        compound.types.forEach((type, idx) => {
            const panel = document.createElement('div');
            panel.className = 'compound-type-panel' + (idx === 0 ? ' active' : '');
            panel.dataset.idx = idx;

            const ruleBox = document.createElement('div');
            ruleBox.className = 'compound-rule-box';
            const basisIcon = type.basis === 'prediction'
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
            const basisLabel = type.basis === 'prediction' ? 'AI 模型共识' : '历史数据统计';
            ruleBox.innerHTML = `
                <div class="compound-rule-badge">${basisIcon}<span>${basisLabel}</span></div>
                <p class="compound-rule-text">${type.rule}</p>
            `;
            panel.appendChild(ruleBox);

            const content = document.createElement('div');
            content.className = 'compound-card-content';

            const totalRef = type.basis === 'prediction' ? type.data.totalPredictions : type.data.totalDraws;
            const redSection = this._createCompoundZone('前区精选', 'red', type.data.red, totalRef, type.basis);
            content.appendChild(redSection);
            const blueSection = this._createCompoundZone('后区精选', 'blue', type.data.blue, totalRef, type.basis);
            content.appendChild(blueSection);

            panel.appendChild(content);
            panelsWrap.appendChild(panel);
        });
        card.appendChild(panelsWrap);

        const footer = document.createElement('div');
        footer.className = 'compound-card-footer';
        footer.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            <span>5+2 基于 AI 模型预测共识度；6+3 融合热号与冷号双维分析；7+4 采用四维综合评分体系。复式号码仅供参考。</span>
        `;
        card.appendChild(footer);

        return card;
    },

    _createCompoundZone(title, color, balls, totalRef, basis) {
        const section = document.createElement('div');
        section.className = 'compound-zone';

        const label = document.createElement('div');
        label.className = `compound-zone-label ${color}`;
        label.textContent = title;
        section.appendChild(label);

        const ballsRow = document.createElement('div');
        ballsRow.className = 'compound-balls-row';

        balls.forEach(item => {
            const ballWrap = document.createElement('div');
            ballWrap.className = 'compound-ball-wrap';

            const ball = document.createElement('div');
            ball.className = `compound-ball ${color}`;
            ball.textContent = item.ball;
            ballWrap.appendChild(ball);

            const freq = document.createElement('div');
            freq.className = 'compound-ball-freq';
            freq.textContent = basis === 'prediction' ? `${item.count}/${totalRef}` : `${item.count}期`;
            ballWrap.appendChild(freq);

            const barRate = basis === 'prediction' ? item.rate : Math.min(100, Math.round(item.count / totalRef * 100 * 3));
            const bar = document.createElement('div');
            bar.className = `compound-freq-bar ${color}`;
            bar.innerHTML = `<div class="compound-freq-bar-fill" style="width: ${barRate}%"></div>`;
            ballWrap.appendChild(bar);

            ballsRow.appendChild(ballWrap);
        });

        section.appendChild(ballsRow);
        return section;
    }
};

window.SportsLotteryComponents = SportsLotteryComponents;
