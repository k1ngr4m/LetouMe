import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { apiClient } from '../../shared/api/client'
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
          <h2 className="hero-panel__title">把模型目录、密钥和连接参数统一收敛到独立的设置工作台</h2>
          <p className="hero-panel__description">
            这里的改动会直接写入数据库，并立即影响后端的模型读取与预测执行。
          </p>
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

      <StatusCard title="模型列表" subtitle={`当前共 ${models.length} 个模型，启用 ${models.filter((item) => item.is_active && !item.is_deleted).length} 个。`}>
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
              <div className="tag-row">
                {(model.tags || []).length ? model.tags.map((tag) => <span key={`${model.model_code}-${tag}`} className="tag">{tag}</span>) : <span className="tag tag--muted">无标签</span>}
              </div>
            </button>
          ))}
        </div>
      </StatusCard>

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
                <span>Temperature</span>
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature ?? ''}
                  onChange={(event) => updateField('temperature', event.target.value ? Number(event.target.value) : null)}
                />
              </label>
              <label className="field field--full">
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
