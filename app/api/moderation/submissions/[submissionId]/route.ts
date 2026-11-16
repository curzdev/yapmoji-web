import { apiError, apiSuccess } from '@/lib/api-response'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import { isModerationAction, normalizeRejectionReason } from '@/lib/moderation-policy'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mapDecisionError(error: { code?: string; message?: string }) {
  if (error.code === '42501') return apiError('FORBIDDEN', 'Moderator access is required.', 403)
  if (error.code === 'P0002') return apiError('SUBMISSION_NOT_FOUND', 'This submission could not be found.', 404)
  if (error.code === 'P0001' && error.message === 'submission_not_pending') {
    return apiError('SUBMISSION_ALREADY_REVIEWED', 'This submission has already been reviewed.', 409)
  }
  if (error.code === '22023') {
    return apiError('INVALID_DECISION', 'The moderation action or rejection reason is invalid.', 400)
  }
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const authorization = await requireModerationApiAccess(request, 'moderator', true)
  if (!authorization.identity) return authorization.response

  const { submissionId } = await params
  if (!uuidPattern.test(submissionId)) {
    return apiError('SUBMISSION_NOT_FOUND', 'This submission could not be found.', 404)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_REQUEST', 'Send the moderation action as JSON.', 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body) || !('action' in body) || !isModerationAction(body.action)) {
    return apiError('INVALID_ACTION', 'Choose approve or reject.', 400)
  }

  const action = body.action
  let reason: string | null = null
  if (action === 'reject') {
    reason = normalizeRejectionReason('reason' in body ? body.reason : undefined)
    if (reason === null) {
      return apiError('INVALID_REJECTION_REASON', 'The rejection reason must be between 1 and 500 characters.', 400)
    }
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'The moderation service is not configured.', 503)
  }

  const { data, error } = await supabase.rpc('review_emoji_submission', {
    p_actor_user_id: authorization.identity.user.id,
    p_submission_id: submissionId,
    p_action: action,
    p_reason: reason,
  })

  if (error) {
    const mappedError = mapDecisionError(error)
    if (mappedError) return mappedError
    console.error('[moderation] submission decision failed', error)
    return apiError('DECISION_FAILED', 'The submission could not be reviewed. Please try again.', 503)
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result.moderated_at !== 'string') {
    return apiError('DECISION_FAILED', 'The review result could not be confirmed.', 503)
  }

  return apiSuccess({
    id: submissionId,
    status: result.status,
    moderatedAt: result.moderated_at,
  })
}
