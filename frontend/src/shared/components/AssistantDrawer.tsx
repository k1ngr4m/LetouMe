import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Copy, History, LoaderCircle, Plus, Send, Sparkles, Trash2, X } from 'lucide-react'
import { apiClient } from '../api/client'
import type {
  AssistantContext,
  AssistantConversation,
  AssistantMessage,
  AssistantModel,
  MyBetLine,
  MyBetRecord,
} from '../types/api'

type AssistantStatus = 'connected' | 'thinking' | 'unavailable'

type AssistantDrawerProps = {
  isOpen: boolean
  context: AssistantContext
  onClose: () => void
}

type QuickPrompt = {
  key: 'random-pick' | 'analyze-my-bets' | 'risk-points'
  label: string
  message: string
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    key: 'random-pick',
    label: '随机来一注',
    message: '请按当前彩种随机生成一注号码，只输出号码、简短说明和“随机娱乐、理性投入”的提醒，不要保存或创建投注记录。',
  },
  {
    key: 'analyze-my-bets',
    label: '分析我的投注',
    message: '请基于我本期该彩种的投注数据，分析号码分布、投入金额、风险点和需要注意的地方。如果没有投注数据，请明确说明本期暂无我的投注数据。',
  },
  {
    key: 'risk-points',
    label: '本期风险点',
    message: '请结合当前彩种给出本期需要注意的风险点，使用 Markdown 分点说明，并提醒彩票结果具有随机性。',
  },
]
const WELCOME_MESSAGE: AssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好，我可以帮你解释预测、图表和投注记录。你可以直接问，也可以点下面的快捷问题。',
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

function pickNumbersPayload(line: MyBetLine | MyBetRecord) {
  return {
    front_numbers: line.front_numbers || [],
    back_numbers: line.back_numbers || [],
    front_dan: line.front_dan || [],
    front_tuo: line.front_tuo || [],
    back_dan: line.back_dan || [],
    back_tuo: line.back_tuo || [],
    direct_ten_thousands: line.direct_ten_thousands || [],
    direct_thousands: line.direct_thousands || [],
    direct_hundreds: line.direct_hundreds || [],
    direct_tens: line.direct_tens || [],
    direct_units: line.direct_units || [],
    direct_hundreds_dan: line.direct_hundreds_dan || [],
    direct_hundreds_tuo: line.direct_hundreds_tuo || [],
    direct_tens_dan: line.direct_tens_dan || [],
    direct_tens_tuo: line.direct_tens_tuo || [],
    direct_units_dan: line.direct_units_dan || [],
    direct_units_tuo: line.direct_units_tuo || [],
    group_numbers: line.group_numbers || [],
    sum_values: line.sum_values || [],
    position_selections: line.position_selections || [],
  }
}

function buildMyBetsAssistantContext(lotteryCode: AssistantContext['lottery_code'], targetPeriod: string, records: MyBetRecord[]): AssistantContext['my_bets'] {
  const totalBetCount = records.reduce((sum, record) => sum + Number(record.bet_count || 0), 0)
  const totalGrossAmount = records.reduce((sum, record) => sum + Number(record.amount || 0), 0)
  const totalNetAmount = records.reduce((sum, record) => sum + Number(record.net_amount || record.amount || 0), 0)
  const lines = records.flatMap((record) => record.lines || [])
  const appendLines = lines.filter((line) => Boolean(line.is_append))
  const appendLineCount = appendLines.length
  const appendBetCount = appendLines.reduce((sum, line) => sum + Number(line.bet_count || 0), 0)
  const appendAmount = appendLines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
  return {
    lottery_code: lotteryCode,
    target_period: targetPeriod,
    record_count: records.length,
    total_bet_count: totalBetCount,
    total_amount: totalNetAmount,
    total_gross_amount: totalGrossAmount,
    total_net_amount: totalNetAmount,
    has_append: appendLineCount > 0,
    append_line_count: appendLineCount,
    append_bet_count: appendBetCount,
    append_amount: appendAmount,
    records: records.slice(0, 20).map((record) => ({
      id: record.id,
      play_type: record.play_type,
      multiplier: record.multiplier,
      is_append: record.is_append,
      source_type: record.source_type,
      bet_count: record.bet_count,
      amount: record.amount,
      discount_amount: record.discount_amount,
      net_amount: record.net_amount,
      numbers: pickNumbersPayload(record),
      lines: (record.lines || []).slice(0, 20).map((line) => ({
        line_no: line.line_no,
        play_type: line.play_type,
        multiplier: line.multiplier,
        is_append: line.is_append,
        bet_count: line.bet_count,
        amount: line.amount,
        numbers: pickNumbersPayload(line),
      })),
    })),
  }
}

