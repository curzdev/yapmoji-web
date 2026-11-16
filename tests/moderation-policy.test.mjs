import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessModeratorDashboard,
  getModerationLogPolicy,
  hasModeratorRole,
  isModerationAction,
  isValidYapinUserId,
  isYapmojiOwner,
  normalizeRejectionReason,
  YAPMOJI_OWNER_YAPIN_ID,
} from '../lib/moderation-policy.ts'
import { localDateBoundary, parseDateBoundary, quotePostgrestValue } from '../lib/moderation-filters.ts'

test('only the configured YapIn identity is recognized as the owner', () => {
  assert.equal(isYapmojiOwner(YAPMOJI_OWNER_YAPIN_ID), true)
  assert.equal(isYapmojiOwner(YAPMOJI_OWNER_YAPIN_ID.toUpperCase()), true)
  assert.equal(isYapmojiOwner('f01324b0-1d14-4e84-85f3-d402bda301ed'), false)
  assert.equal(isYapmojiOwner('f01324b0-1d14-4e84-85f3-d402bda301ec-extra'), false)
})

test('owner, moderator, and normal-user dashboard permissions remain separate', () => {
  assert.equal(canAccessModeratorDashboard(YAPMOJI_OWNER_YAPIN_ID, 'user'), true)
  assert.equal(isYapmojiOwner(YAPMOJI_OWNER_YAPIN_ID), true)
  assert.equal(hasModeratorRole('moderator'), true)

  assert.equal(canAccessModeratorDashboard('550e8400-e29b-41d4-a716-446655440000', 'moderator'), true)
  assert.equal(isYapmojiOwner('550e8400-e29b-41d4-a716-446655440000'), false)

  assert.equal(canAccessModeratorDashboard('550e8400-e29b-41d4-a716-446655440000', 'user'), false)
  assert.equal(canAccessModeratorDashboard('550e8400-e29b-41d4-a716-446655440000', 'admin'), false)
  assert.equal(hasModeratorRole('admin'), false)
})

test('moderator log policy is personal while owner policy includes management events', () => {
  assert.deepEqual(getModerationLogPolicy('moderator', 'internal-moderator-id'), {
    actorUserId: 'internal-moderator-id',
    actions: ['submission_approved', 'submission_rejected'],
  })
  assert.deepEqual(getModerationLogPolicy('owner', 'internal-owner-id'), {
    actorUserId: null,
    actions: ['submission_approved', 'submission_rejected', 'moderator_added', 'moderator_removed'],
  })
})

test('moderator targets must be UUID YapIn IDs', () => {
  assert.equal(isValidYapinUserId('550e8400-e29b-41d4-a716-446655440000'), true)
  assert.equal(isValidYapinUserId('not-a-user-id'), false)
  assert.equal(isValidYapinUserId(null), false)
})

test('moderation actions and rejection reasons are constrained', () => {
  assert.equal(isModerationAction('approve'), true)
  assert.equal(isModerationAction('reject'), true)
  assert.equal(isModerationAction('delete'), false)
  assert.equal(normalizeRejectionReason('  Please reduce the file size.  '), 'Please reduce the file size.')
  assert.equal(normalizeRejectionReason(' \n '), null)
  assert.equal(normalizeRejectionReason('x'.repeat(500)), 'x'.repeat(500))
  assert.equal(normalizeRejectionReason('x'.repeat(501)), null)
  assert.equal(normalizeRejectionReason({}), null)
})

test('moderation filters validate UTC date boundaries and quote search values', () => {
  assert.equal(parseDateBoundary('2026-11-15'), '2026-11-15T00:00:00.000Z')
  assert.equal(parseDateBoundary('2026-11-15', true), '2026-11-16T00:00:00.000Z')
  assert.equal(parseDateBoundary('2026-02-30'), false)
  assert.equal(parseDateBoundary('not-a-date'), false)
  assert.equal(parseDateBoundary(null), null)
  assert.equal(parseDateBoundary('2026-11-15T00:00:00.000Z'), '2026-11-15T00:00:00.000Z')
  assert.equal(parseDateBoundary('2026-11-15T00:00:00.000+00:00'), false)
  assert.match(localDateBoundary('2026-11-15'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(quotePostgrestValue('name,*(test)"'), '"name,*(test)\\""')
})
