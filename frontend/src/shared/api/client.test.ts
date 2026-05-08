import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, parseSseChunk } from './client'

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../lib/logger', () => ({
  appLogger: logger,
  sanitizeForLog: (value: unknown) => value,
}))

describe('apiClient logging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    logger.debug.mockReset()
    logger.info.mockReset()
    logger.warn.mockReset()
    logger.error.mockReset()
  })

  it('logs successful requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ prediction_date: '', target_period: '', models: [] }),
      }),
    )

    await apiClient.getCurrentPredictions()

    expect(logger.debug).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      'API request completed',
      expect.objectContaining({ method: 'POST', path: '/api/predictions/current', status: 200 }),
    )
  })

  it('logs failed requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'boom' }),
      }),
    )

    await expect(apiClient.getCurrentPredictions()).rejects.toThrow('boom')
    expect(logger.error).toHaveBeenCalledWith(
      'API request failed',
      expect.objectContaining({ method: 'POST', path: '/api/predictions/current', status: 500, detail: 'boom' }),
    )
  })

  it('parses assistant stream events', () => {
    expect(parseSseChunk('event: meta\ndata: {"conversation_id":"c1"}\n\nevent: delta\ndata: {"content":"你"}\n\n')).toEqual([
      { event: 'meta', data: { conversation_id: 'c1' } },
      { event: 'delta', data: { content: '你' } },
    ])
  })

  it('streams assistant chat events', async () => {
    const encoded = new TextEncoder().encode(
      'event: meta\ndata: {"conversation_id":"c1","context_summary":"","model_code":"m1"}\n\n'
      + 'event: delta\ndata: {"content":"你"}\n\n'
      + 'event: delta\ndata: {"content":"好"}\n\n'
      + 'event: done\ndata: {"conversation_id":"c1","answer":"你好","context_summary":"","model_code":"m1","messages":[]}\n\n',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoded)
            controller.close()
          },
        }),
      }),
    )
    const events: string[] = []
    await apiClient.streamAssistantChat(
      { message: 'hi', model_code: 'm1', context: { lottery_code: 'dlt', page_title: 'AI 助手', route_path: '', chips: [] } },
      {
        onMeta: (payload) => events.push(`meta:${payload.conversation_id}`),
        onDelta: (content) => events.push(`delta:${content}`),
        onDone: (payload) => events.push(`done:${payload.answer}`),
      },
    )

    expect(events).toEqual(['meta:c1', 'delta:你', 'delta:好', 'done:你好'])
  })

  it('throws assistant stream errors', async () => {
    const encoded = new TextEncoder().encode('event: error\ndata: {"message":"boom"}\n\n')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoded)
            controller.close()
          },
        }),
      }),
    )

    await expect(apiClient.streamAssistantChat(
      { message: 'hi', model_code: 'm1', context: { lottery_code: 'dlt', page_title: 'AI 助手', route_path: '', chips: [] } },
    )).rejects.toThrow('boom')
  })
})
