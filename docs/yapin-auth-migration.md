# YapIn authentication migration plan

## Identity and existing records

Yapin user IDs are the stable external identity. `public.yapin_users` stores each
Yapin ID, username, display name, and avatar URL. Its UUID `id` is an internal
foreign-key target for existing Yapmoji tables; it is not an authentication
credential.

Before changing foreign keys or RLS policies, seed one `yapin_users` row for
every existing `auth.users.id`, reusing that UUID as the new row's `id`. Keep a
nullable `legacy_auth_user_id` reference for traceability. Then repoint
`emoji_submissions.creator_id`, `emoji_submissions.moderated_by`,
`emoji_favorites.user_id`, and `user_roles.user_id` to `yapin_users.id`.
Existing UUID values, submissions, favorites, and role assignments therefore
remain unchanged.

There is no safe automatic way to associate a legacy Supabase account with a
Yapin account using usernames or display names. Legacy rows remain intact and
unlinked until an explicit, authenticated account-linking flow is designed.
Do not delete `auth.users` or infer links from profile text.

## Authorization and RLS cutover

1. Deploy server-side YapIn OAuth, signed HttpOnly Yapmoji sessions, and
   server routes that use the service-role database client only after verifying
   the signed session and ownership/role on every request.
2. Keep public approved-emoji and approved-file reads available.
3. Remove direct `authenticated` table policies and grants that depend on
   `auth.uid()`. Keep user profiles, favorites, submissions, and roles
   inaccessible to browser database clients; route those operations through
   server-side authorization checks.
4. Preserve moderation roles, but look them up by internal `yapin_users.id`
   after verifying the Yapmoji session. No YapIn OAuth claim grants moderation
   privileges.

The migration must run after taking a database backup and confirming the live
schema matches the checked-in migrations. Validate row counts, foreign-key
coverage, role counts, and favorite pairs before and after the migration.
Do not automatically merge old accounts; plan account linking separately.

## Session behavior

OAuth access tokens are used only server-to-server for `/api/oauth/me` and are
not stored in browser cookies or the database. Yapmoji signs a separate
HttpOnly session cookie containing the synchronized profile and internal user
UUID. Its expiry is bounded by the YapIn token's documented `expires_in`.
Yapin currently documents no refresh tokens, so users must authorize again
after expiration.
