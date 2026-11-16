import { randomUUID } from 'node:crypto'
import { apiError, apiSuccess } from '@/lib/api-response'
import { requireApiUser } from '@/lib/api-auth'
import { EmojiUploadValidationError, validateEmojiFile } from '@/lib/emoji-validation'
import { consumeRateLimit } from '@/lib/rate-limit'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const bucketName = 'emoji-submissions'
const maxRequestSize = 2 * 1024 * 1024 + 128 * 1024

class RequestTooLargeError extends Error {}

async function readSubmissionForm(request: Request) {
  const contentType = request.headers.get('content-type')
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;') || !request.body) {
    throw new Error('Expected multipart form data.')
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalSize += value.byteLength
      if (totalSize > maxRequestSize) throw new RequestTooLargeError()
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel()
    throw error
  } finally {
    reader.releaseLock()
  }

  const body = Buffer.concat(chunks, totalSize)
  return new Response(body, { headers: { 'content-type': contentType } }).formData()
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length > 12 || !parsed.every((tag) => typeof tag === 'string')) {
      return null
    }

    const normalized = parsed.map((tag: string) => tag.trim().toLowerCase())
    if (normalized.some((tag: string) => tag.length === 0 || tag.length > 32)) return null

    return [...new Set(normalized)]
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, true)
  if (!auth.user) return auth.response
  const { user } = auth

  const rateLimit = consumeRateLimit(request, 'emoji-submission', 5, 60 * 60 * 1000)
  if (!rateLimit.allowed) {
    return apiError('RATE_LIMITED', 'Too many submissions. Try again later.', 429)
  }

  let formData: FormData
  try {
    formData = await readSubmissionForm(request)
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return apiError('REQUEST_TOO_LARGE', 'The upload request is too large.', 413)
    }
    return apiError('INVALID_REQUEST', 'Send the submission as multipart form data.', 400)
  }

  const nameEntry = formData.get('name')
  const descriptionEntry = formData.get('description')
  const categoryEntry = formData.get('category')
  const fileEntry = formData.get('file')
  const tags = parseTags(formData.get('tags'))

  if (
    typeof nameEntry !== 'string' ||
    typeof descriptionEntry !== 'string' ||
    typeof categoryEntry !== 'string' ||
    !(fileEntry instanceof File)
  ) {
    return apiError('INVALID_REQUEST', 'Name, category, tags, and an image file are required.', 400)
  }

  const name = nameEntry.trim()
  const description = descriptionEntry.trim()
  const category = categoryEntry.trim()

  if (name.length < 2 || name.length > 32) {
    return apiError('INVALID_NAME', 'Name must be between 2 and 32 characters.', 400)
  }
  if (description.length > 300) {
    return apiError('INVALID_DESCRIPTION', 'Description must be 300 characters or fewer.', 400)
  }
  if (category.length < 1 || category.length > 40 || !tags) {
    return apiError('INVALID_METADATA', 'Category or tags are invalid.', 400)
  }

  let validatedFile: Awaited<ReturnType<typeof validateEmojiFile>>
  try {
    validatedFile = await validateEmojiFile(fileEntry)
  } catch (error) {
    if (error instanceof EmojiUploadValidationError) {
      return apiError('INVALID_FILE', error.message, 400)
    }
    return apiError('INVALID_FILE', 'The uploaded file could not be validated.', 400)
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Submission service is not configured.', 503)
  }

  const { data: duplicate, error: duplicateCheckError } = await supabase
    .from('emoji_submissions')
    .select('id')
    .eq('content_sha256', validatedFile.sha256)
    .maybeSingle()

  if (duplicateCheckError) {
    return apiError('DATABASE_FAILED', 'The submission could not be checked. Please try again.', 503)
  }

  if (duplicate) {
    return apiError('DUPLICATE_FILE', 'This image has already been submitted.', 409)
  }

  const storagePath = `${randomUUID()}.${validatedFile.extension}`
  const { error: storageError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, validatedFile.bytes, {
      contentType: validatedFile.mimeType,
      cacheControl: '3600',
      upsert: false,
    })

  if (storageError) {
    return apiError('STORAGE_FAILED', 'The image could not be stored. Please try again.', 503)
  }

  const { data: submission, error: insertError } = await supabase
    .from('emoji_submissions')
    .insert({
      name,
      description,
      category,
      tags,
      creator_id: user.id,
      status: 'pending',
      storage_path: storagePath,
      mime_type: validatedFile.mimeType,
      file_size: validatedFile.bytes.byteLength,
      content_sha256: validatedFile.sha256,
    })
    .select('id, name, status, created_at')
    .single()

  if (insertError || !submission) {
    await supabase.storage.from(bucketName).remove([storagePath])
    if (insertError?.code === '23505') {
      return apiError('DUPLICATE_FILE', 'This image has already been submitted.', 409)
    }
    return apiError('DATABASE_FAILED', 'The submission could not be saved. Please try again.', 503)
  }

  return apiSuccess(
    {
      id: submission.id,
      name: submission.name,
      status: submission.status,
      createdAt: submission.created_at,
    },
    201,
  )
}