begin;

create or replace function public.review_emoji_submission(
  p_actor_user_id uuid,
  p_submission_id uuid,
  p_action text,
  p_reason text default null
)
returns table (
  submission_id uuid,
  status text,
  moderated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_yapin_user_id text;
  actor_role public.app_role;
  submission_status text;
  moderation_time timestamptz;
  normalized_reason text;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'moderation_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('yapmoji-moderator:' || p_actor_user_id::text, 0)
  );

  select accounts.yapin_user_id
  into actor_yapin_user_id
  from public.yapin_users as accounts
  where accounts.id = p_actor_user_id;

  select roles.role
  into actor_role
  from public.user_roles as roles
  where roles.user_id = p_actor_user_id
  for share;

  if actor_yapin_user_id is null
    or (
      pg_catalog.lower(actor_yapin_user_id) <> 'f01324b0-1d14-4e84-85f3-d402bda301ec'
      and actor_role is distinct from 'moderator'::public.app_role
    )
  then
    raise exception using errcode = '42501', message = 'moderation_forbidden';
  end if;

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_moderation_action';
  end if;

  normalized_reason := nullif(btrim(p_reason), '');
  if p_action = 'reject'
    and (normalized_reason is null or char_length(normalized_reason) > 500)
  then
    raise exception using errcode = '22023', message = 'invalid_rejection_reason';
  end if;

  if p_action = 'approve' then
    normalized_reason := null;
  end if;

  select submissions.status
  into submission_status
  from public.emoji_submissions as submissions
  where submissions.id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'submission_not_found';
  end if;
  if submission_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'submission_not_pending';
  end if;

  moderation_time := pg_catalog.clock_timestamp();

  update public.emoji_submissions as submissions
  set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      moderated_at = moderation_time,
      moderated_by = p_actor_user_id,
      rejection_reason = normalized_reason
  where submissions.id = p_submission_id;

  insert into public.moderation_audit_log (
    action,
    actor_user_id,
    submission_id,
    reason,
    created_at
  )
  values (
    case when p_action = 'approve' then 'submission_approved' else 'submission_rejected' end,
    p_actor_user_id,
    p_submission_id,
    normalized_reason,
    moderation_time
  );

  return query
  select p_submission_id, case when p_action = 'approve' then 'approved' else 'rejected' end, moderation_time;
end;
$$;

revoke all on function public.review_emoji_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_emoji_submission(uuid, uuid, text, text) to service_role;

commit;
