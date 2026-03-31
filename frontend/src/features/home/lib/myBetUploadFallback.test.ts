import { describe, expect, it } from 'vitest'

import { IMGLOC_CONTENT_BLOCKED_MESSAGE, isImglocContentBlockedError } from './myBetUploadFallback'

describe('isImglocContentBlockedError', () => {
  it('matches backend blocked-content message', () => {
    expect(isImglocContentBlockedError(IMGLOC_CONTENT_BLOCKED_MESSAGE)).toBe(true)
  })

  it('matches provider english blocked-content detail', () => {
    expect(isImglocContentBlockedError('Suspected inappropriate content')).toBe(true)
  })

  it('returns false for generic upload failures', () => {
    expect(isImglocContentBlockedError('上传图床失败（HTTP 500）')).toBe(false)
  })
})
