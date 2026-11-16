# Yapmoji Backend API

All API responses use JSON. Errors have the shape `{ "error": { "code": "...", "message": "..." } }`.

## Authentication

YapIn is the only login provider. `/login` offers Continue with YapIn and redirects through `/auth/yapin/start`. The server validates OAuth state and PKCE, exchanges the code with YapIn, fetches the profile, upserts it by stable YapIn user ID, and issues a signed, HttpOnly `yapmoji_session` cookie. OAuth tokens are not stored in the browser or database. Sessions expire with the YapIn access token; there are no refresh tokens.

`GET /api/auth/session` returns the signed-in user's public YapIn profile or `null`. `POST /api/auth/logout` clears the session and requires a same-origin `Origin` header. `/upload` and `/dashboard` require a valid Yapmoji session. Guests are sent to `/login?next=...`.

## `POST /api/submissions`

Requires a valid Yapmoji session and a same-origin `Origin` header. The API uses the verified session's internal Yapmoji user UUID as `creator_id`; it never accepts an identity from the request body. Guests receive `401`; cross-origin requests receive `403`.

Accepts `multipart/form-data` fields:

| Field | Type | Constraints |
| --- | --- | --- |
| `file` | File | PNG, GIF, or WebP content; at most 2 MiB |
| `name` | String | 2-32 characters |
| `description` | String | Optional; at most 300 characters |
| `category` | String | 1-40 characters |
| `tags` | JSON string array | At most 12 tags, each 1-32 characters |

On success, returns `201` with `{ "data": { "id", "name", "status", "createdAt" } }`. New submissions always start as `pending`. Duplicate image content returns `409`; invalid input returns `400`; oversized requests return `413`; rate limiting returns `429`; unavailable storage/database configuration returns `503`.

The route applies a basic in-process limit of five requests per source IP per hour. This limit is not shared across server instances and is not sufficient as a production abuse-control system.

## `GET /api/emojis`

Returns approved emojis only. Optional query parameters are `q` (name search), `category`, `limit` (1-48, default 20), and `offset` (0-1000, default 0).

Success response: `{ "data": [{ "id", "emojiId", "name", "description", "category", "tags", "imageUrl", "createdAt" }], "pagination": { "count", "limit", "offset" } }`. `id` remains the internal UUID used by website relations. `emojiId` is the permanent public ID in the `123456-emoji-name` format. `imageUrl` is a private-storage signed URL that expires after five minutes. Responses are not cached.

## `GET /api/emojis/{emojiId}`

Returns the details for one approved emoji using its permanent public ID. Pending, rejected, missing, and malformed IDs all return `404`. The response has the same emoji fields as the list endpoint and a five-minute private-storage signed `imageUrl`.

## YapIn bot installations

The bot reads emoji metadata and checks `status = 'approved'` before downloading files from the same Yapmoji Supabase project using a server-only service-role key. Successful installations are recorded in `emoji_installations`; the `(emoji_id, server_id)` primary key prevents duplicate records. The table has row-level security enabled and no browser-role access.

Apply the migration in `supabase/migrations/20261111000000_add_yapmoji_ids_and_installations.sql` without resetting existing data. It backfills permanent public IDs for existing submissions, assigns IDs to future submissions, and prevents changing an assigned ID.

## `/api/favorites`

All methods require a verified Yapmoji session. `GET` returns the current user's emoji IDs as `{ "data": { "emojiIds": ["..."] } }`. `PUT` adds a favorite and `DELETE` removes one; both accept `{ "emojiId": "<uuid>" }`. Mutating methods require a same-origin `Origin` header. The API checks that only approved emojis are favorited and scopes every read/write to the session's internal user UUID.

## Moderation

The owner is the exact YapIn user ID `f01324b0-1d14-4e84-85f3-d402bda301ec`. `/owner` and moderator-management APIs verify this ID from the signed server session; `user_roles` never grants owner access. The profile menu's owner item is only a convenience and is not an authorization check.

The dashboards are separate. `/owner` is restricted to the exact owner YapIn ID and is for moderator management and activity monitoring. `/moderation` is available only to accounts whose database role is `moderator`; the owner is automatically authorized without a moderator row. The profile menu only reflects these server-verified roles for navigation; every page and API endpoint checks access again server-side. Add/remove moderator operations are owner-only, update the existing `user_roles` table, and record who added a moderator and when. A removed moderator is checked against the database on each request and inside the atomic review procedure.

`POST /api/moderation/submissions/{submissionId}` accepts `{ "action": "approve" }` or `{ "action": "reject", "reason": "..." }`. Rejection reasons are required and limited to 500 characters. The database procedure locks the submission row, only changes a `pending` submission, and writes the immutable audit record in the same transaction. Concurrent reviewers cannot approve/reject the same pending row twice. Existing public RLS policies expose only approved submissions and their stored files.

`GET /api/owner/moderators?yapinUserId=...` verifies a profile before showing it for confirmation. YapIn's existing `/api/oauth/me` endpoint only verifies the currently authenticated user; it does not support looking up arbitrary IDs. Therefore, the owner dashboard can verify IDs already present in `yapin_users` from a successful YapIn login. A user who has never signed into Yapmoji cannot be added until that profile has been synchronized.

`GET /api/moderation/submissions` provides the pending queue with `q`, `from`, `to`, `sort`, and `offset` filters. Search matches submission names or submitter usernames/YapIn IDs. `GET /api/moderation/activity` returns the pending count and only the current moderator's approval/rejection totals and recent actions. `GET /api/moderation/logs` returns paginated, read-only audit entries; it supports `q`, `moderator`, `action`, `from`, `to`, `sort`, and `offset` for the owner. Moderator callers are server-scoped to their own submission decisions; attempts to select another moderator or view moderator-management actions are denied.

The owner dashboard contains moderator management and recent moderator activity, with access to all audit records including moderator additions and removals. The moderator dashboard contains only the pending/reviewed submission workflow and the current moderator's activity. The owner can visit both pages, but the two dashboards and their APIs remain separate.

`supabase/migrations/20261115000000_owner_moderator_approval.sql` adds moderator assignment metadata, the immutable audit table, and service-role-only atomic review/management procedures. `supabase/migrations/20261116000000_restrict_moderation_to_moderators.sql` updates the review procedure so only the exact owner or a database `moderator` role may review submissions; an unrelated `admin` role does not grant moderation access. Apply pending migrations to the Yapmoji Supabase project. Browser roles retain no permission to modify submission statuses, roles, or audit records. Keep all service-role operations server-side.

## Configuration

Set `YAPIN_CLIENT_SECRET` and a random `YAPIN_SESSION_SECRET` of at least 32 bytes in server-side environment configuration, along with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the separate Yapmoji database. Never expose either secret or the service-role key to client code. `YAPIN_REDIRECT_URI` is used for both authorization and token exchange and must exactly match a callback registered with YapIn. For local development, register and use `http://localhost:3000/auth/yapin/callback`; for production, set it to `https://yapmoji.netlify.app/auth/yapin/callback`.

Before enabling production login, back up the Yapmoji database and apply `supabase/migrations/20261112000000_yapin_identity_auth.sql`. It repoints the existing internal UUID foreign keys without deleting website data and removes direct browser access to user-specific rows. Do not match legacy accounts to YapIn accounts by username or display name; use an explicit account-linking process if legacy associations are needed.