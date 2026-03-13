import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'

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
})
