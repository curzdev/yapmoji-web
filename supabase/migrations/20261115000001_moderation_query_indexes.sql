create index if not exists emoji_submissions_creator_id_idx
  on public.emoji_submissions (creator_id)
  where creator_id is not null;

create index if not exists emoji_submissions_moderated_by_idx
  on public.emoji_submissions (moderated_by)
  where moderated_by is not null;

create index if not exists moderation_audit_log_submission_idx
  on public.moderation_audit_log (submission_id)
  where submission_id is not null;

create index if not exists moderation_audit_log_target_idx
  on public.moderation_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

create index if not exists user_roles_moderator_added_by_idx
  on public.user_roles (moderator_added_by)
  where moderator_added_by is not null;
