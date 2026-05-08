import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Copy, History, LoaderCircle, Plus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { apiClient } from '../api/client'
import type {
  AssistantChatResponse,
  AssistantContext,
  AssistantConversation,
  AssistantMessage,
  AssistantModel,
} from '../types/api'

type AssistantStatus = 'connected' | 'thinking' | 'unavailable'

type AssistantDrawerProps = {
  isOpen: boolean
  context: AssistantContext
  onClose: () => void
}

const QUICK_PROMPTS = ['解释当前预测', '分析我的投注', '给我保守方案', '本期风险点']
const WELCOME_MESSAGE: AssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我可以结合当前页面帮你解释预测、图表和投注记录。你可以直接问，也可以点下面的快捷问题。',
  model_code: '',
  status: 'success',
  created_at: 0,
}

function makeMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatTime(timestamp: number) {
  if (!timestamp) return ''
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp * 1000))
  } catch {
    return ''
  }
}

function MarkdownLite({ content }: { content: string }) {
  const blocks = useMemo(() => content.trim().split(/\n{2,}/).filter(Boolean), [content])
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        const isTable = lines.length >= 2 && lines.every((line) => line.startsWith('|') && line.endsWith('|'))
        if (isTable) {
          const rows = lines
            .filter((line) => !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
            .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
          const [head, ...body] = rows
          return (
            <div className="assistant-markdown__table-wrap" key={`${block}-${index}`}>
              <table className="assistant-markdown__table">
                {head ? (
                  <thead>
                    <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
                  </thead>
                ) : null}
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={`${row.join('-')}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul className="assistant-markdown__list" key={`${block}-${index}`}>
              {lines.map((line) => <li key={line}>{line.replace(/^[-*]\s+/, '')}</li>)}
            </ul>
          )
        }
        return (
          <p className="assistant-markdown__paragraph" key={`${block}-${index}`}>
            {lines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {line.replace(/^#{1,4}\s+/, '')}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

export function AssistantDrawer({ isOpen, context, onClose }: AssistantDrawerProps) {
  const [models, setModels] = useState<AssistantModel[]>([])
  const [selectedModelCode, setSelectedModelCode] = useState('')
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [draft, setDraft] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [status, setStatus] = useState<AssistantStatus>('connected')
  const [errorMessage, setErrorMessage] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const selectedModel = useMemo(
    () => models.find((model) => model.model_code === selectedModelCode) || null,
    [models, selectedModelCode],
  )
  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE]
  const isComposerDisabled = status === 'thinking' || !selectedModelCode || models.length <= 0

  const contextChips = useMemo(() => {
    const chips = [context.page_title, context.target_period, ...context.chips]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    return Array.from(new Set(chips)).slice(0, 5)
  }, [context])

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    void refreshModels()
    void refreshConversations()
  }, [isOpen, context.lottery_code])

  useEffect(() => {
    if (models.length <= 0) {
      setSelectedModelCode('')
      return
    }
    if (!selectedModelCode || !models.some((model) => model.model_code === selectedModelCode)) {
      setSelectedModelCode(models[0].model_code)
      startNewConversation({ keepModel: models[0].model_code })
    }
  }, [models, selectedModelCode])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const messageList = messageListRef.current
    if (!messageList) return
    if (typeof messageList.scrollTo === 'function') {
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' })
      return
    }
    messageList.scrollTop = messageList.scrollHeight
  }, [messages, status, isOpen])

  async function refreshModels() {
    try {
      const response = await apiClient.getAssistantModels({ lottery_code: context.lottery_code })
      setModels(response.models)
      setStatus('connected')
    } catch (error) {
      setModels([])
      setStatus('unavailable')
      setErrorMessage(error instanceof Error ? error.message : '模型列表加载失败')
    }
  }

  async function refreshConversations() {
    try {
      const response = await apiClient.getAssistantConversations({ lottery_code: context.lottery_code, limit: 30, offset: 0 })
      setConversations(response.conversations)
    } catch {
      setConversations([])
    }
  }

  function startNewConversation(options?: { keepModel?: string }) {
    setConversationId(null)
    setMessages([])
    setDraft('')
    setErrorMessage('')
    setStatus('connected')
    if (options?.keepModel) {
      setSelectedModelCode(options.keepModel)
    }
  }

  function handleModelChange(nextModelCode: string) {
    setSelectedModelCode(nextModelCode)
    startNewConversation({ keepModel: nextModelCode })
  }

  async function loadConversation(nextConversationId: string) {
    setStatus('thinking')
    setErrorMessage('')
    try {
      const response = await apiClient.getAssistantConversationDetail(nextConversationId)
      setConversationId(response.conversation.conversation_id)
      setSelectedModelCode(response.conversation.model_code)
      setMessages(response.messages)
      setIsHistoryOpen(false)
      setStatus('connected')
    } catch (error) {
      setStatus('unavailable')
      setErrorMessage(error instanceof Error ? error.message : '历史对话加载失败')
    }
  }

  async function deleteConversation(nextConversationId: string) {
    await apiClient.deleteAssistantConversation(nextConversationId)
    if (conversationId === nextConversationId) {
      startNewConversation()
    }
    await refreshConversations()
  }

  function getModelLabel(modelCode: string) {
    return models.find((model) => model.model_code === modelCode)?.display_name || modelCode
  }

  async function submitMessage(nextMessage?: string) {
    const content = String(nextMessage ?? draft).trim()
    if (!content || isComposerDisabled) return
    const userMessage: AssistantMessage = {
      id: makeMessageId(),
      role: 'user',
      content,
      model_code: selectedModelCode,
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setErrorMessage('')
    setStatus('thinking')
    try {
      const response: AssistantChatResponse = await apiClient.chatWithAssistant({
        message: content,
        model_code: selectedModelCode,
        context,
        conversation_id: conversationId,
      })
      setConversationId(response.conversation_id)
      setMessages(response.messages)
      setStatus('connected')
      await refreshConversations()
    } catch (error) {
      setStatus('unavailable')
      setDraft(content)
      setErrorMessage(error instanceof Error ? error.message : '本次回答失败，可重试')
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitMessage()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submitMessage()
    }
  }

  async function copyMessage(content: string) {
    await navigator.clipboard?.writeText(content)
  }

  return (
    <>
      <div className={clsx('assistant-drawer-overlay', isOpen && 'is-open')} onClick={onClose} aria-hidden="true" />
      <aside className={clsx('assistant-drawer', isOpen && 'is-open')} aria-label="AI 助手" aria-hidden={!isOpen}>
        <header className="assistant-drawer__header">
          <div className="assistant-drawer__title-group">
            <span className="assistant-drawer__mark"><Sparkles size={17} aria-hidden="true" /></span>
            <div>
              <h2>AI 助手</h2>
              <p className={clsx('assistant-drawer__status', `is-${status}`)}>
                {status === 'thinking' ? '思考中' : status === 'unavailable' ? '不可用' : '已连接'}
              </p>
            </div>
          </div>
          <div className="assistant-drawer__header-actions">
            <button className="assistant-drawer__icon-action" type="button" onClick={() => startNewConversation()} aria-label="新建对话" title="新建对话">
              <Plus size={17} aria-hidden="true" />
            </button>
            <button
              className={clsx('assistant-drawer__icon-action', isHistoryOpen && 'is-active')}
              type="button"
              onClick={() => setIsHistoryOpen((current) => !current)}
              aria-label="历史对话"
              title="历史对话"
            >
              <History size={17} aria-hidden="true" />
            </button>
            <button className="assistant-drawer__close" type="button" onClick={onClose} aria-label="关闭 AI 助手" title="关闭 AI 助手">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="assistant-drawer__controls">
          <label className="assistant-model-picker">
            <span>模型</span>
            <select value={selectedModelCode} onChange={(event) => handleModelChange(event.target.value)} disabled={status === 'thinking' || models.length <= 0}>
              {models.length > 0 ? models.map((model) => (
                <option key={model.model_code} value={model.model_code}>
                  {model.display_name || model.model_code}
                </option>
              )) : <option value="">暂无可用模型</option>}
            </select>
          </label>
          {selectedModel ? <span className="assistant-model-meta">{selectedModel.provider} · {selectedModel.api_model_name}</span> : null}
        </div>

        <div className="assistant-drawer__context" aria-label="当前上下文">
          {contextChips.length > 0 ? contextChips.map((chip) => <span key={chip}>{chip}</span>) : <span>当前页面暂无可引用数据</span>}
        </div>

        {isHistoryOpen ? (
          <section className="assistant-history" aria-label="历史对话">
            {conversations.length > 0 ? conversations.map((conversation) => (
              <article className={clsx('assistant-history__item', conversation.conversation_id === conversationId && 'is-active')} key={conversation.conversation_id}>
                <button type="button" onClick={() => void loadConversation(conversation.conversation_id)}>
                  <strong>{conversation.title || '新的对话'}</strong>
                  <span>{getModelLabel(conversation.model_code)} · {conversation.context_summary || conversation.lottery_code}</span>
                  <small>{formatTime(conversation.last_active_at)}</small>
                </button>
                <button type="button" onClick={() => void deleteConversation(conversation.conversation_id)} aria-label="删除历史对话" title="删除">
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </article>
            )) : <p className="assistant-history__empty">暂无历史对话</p>}
          </section>
        ) : null}

        <div className="assistant-drawer__messages" ref={messageListRef}>
          {displayMessages.map((message) => (
            <article className={clsx('assistant-message', `assistant-message--${message.role}`, message.status === 'error' && 'is-error')} key={message.id}>
              <div className="assistant-message__bubble">
                <MarkdownLite content={message.content} />
              </div>
              {message.role === 'assistant' && message.id !== 'welcome' ? (
                <button className="assistant-message__copy" type="button" onClick={() => void copyMessage(message.content)} aria-label="复制 AI 回复" title="复制">
                  <Copy size={13} aria-hidden="true" />
                </button>
              ) : null}
            </article>
          ))}
          {status === 'thinking' ? (
            <article className="assistant-message assistant-message--assistant">
              <div className="assistant-message__bubble assistant-message__bubble--thinking">
                <LoaderCircle size={15} aria-hidden="true" />
                <span>正在结合当前页面和历史对话思考...</span>
              </div>
            </article>
          ) : null}
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <div className="assistant-composer__quick">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => void submitMessage(prompt)} disabled={isComposerDisabled}>
                {prompt}
              </button>
            ))}
          </div>
          {errorMessage ? <p className="assistant-composer__error">{errorMessage}</p> : null}
          {!selectedModelCode && models.length <= 0 ? <p className="assistant-composer__error">暂无可用 AI 模型，请先在设置中心启用支持当前彩种的模型。</p> : null}
          <div className="assistant-composer__input-row">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="问我任何关于当前页面的问题"
              rows={3}
              disabled={isComposerDisabled && status !== 'unavailable'}
            />
            <button type="submit" disabled={!draft.trim() || isComposerDisabled} aria-label="发送问题" title="发送">
              {status === 'thinking' ? <LoaderCircle className="is-spinning" size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
            </button>
          </div>
          <p className="assistant-composer__disclaimer">内容由 AI 生成，仅供参考，请仔细甄别。</p>
        </form>
      </aside>
    </>
  )
}