function isEnabledAssistantModel(model: AssistantModel, lotteryCode: AssistantContext['lottery_code']) {
  const supportsLottery = !model.lottery_codes?.length || model.lottery_codes.includes(lotteryCode)
  return model.is_active !== false && model.is_deleted !== true && supportsLottery
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; head: string[]; body: string[][] }

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line)
}

function splitTableRow(line: string) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isBlockStart(line: string, nextLine = '') {
  return (
    /^```/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line) ||
    (line.includes('|') && isTableDivider(nextLine))
  )
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] || ''
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const fenceMatch = trimmed.match(/^```([\w-]+)?\s*$/)
    if (fenceMatch) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test((lines[index] || '').trim())) {
        codeLines.push(lines[index] || '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fenceMatch[1] || '', code: codeLines.join('\n') })
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length as 1 | 2 | 3 | 4, text: headingMatch[2].trim() })
      index += 1
      continue
    }

    if (trimmed.includes('|') && isTableDivider(lines[index + 1] || '')) {
      const head = splitTableRow(trimmed)
      const body: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] || '').trim().includes('|')) {
        body.push(splitTableRow((lines[index] || '').trim()))
        index += 1
      }
      blocks.push({ type: 'table', head, body })
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test((lines[index] || '').trim())) {
        quoteLines.push((lines[index] || '').trim().replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') })
      continue
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed)
      const markerPattern = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/
      const items: string[] = []
      while (index < lines.length && markerPattern.test((lines[index] || '').trim())) {
        items.push((lines[index] || '').trim().replace(markerPattern, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const paragraphLine = lines[index] || ''
      if (!paragraphLine.trim()) break
      if (paragraphLines.length > 0 && isBlockStart(paragraphLine.trim(), lines[index + 1] || '')) break
      paragraphLines.push(paragraphLine.trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') })
  }

  return blocks
}

function normalizeMarkdownHref(href: string) {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  return ''
}

function parseInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${keyPrefix}-${match.index}`
    if (token.startsWith('`')) {
      nodes.push(<code className="assistant-markdown__inline-code" key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      const href = linkMatch ? normalizeMarkdownHref(linkMatch[2]) : ''
      nodes.push(
        href ? (
          <a className="assistant-markdown__link" href={href} target="_blank" rel="noreferrer" key={key}>
            {linkMatch?.[1]}
          </a>
        ) : token,
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{parseInlineMarkdown(token.slice(2, -2), key)}</strong>)
    } else {
      nodes.push(<em key={key}>{parseInlineMarkdown(token.slice(1, -1), key)}</em>)
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function renderInlineWithBreaks(text: string, keyPrefix: string) {
  return text.split('\n').flatMap((line, lineIndex) => {
    const lineNodes = parseInlineMarkdown(line, `${keyPrefix}-${lineIndex}`)
    return lineIndex === 0 ? lineNodes : [<br key={`${keyPrefix}-br-${lineIndex}`} />, ...lineNodes]
  })
}

function MarkdownLite({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content])
  return (
    <div className="assistant-markdown">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4'
          return <HeadingTag className="assistant-markdown__heading" key={`${block.type}-${index}`}>{renderInlineWithBreaks(block.text, `heading-${index}`)}</HeadingTag>
        }
        if (block.type === 'code') {
          return (
            <pre className="assistant-markdown__code-block" key={`${block.type}-${index}`}>
              {block.language ? <span className="assistant-markdown__code-language">{block.language}</span> : null}
              <code>{block.code}</code>
            </pre>
          )
        }
        if (block.type === 'table') {
          return (
            <div className="assistant-markdown__table-wrap" key={`${block.type}-${index}`}>
              <table className="assistant-markdown__table">
                <thead>
                  <tr>{block.head.map((cell, cellIndex) => <th key={`${cell}-${cellIndex}`}>{renderInlineWithBreaks(cell, `th-${index}-${cellIndex}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.body.map((row, rowIndex) => (
                    <tr key={`${row.join('-')}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{renderInlineWithBreaks(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return <ListTag className="assistant-markdown__list" key={`${block.type}-${index}`}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInlineWithBreaks(item, `li-${index}-${itemIndex}`)}</li>)}</ListTag>
        }
        if (block.type === 'blockquote') {
          return <blockquote className="assistant-markdown__blockquote" key={`${block.type}-${index}`}>{renderInlineWithBreaks(block.text, `quote-${index}`)}</blockquote>
        }
        return (
          <p className="assistant-markdown__paragraph" key={`${block.type}-${index}`}>
            {renderInlineWithBreaks(block.text, `paragraph-${index}`)}
          </p>
        )
      })}
    </div>
  )
}

export function AssistantDrawer({ isOpen, context, onClose }: AssistantDrawerProps) {
  const [models, setModels] = useState<AssistantModel[]>([])
  const [selectedModelCode, setSelectedModelCode] = useState('')
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [draft, setDraft] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [status, setStatus] = useState<AssistantStatus>('connected')
  const [errorMessage, setErrorMessage] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const selectedModel = useMemo(
    () => models.find((model) => model.model_code === selectedModelCode) || null,
    [models, selectedModelCode],
  )
  const displayMessages = (messages.length > 0 ? messages : [WELCOME_MESSAGE]).filter((message) => (
    message.role !== 'assistant' || message.content.trim() || status !== 'thinking'
  ))
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
      setModels((response.models || []).filter((model) => isEnabledAssistantModel(model, context.lottery_code)))
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

  async function submitMessage(nextMessage?: string, contextOverride?: AssistantContext) {
    const content = String(nextMessage ?? draft).trim()
    if (!content || isComposerDisabled) return
    const requestContext = contextOverride || context
    const userMessage: AssistantMessage = {
      id: makeMessageId(),
      role: 'user',
      content,
      model_code: selectedModelCode,
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    }
    const assistantMessageId = makeMessageId()
    const assistantMessage: AssistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      model_code: selectedModelCode,
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    }
    setMessages((current) => [...current, userMessage, assistantMessage])
    setDraft('')
    setErrorMessage('')
    setStatus('thinking')
    try {
      await apiClient.streamAssistantChat(
        {
          message: content,
          model_code: selectedModelCode,
          context: requestContext,
          conversation_id: conversationId,
        },
        {
          onMeta: (payload) => {
            setConversationId(payload.conversation_id)
          },
          onDelta: (delta) => {
            setMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${delta}` }
                : message
            )))
          },
          onDone: (payload) => {
            setConversationId(payload.conversation_id)
            setMessages(payload.messages)
          },
          onError: (message) => {
            setErrorMessage(message)
          },
        },
      )
      setStatus('connected')
      await refreshConversations()
    } catch (error) {
      setStatus('unavailable')
      setDraft(content)
      setErrorMessage(error instanceof Error ? error.message : '本次回答失败，可重试')
    }
  }

  async function submitQuickPrompt(prompt: QuickPrompt) {
    if (prompt.key !== 'analyze-my-bets') {
      await submitMessage(prompt.message)
      return
    }

    const currentPrediction = await apiClient.getCurrentPredictions(context.lottery_code)
    const targetPeriod = String(currentPrediction.target_period || '').trim()
    const myBets = await apiClient.getMyBets(context.lottery_code)
    const records = (myBets.records || []).filter((record) => String(record.target_period || '').trim() === targetPeriod)
    await submitMessage(prompt.message, {
      ...context,
      target_period: targetPeriod,
      chips: Array.from(new Set([...context.chips, targetPeriod ? `第 ${targetPeriod} 期` : '当前期', '我的投注'])),
      my_bets: buildMyBetsAssistantContext(context.lottery_code, targetPeriod, records),
    })
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
        <div className="assistant-history-rail">
          <button className="assistant-history-rail__trigger" type="button" aria-label="历史对话" title="历史对话">
            <History size={18} aria-hidden="true" />
          </button>
          <section className="assistant-history" aria-label="历史对话">
            <div className="assistant-history__header">
              <strong>历史记录</strong>
              <span>最近 30 条</span>
            </div>
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
        </div>
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
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <div className="assistant-composer__quick">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt.key} type="button" onClick={() => void submitQuickPrompt(prompt)} disabled={isComposerDisabled}>
                {prompt.label}
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
