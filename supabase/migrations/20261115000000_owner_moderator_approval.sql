begin;

alter table public.user_roles
  add column moderator_added_at timestamptz,
  add column moderator_added_by uuid references public.yapin_users (id) on delete restrict;

update public.user_roles
set moderator_added_at = created_at
where role = 'moderator';

alter table public.user_roles
  add constraint user_roles_moderator_metadata_check check (
    (role = 'moderator' and moderator_added_at is not null)
    or (
      role <> 'moderator'
      and moderator_added_at is null
      and moderator_added_by is null
    )
  ),
  add constraint user_roles_moderator_added_by_check check (
    moderator_added_by is null or role = 'moderator'
  );

alter table public.user_roles enable row level security;
revoke all on public.user_roles from public, anon, authenticated;
grant all on public.user_roles to service_role;

create index user_roles_moderator_idx
  on public.user_roles (user_id)
  where role = 'moderator';

create table public.moderation_audit_log (
  id bigint generated always as identity primary key,
  action text not null check (
    action in (
      'submission_approved',
      'submission_rejected',
      'moderator_added',
      'moderator_removed'
    )
  ),
  actor_user_id uuid not null references public.yapin_users (id) on delete restrict,
  target_user_id uuid references public.yapin_users (id) on delete restrict,
  submission_id uuid references public.emoji_submissions (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  constraint moderation_audit_log_action_fields_check check (
    (
      action = 'submission_approved'
      and submission_id is not null
      and target_user_id is null
      and reason is null
    )
    or (
      action = 'submission_rejected'
      and submission_id is not null
      and target_user_id is null
      and reason is not null
      and char_length(btrim(reason)) between 1 and 500
    )
    or (
      action in ('moderator_added', 'moderator_removed')
      and submission_id is null
      and target_user_id is not null
      and reason is null
    )
  )
);

create index moderation_audit_log_recent_idx
  on public.moderation_audit_log (created_at desc);
create index moderation_audit_log_actor_idx
  on public.moderation_audit_log (actor_user_id, created_at desc);

alter table public.moderation_audit_log enable row level security;
revoke all on public.moderation_audit_log from public, anon, authenticated, service_role;
grant select on public.moderation_audit_log to service_role;

create function public.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Moderation audit records are immutable';
  return null;
end;
$$;

revoke all on function public.prevent_moderation_audit_mutation() from public, anon, authenticated;

create trigger moderation_audit_log_immutable
  before update or delete on public.moderation_audit_log
  for each row execute function public.prevent_moderation_audit_mutation();

create function public.review_emoji_submission(
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
      and (actor_role is null or actor_role not in ('moderator', 'admin'))
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

create function public.manage_emoji_moderator(
  p_actor_user_id uuid,
  p_target_yapin_user_id text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_yapin_user_id text;
  target_user_id uuid;
  target_role public.app_role;
  change_time timestamptz;
begin
  select accounts.yapin_user_id
  into actor_yapin_user_id
  from public.yapin_users as accounts
  where accounts.id = p_actor_user_id;

  if actor_yapin_user_id is null
    or pg_catalog.lower(actor_yapin_user_id) <> 'f01324b0-1d14-4e84-85f3-d402bda301ec'
  then
    raise exception using errcode = '42501', message = 'owner_only';
  end if;

  if p_action is null or p_action not in ('add', 'remove') then
    raise exception using errcode = '22023', message = 'invalid_moderator_action';
  end if;

  if p_target_yapin_user_id is null
    or p_target_yapin_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.lower(p_target_yapin_user_id) = 'f01324b0-1d14-4e84-85f3-d402bda301ec'
  then
    raise exception using errcode = '22023', message = 'invalid_moderator_target';
  end if;

  select accounts.id
  into target_user_id
  from public.yapin_users as accounts
  where pg_catalog.lower(accounts.yapin_user_id) = pg_catalog.lower(p_target_yapin_user_id);

  if not found then
    raise exception using errcode = 'P0002', message = 'yapin_user_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('yapmoji-moderator:' || target_user_id::text, 0)
  );

  if p_action = 'add' then
    insert into public.user_roles (user_id, role)
    values (target_user_id, 'user')
    on conflict (user_id) do nothing;

    select roles.role
    into target_role
    from public.user_roles as roles
    where roles.user_id = target_user_id
    for update;

    if target_role = 'moderator' then
      raise exception using errcode = 'P0001', message = 'moderator_already_exists';
    end if;
    if target_role <> 'user' then
      raise exception using errcode = 'P0001', message = 'target_has_protected_role';
    end if;

    change_time := pg_catalog.clock_timestamp();
    update public.user_roles as roles
    set role = 'moderator',
        moderator_added_at = change_time,
        moderator_added_by = p_actor_user_id
    where roles.user_id = target_user_id;

    insert into public.moderation_audit_log (
      action,
      actor_user_id,
      target_user_id,
      created_at
    )
    values ('moderator_added', p_actor_user_id, target_user_id, change_time);
  else
    select roles.role
    into target_role
    from public.user_roles as roles
    where roles.user_id = target_user_id
    for update;

    if not found or target_role <> 'moderator' then
      raise exception using errcode = 'P0001', message = 'moderator_not_found';
    end if;

    change_time := pg_catalog.clock_timestamp();
    update public.user_roles as roles
    set role = 'user',
        moderator_added_at = null,
        moderator_added_by = null
    where roles.user_id = target_user_id;

    insert into public.moderation_audit_log (
      action,
      actor_user_id,
      target_user_id,
      created_at
    )
    values ('moderator_removed', p_actor_user_id, target_user_id, change_time);
  end if;
end;
$$;

revoke all on function public.manage_emoji_moderator(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.manage_emoji_moderator(uuid, text, text) to service_role;

revoke all on public.emoji_submissions from anon, authenticated;
grant select on public.emoji_submissions to anon, authenticated;

commit;
