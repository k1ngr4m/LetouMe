export const IMGLOC_CONTENT_BLOCKED_MESSAGE = '图片被图床风控拦截，请更换清晰票面；可先保存投注不上传图片'

export function isImglocContentBlockedError(message: string | null | undefined): boolean {
  const normalized = String(message || '').toLowerCase()
  if (!normalized) return false
  return normalized.includes('图片被图床风控拦截') || normalized.includes('suspected inappropriate content')
}
