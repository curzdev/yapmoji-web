import 'server-only'

import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

export const MAX_EMOJI_FILE_SIZE = 2 * 1024 * 1024

const allowedTypes = {
  'image/gif': 'gif',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export class EmojiUploadValidationError extends Error {}

export async function validateEmojiFile(file: File) {
  if (file.size === 0) {
    throw new EmojiUploadValidationError('The uploaded file is empty.')
  }

  if (file.size > MAX_EMOJI_FILE_SIZE) {
    throw new EmojiUploadValidationError('The uploaded file must be 2 MB or smaller.')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const detectedType = await fileTypeFromBuffer(bytes)

  if (!detectedType || !Object.hasOwn(allowedTypes, detectedType.mime)) {
    throw new EmojiUploadValidationError('Upload a valid PNG, GIF, or WebP image.')
  }

  const mimeType = detectedType.mime as keyof typeof allowedTypes
  const image = sharp(bytes, { failOn: 'error', limitInputPixels: 16_000_000 })

  try {
    const metadata = await image.metadata()
    if (
      metadata.format !== allowedTypes[mimeType] ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096
    ) {
      throw new EmojiUploadValidationError('The image dimensions or content are not supported.')
    }

    await image.stats()
  } catch (error) {
    if (error instanceof EmojiUploadValidationError) throw error
    throw new EmojiUploadValidationError('The uploaded file is not a valid image.')
  }

  return {
    bytes,
    mimeType,
    extension: allowedTypes[mimeType],
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}