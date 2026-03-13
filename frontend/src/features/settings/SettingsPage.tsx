import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { apiClient } from '../../shared/api/client'
import { appLogger } from '../../shared/lib/logger'
import type { SettingsModelPayload } from '../../shared/types/api'
import { StatusCard } from '../../shared/components/StatusCard'

const EMPTY_FORM: SettingsModelPayload = {
  model_code: '',
  display_name: '',
  provider: 'openai_compatible',
  api_model_name: '',
  version: '',
  tags: [],
  base_url: '',
  api_key: '',
  app_code: '',
  temperature: null,
  is_active: true,
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selectedModelCode, setSelectedModelCode] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<SettingsModelPayload>(EMPTY_FORM)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const modelsQuery = useQuery({
    queryKey: ['settings-models', includeDeleted],
    queryFn: () => apiClient.getSettingsModels(includeDeleted),
  })
  const providersQuery = useQuery({
    queryKey: ['settings-providers'],
    queryFn: () => apiClient.getSettingsProviders(),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsModelPayload) => {
      if (mode === 'create') {
        return apiClient.createSettingsModel(payload)
      }
      return apiClient.updateSettingsModel(selectedModelCode || '', payload)
    },
    onSuccess: () => {
      setMessage(mode === 'create' ? '模型已创建。' : '模型已更新。')
      setMessageType('success')
      setIsModalOpen(false)
      setSelectedModelCode(null)
      void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    },
    onError: (error) => {
      appLogger.error('Settings model save failed', { error: error instanceof Error ? error.message : 'unknown' })
      setMessage(error instanceof Error ? error.message : '保存失败')
      setMessageType('error')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ modelCode, isActive }: { modelCode: string; isActive: boolean }) =>
      apiClient.toggleSettingsModel(modelCode, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings-models'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (modelCode: string) => apiClient.deleteSettingsModel(modelCode),
    onSuccess: () => {
      setIsModalOpen(false)
      setSelectedModelCode(null)
      setMessage('模型已软删除。')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (modelCode: string) => apiClient.restoreSettingsModel(modelCode),
    onSuccess: () => {
      setMessage('模型已恢复。')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    },
  })

  useEffect(() => {
    if (!isModalOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsModalOpen(false)
        setSelectedModelCode(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isModalOpen])

  const models = modelsQuery.data?.models || []
  const providers = providersQuery.data?.providers || []
  const selectedModel = models.find((model) => model.model_code === selectedModelCode) || null
  const activeModels = models.filter((model) => model.is_active && !model.is_deleted)
  const deletedModels = models.filter((model) => model.is_deleted)
  const configuredKeys = models.filter((model) => model.api_key).length
  const providerDistribution = providers
    .map((provider) => ({
      code: provider.code,
      name: provider.name,
      count: models.filter((model) => model.provider === provider.code && !model.is_deleted).length,
    }))
    .filter((provider) => provider.count > 0)

  function openCreateModal() {
    setMode('create')
    setSelectedModelCode(null)
    setForm(EMPTY_FORM)
    setIsModalOpen(true)
  }

  async function openEditModal(modelCode: string) {
    const model = await apiClient.getSettingsModel(modelCode)
    setMode('edit')
    setSelectedModelCode(modelCode)
    setForm({
      model_code: model.model_code,
      display_name: model.display_name,
      provider: model.provider,
      api_model_name: model.api_model_name,
      version: model.version,
      tags: model.tags,
      base_url: model.base_url,
      api_key: model.api_key,
      app_code: model.app_code,
      temperature: model.temperature,
      is_active: model.is_active,
    })
    setIsModalOpen(true)
  }

  function updateField<Key extends keyof SettingsModelPayload>(field: Key, value: SettingsModelPayload[Key]) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveMutation.mutate({
      ...form,
      model_code: form.model_code?.trim(),
      display_name: form.display_name.trim(),
      api_model_name: form.api_model_name.trim(),
      version: form.version.trim(),
      base_url: form.base_url.trim(),
      api_key: form.api_key.trim(),
      app_code: form.app_code.trim(),
      tags: form.tags.filter(Boolean),
    })
  }

  if (modelsQuery.isLoading || providersQuery.isLoading) {
    return <div className="state-shell">正在加载模型设置...</div>
  }

  if (modelsQuery.error instanceof Error) {
    return <div className="state-shell state-shell--error">加载失败：{modelsQuery.error.message}</div>
  }

  return (
    <div className="page-stack">
      <section className="hero-panel hero-panel--settings">
        <div className="hero-panel__copy">
          <p className="hero-panel__eyebrow">Model Runtime Studio</p>
          <h2 className="hero-panel__title">统一管理模型目录、连接参数与运行状态</h2>
          <p className="hero-panel__description">
            这里的改动会直接写入数据库，并立即影响后端的模型读取与预测执行。当前工作台按运行概览、模型目录和编辑面板来组织。
          </p>
          <div className="hero-panel__meta">
            <span>模型总数 {models.length}</span>
            <span>启用中 {activeModels.length}</span>
            <span>已删除 {deletedModels.length}</span>
            <span>已配置密钥 {configuredKeys}</span>
          </div>
        </div>
        <div className="toolbar-inline">
          <label className="toggle-chip">
            <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
            <span>显示已删除</span>
          </label>
          <button className="primary-button" onClick={openCreateModal}>
            新增模型
          </button>
        </div>
      </section>

      {message ? <div className={clsx('banner-message', messageType === 'error' && 'is-error')}>{message}</div> : null}

      <section className="settings-overview-grid">
        <article className="settings-overview-card">
          <p className="settings-overview-card__label">运行中模型</p>
          <strong className="settings-overview-card__value">{activeModels.length}</strong>
          <span className="settings-overview-card__hint">参与当前预测执行的模型数量</span>
        </article>
        <article className="settings-overview-card">
          <p className="settings-overview-card__label">Provider 覆盖</p>
          <strong className="settings-overview-card__value">{providerDistribution.length}</strong>
          <span className="settings-overview-card__hint">已接入且至少包含一个可见模型的 Provider</span>
        </article>
        <article className="settings-overview-card">
          <p className="settings-overview-card__label">已配置密钥</p>
          <strong className="settings-overview-card__value">{configuredKeys}</strong>
          <span className="settings-overview-card__hint">已录入 API Key 的模型数量</span>
        </article>
        <article className="settings-overview-card">
          <p className="settings-overview-card__label">待处理项</p>
          <strong className="settings-overview-card__value">{models.length - activeModels.length - deletedModels.length}</strong>
          <span className="settings-overview-card__hint">已保留但未启用的模型数量</span>
        </article>
      </section>

      <section className="settings-console-grid">
        <StatusCard title="控制侧栏" subtitle="快速查看运行分布，并决定是否在目录中包含已删除模型。">
          <div className="settings-side-stack">
            <div className="settings-side-card">
              <p className="settings-side-card__title">运行摘要</p>
              <div className="settings-side-card__list">
                <span>总模型数</span>
                <strong>{models.length}</strong>
                <span>启用模型</span>
                <strong>{activeModels.length}</strong>
                <span>已删除</span>
                <strong>{deletedModels.length}</strong>
                <span>停用待命</span>
                <strong>{models.length - activeModels.length - deletedModels.length}</strong>
              </div>
            </div>
            <div className="settings-side-card">
              <p className="settings-side-card__title">Provider 分布</p>
              <div className="settings-provider-list">
                {providerDistribution.length ? (
                  providerDistribution.map((provider) => (
                    <div key={provider.code} className="settings-provider-item">
                      <span>{provider.name}</span>
                      <strong>{provider.count}</strong>
                    </div>
                  ))
                ) : (
                  <p className="settings-provider-empty">当前还没有可展示的 Provider 分布。</p>
                )}
              </div>
            </div>
          </div>
        </StatusCard>

        <StatusCard
          title="模型目录"
          subtitle={`当前共 ${models.length} 个模型，点击卡片进入编辑；目录会保留现有 CRUD、启停和恢复能力。`}
        >
          <div className="settings-grid-react">
            {models.map((model) => (
              <button key={model.model_code} className="settings-model-card-react" onClick={() => void openEditModal(model.model_code)}>
                <div className="settings-model-card-react__header">
                  <div>
                    <p className="settings-model-card-react__provider">{model.provider}</p>
                    <h3>{model.display_name}</h3>
                  </div>
                  <span className={clsx('status-pill', model.is_active && 'is-active', model.is_deleted && 'is-deleted')}>
                    {model.is_deleted ? '已删除' : model.is_active ? '已启用' : '已停用'}
                  </span>
                </div>
                <p className="settings-model-card-react__meta">{model.api_model_name}</p>
                <div className="settings-model-card-react__facts">
                  <span>版本 {model.version || '-'}</span>
                  <span>{model.base_url ? '已配置 Base URL' : '未配置 Base URL'}</span>
                  <span>{model.api_key ? '已录入密钥' : '未录入密钥'}</span>
                </div>
                <div className="tag-row">
                  {(model.tags || []).length ? model.tags.map((tag) => <span key={`${model.model_code}-${tag}`} className="tag">{tag}</span>) : <span className="tag tag--muted">无标签</span>}
                </div>
              </button>
            ))}
          </div>
        </StatusCard>
      </section>

      {isModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">{mode === 'create' ? '新建模型' : '编辑模型'}</p>
                <h3>{mode === 'create' ? '创建模型定义' : selectedModel?.display_name || selectedModelCode}</h3>
              </div>
              <button className="ghost-button" onClick={() => setIsModalOpen(false)}>
                关闭
              </button>
            </div>

            <form className="form-grid" onSubmit={submitForm}>
              <div className="form-section field--full">
                <div className="form-section__header">
                  <p className="form-section__eyebrow">Identity</p>
                  <h4 className="form-section__title">基础信息</h4>
                </div>
                <div className="form-section__grid">
                  <label className="field">
                    <span>模型编码</span>
                    <input
                      value={form.model_code || ''}
                      disabled={mode === 'edit'}
                      onChange={(event) => updateField('model_code', event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>显示名称</span>
                    <input value={form.display_name} onChange={(event) => updateField('display_name', event.target.value)} required />
                  </label>
                  <label className="field">
                    <span>Provider</span>
                    <select value={form.provider} onChange={(event) => updateField('provider', event.target.value)}>
                      {providers.map((provider) => (
                        <option key={provider.code} value={provider.code}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>API Model</span>
                    <input value={form.api_model_name} onChange={(event) => updateField('api_model_name', event.target.value)} required />
                  </label>
                  <label className="field">
                    <span>版本</span>
                    <input value={form.version} onChange={(event) => updateField('version', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>标签</span>
                    <input
                      value={form.tags.join(',')}
                      onChange={(event) =>
                        updateField(
                          'tags',
                          event.target.value
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="form-section field--full">
                <div className="form-section__header">
                  <p className="form-section__eyebrow">Connection</p>
                  <h4 className="form-section__title">连接信息</h4>
                </div>
                <div className="form-section__grid">
                  <label className="field field--full">
                    <span>Base URL</span>
                    <input value={form.base_url} onChange={(event) => updateField('base_url', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>API Key</span>
                    <input value={form.api_key} onChange={(event) => updateField('api_key', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>APP Code</span>
                    <input value={form.app_code} onChange={(event) => updateField('app_code', event.target.value)} />
                  </label>
                </div>
              </div>
              <div className="form-section field--full">
                <div className="form-section__header">
                  <p className="form-section__eyebrow">Runtime</p>
                  <h4 className="form-section__title">运行参数</h4>
                </div>
                <div className="form-section__grid">
                  <label className="field">
                    <span>Temperature</span>
                    <input
                      type="number"
                      step="0.1"
                      value={form.temperature ?? ''}
                      onChange={(event) => updateField('temperature', event.target.value ? Number(event.target.value) : null)}
                    />
                  </label>
                </div>
              </div>
              <label className="checkbox-field field--full">
                <input type="checkbox" checked={form.is_active} onChange={(event) => updateField('is_active', event.target.checked)} />
                <span>启用该模型参与预测</span>
              </label>
              <div className="form-actions field--full">
                <button className="primary-button" type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? '保存中...' : '保存模型'}
                </button>
                {mode === 'edit' && selectedModel ? (
                  <>
                    {!selectedModel.is_deleted ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => toggleMutation.mutate({ modelCode: selectedModel.model_code, isActive: !selectedModel.is_active })}
                      >
                        {selectedModel.is_active ? '停用模型' : '启用模型'}
                      </button>
                    ) : null}
                    {selectedModel.is_deleted ? (
                      <button className="ghost-button" type="button" onClick={() => restoreMutation.mutate(selectedModel.model_code)}>
                        恢复模型
                      </button>
                    ) : (
                      <button className="danger-button" type="button" onClick={() => deleteMutation.mutate(selectedModel.model_code)}>
                        删除模型
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
