const DEFAULT_MAX_EDGE_PX = 1600
const DEFAULT_JPEG_QUALITY = 0.82
const DEFAULT_MIN_REDUCTION_RATIO = 0.05

export type TicketImageOptimizeResult = {
  file: File
  compressed: boolean
  originalSize: number
  outputSize: number
}

export function resolveScaledDimensions(width: number, height: number, maxEdge: number = DEFAULT_MAX_EDGE_PX) {
  const safeWidth = Math.max(1, Math.round(width || 1))
  const safeHeight = Math.max(1, Math.round(height || 1))
  const longestEdge = Math.max(safeWidth, safeHeight)
  if (longestEdge <= maxEdge) {
    return { width: safeWidth, height: safeHeight }
  }
  const ratio = maxEdge / longestEdge
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  }
}

export function shouldKeepOriginalFile(originalSize: number, optimizedSize: number, minReductionRatio: number = DEFAULT_MIN_REDUCTION_RATIO) {
  if (originalSize <= 0 || optimizedSize <= 0) return true
  const minTargetSize = Math.floor(originalSize * (1 - minReductionRatio))
  return optimizedSize >= minTargetSize
}

export function buildOptimizedTicketImageName(filename: string) {
  const normalized = String(filename || '').trim() || 'ticket'
  const dotIndex = normalized.lastIndexOf('.')
  const stem = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized
  return `${stem}.jpg`
}

export async function optimizeTicketImageForUpload(file: File): Promise<TicketImageOptimizeResult> {
  const fallback = {
    file,
    compressed: false,
    originalSize: file.size,
    outputSize: file.size,
  }
  if (!(file instanceof File)) return fallback
  if (!String(file.type || '').toLowerCase().startsWith('image/')) return fallback

  let sourceImage: ImageBitmap | HTMLImageElement | null = null
  try {
    sourceImage = await loadImageSource(file)
    const scaled = resolveScaledDimensions(sourceImage.width, sourceImage.height)
    const canvas = document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    const context = canvas.getContext('2d')
    if (!context) return fallback
    context.drawImage(sourceImage, 0, 0, scaled.width, scaled.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', DEFAULT_JPEG_QUALITY)
    })
    if (!blob || shouldKeepOriginalFile(file.size, blob.size)) return fallback
    const optimizedFile = new File([blob], buildOptimizedTicketImageName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    })
    return {
      file: optimizedFile,
      compressed: true,
      originalSize: file.size,
      outputSize: optimizedFile.size,
    }
  } catch {
    return fallback
  } finally {
    if (sourceImage && 'close' in sourceImage && typeof sourceImage.close === 'function') {
      sourceImage.close()
    }
  }
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  const imageUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = imageUrl
    })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}
