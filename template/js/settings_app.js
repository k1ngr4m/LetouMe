const SettingsApp = {
    state: {
        models: [],
        providers: [],
        selectedModelCode: null,
        includeDeleted: false,
        mode: 'create',
        isEditorOpen: false
    },

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadProviders();
        await this.loadModels();
        this.closeEditor();
    },

    cacheElements() {
        this.elements = {
            modelList: document.getElementById('modelList'),
            message: document.getElementById('settingsMessage'),
            listSummary: document.getElementById('settingsListSummary'),
            editorModal: document.getElementById('editorModal'),
            editorBackdrop: document.getElementById('editorBackdrop'),
            editorTitle: document.getElementById('editorTitle'),
            editorSubtitle: document.getElementById('editorSubtitle'),
            closeEditorButton: document.getElementById('closeEditorButton'),
            form: document.getElementById('modelForm'),
            showDeletedToggle: document.getElementById('showDeletedToggle'),
            newModelButton: document.getElementById('newModelButton'),
            saveButton: document.getElementById('saveButton'),
            toggleStatusButton: document.getElementById('toggleStatusButton'),
            deleteButton: document.getElementById('deleteButton'),
            restoreButton: document.getElementById('restoreButton'),
            modelCode: document.getElementById('fieldModelCode'),
            displayName: document.getElementById('fieldDisplayName'),
            provider: document.getElementById('fieldProvider'),
            apiModelName: document.getElementById('fieldApiModelName'),
            version: document.getElementById('fieldVersion'),
            tags: document.getElementById('fieldTags'),
            baseUrl: document.getElementById('fieldBaseUrl'),
            apiKey: document.getElementById('fieldApiKey'),
            appCode: document.getElementById('fieldAppCode'),
            temperature: document.getElementById('fieldTemperature'),
            isActive: document.getElementById('fieldIsActive')
        };
    },

    bindEvents() {
        this.elements.form.addEventListener('submit', event => this.handleSubmit(event));
        this.elements.newModelButton.addEventListener('click', () => this.openCreateForm());
        this.elements.closeEditorButton.addEventListener('click', () => this.closeEditor());
        this.elements.editorBackdrop.addEventListener('click', () => this.closeEditor());
        this.elements.showDeletedToggle.addEventListener('change', async event => {
            this.state.includeDeleted = Boolean(event.target.checked);
            await this.loadModels();
        });
        this.elements.toggleStatusButton.addEventListener('click', async () => this.toggleStatus());
        this.elements.deleteButton.addEventListener('click', async () => this.deleteSelectedModel());
        this.elements.restoreButton.addEventListener('click', async () => this.restoreSelectedModel());
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.state.isEditorOpen) {
                this.closeEditor();
            }
        });
    },

    async loadProviders() {
        const data = await this.fetchJson('/api/settings/providers');
        this.state.providers = Array.isArray(data.providers) ? data.providers : [];
        this.elements.provider.innerHTML = this.state.providers
            .map(provider => `<option value="${provider.code}">${provider.name}</option>`)
            .join('');
    },

    async loadModels() {
        const query = this.state.includeDeleted ? '?include_deleted=true' : '';
        const data = await this.fetchJson(`/api/settings/models${query}`);
        this.state.models = Array.isArray(data.models) ? data.models : [];
        this.renderModelList();
    },

    renderModelList() {
        const activeCount = this.state.models.filter(model => model.is_active && !model.is_deleted).length;
        this.elements.listSummary.textContent = `共 ${this.state.models.length} 个模型，当前启用 ${activeCount} 个`;

        if (!this.state.models.length) {
            this.elements.modelList.innerHTML = '<div class="settings-empty">当前没有模型配置。</div>';
            return;
        }

        this.elements.modelList.innerHTML = this.state.models.map(model => {
            const selectedClass = model.model_code === this.state.selectedModelCode ? ' selected' : '';
            const deletedBadge = model.is_deleted ? '<span class="settings-badge deleted">已删除</span>' : '';
            const activeBadge = model.is_active ? '<span class="settings-badge active">已启用</span>' : '<span class="settings-badge">已停用</span>';
            const tags = (model.tags || []).map(tag => `<span class="settings-tag">${tag}</span>`).join('');

            return `
                <button class="settings-model-card${selectedClass}" type="button" data-model-code="${model.model_code}">
                    <div class="settings-model-card-top">
                        <div>
                            <strong>${model.display_name}</strong>
                            <p>${model.model_code}</p>
                        </div>
                        <div class="settings-badges">${activeBadge}${deletedBadge}</div>
                    </div>
                    <div class="settings-model-meta">
                        <span>${model.provider}</span>
                        <span>${model.api_model_name}</span>
                    </div>
                    <div class="settings-tag-row">${tags || '<span class="settings-tag muted">无标签</span>'}</div>
                </button>
            `;
        }).join('');

        this.elements.modelList.querySelectorAll('[data-model-code]').forEach(button => {
            button.addEventListener('click', async () => {
                const modelCode = button.getAttribute('data-model-code');
                if (!modelCode) return;
                await this.openEditForm(modelCode);
            });
        });
    },

    openCreateForm() {
        this.state.mode = 'create';
        this.state.selectedModelCode = null;
        this.state.isEditorOpen = true;
        this.elements.editorTitle.textContent = '新增模型';
        this.elements.editorSubtitle.textContent = '创建新的模型定义并直接写入数据库。';
        this.elements.form.reset();
        this.elements.modelCode.disabled = false;
        this.elements.isActive.checked = true;
        this.elements.deleteButton.hidden = true;
        this.elements.restoreButton.hidden = true;
        this.elements.toggleStatusButton.hidden = true;
        this.elements.editorModal.hidden = false;
        this.renderModelList();
    },

    async openEditForm(modelCode) {
        const model = await this.fetchJson(`/api/settings/models/${encodeURIComponent(modelCode)}`);
        this.state.mode = 'edit';
        this.state.selectedModelCode = model.model_code;
        this.state.isEditorOpen = true;
        this.elements.editorTitle.textContent = `编辑模型: ${model.display_name}`;
        this.elements.editorSubtitle.textContent = '模型编码创建后保持不变，其他字段可以随时修改。';
        this.elements.modelCode.value = model.model_code;
        this.elements.modelCode.disabled = true;
        this.elements.displayName.value = model.display_name || '';
        this.elements.provider.value = model.provider || '';
        this.elements.apiModelName.value = model.api_model_name || '';
        this.elements.version.value = model.version || '';
        this.elements.tags.value = (model.tags || []).join(',');
        this.elements.baseUrl.value = model.base_url || '';
        this.elements.apiKey.value = model.api_key || '';
        this.elements.appCode.value = model.app_code || '';
        this.elements.temperature.value = model.temperature ?? '';
        this.elements.isActive.checked = Boolean(model.is_active);
        this.elements.deleteButton.hidden = false;
        this.elements.restoreButton.hidden = !model.is_deleted;
        this.elements.toggleStatusButton.hidden = model.is_deleted;
        this.elements.toggleStatusButton.textContent = model.is_active ? '停用模型' : '启用模型';
        this.elements.editorModal.hidden = false;
        this.renderModelList();
    },

    closeEditor() {
        this.state.isEditorOpen = false;
        this.state.mode = 'create';
        this.state.selectedModelCode = null;
        this.elements.editorModal.hidden = true;
        this.elements.form.reset();
        this.renderModelList();
    },

    collectPayload() {
        return {
            model_code: this.elements.modelCode.value.trim(),
            display_name: this.elements.displayName.value.trim(),
            provider: this.elements.provider.value,
            api_model_name: this.elements.apiModelName.value.trim(),
            version: this.elements.version.value.trim(),
            tags: this.elements.tags.value
                .split(',')
                .map(tag => tag.trim())
                .filter(Boolean),
            base_url: this.elements.baseUrl.value.trim(),
            api_key: this.elements.apiKey.value.trim(),
            app_code: this.elements.appCode.value.trim(),
            temperature: this.elements.temperature.value === '' ? null : Number(this.elements.temperature.value),
            is_active: this.elements.isActive.checked
        };
    },

    async handleSubmit(event) {
        event.preventDefault();
        const payload = this.collectPayload();
        try {
            if (this.state.mode === 'create') {
                await this.fetchJson('/api/settings/models', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                this.showMessage('模型已创建。');
            } else if (this.state.selectedModelCode) {
                await this.fetchJson(`/api/settings/models/${encodeURIComponent(this.state.selectedModelCode)}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                this.showMessage('模型已更新。');
            }
            await this.loadModels();
            if (this.state.mode === 'create') {
                this.closeEditor();
            } else if (this.state.selectedModelCode) {
                await this.openEditForm(this.state.selectedModelCode);
            }
        } catch (error) {
            this.showMessage(error.message, true);
        }
    },

    async toggleStatus() {
        if (!this.state.selectedModelCode) return;
        const payload = { is_active: !this.elements.isActive.checked };
        try {
            const model = await this.fetchJson(`/api/settings/models/${encodeURIComponent(this.state.selectedModelCode)}/status`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            this.showMessage(model.is_active ? '模型已启用。' : '模型已停用。');
            await this.loadModels();
            await this.openEditForm(this.state.selectedModelCode);
        } catch (error) {
            this.showMessage(error.message, true);
        }
    },

    async deleteSelectedModel() {
        if (!this.state.selectedModelCode) return;
        try {
            await this.fetchJson(`/api/settings/models/${encodeURIComponent(this.state.selectedModelCode)}`, {
                method: 'DELETE'
            });
            this.showMessage('模型已软删除。');
            await this.loadModels();
            this.closeEditor();
        } catch (error) {
            this.showMessage(error.message, true);
        }
    },

    async restoreSelectedModel() {
        if (!this.state.selectedModelCode) return;
        try {
            await this.fetchJson(`/api/settings/models/${encodeURIComponent(this.state.selectedModelCode)}/restore`, {
                method: 'POST'
            });
            this.showMessage('模型已恢复。');
            await this.loadModels();
            await this.openEditForm(this.state.selectedModelCode);
        } catch (error) {
            this.showMessage(error.message, true);
        }
    },

    showMessage(message, isError = false) {
        this.elements.message.hidden = false;
        this.elements.message.textContent = message;
        this.elements.message.classList.toggle('error', isError);
    },

    async fetchJson(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.detail || '请求失败');
        }
        return data;
    }
};

window.addEventListener('DOMContentLoaded', () => {
    SettingsApp.init().catch(error => {
        console.error('设置页初始化失败:', error);
    });
});
