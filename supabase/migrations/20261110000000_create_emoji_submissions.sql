create table public.emoji_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 32),
  description text not null default '' check (char_length(description) <= 300),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  tags text[] not null default '{}',
  creator_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/gif', 'image/webp')),
  file_size integer not null check (file_size between 1 and 2097152),
  content_sha256 text not null unique check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users (id) on delete restrict,
  rejection_reason text,
  constraint emoji_submissions_moderation_fields check (
    (status = 'pending' and moderated_at is null and moderated_by is null and rejection_reason is null)
    or (status = 'approved' and moderated_at is not null and moderated_by is not null and rejection_reason is null)
    or (status = 'rejected' and moderated_at is not null and moderated_by is not null and char_length(btrim(rejection_reason)) > 0)
  )
);

create index emoji_submissions_pending_queue_idx
  on public.emoji_submissions (created_at asc)
  where status = 'pending';

create index emoji_submissions_approved_created_idx
  on public.emoji_submissions (created_at desc)
  where status = 'approved';

create index emoji_submissions_moderation_history_idx
  on public.emoji_submissions (moderated_at desc)
  where status in ('approved', 'rejected');

alter table public.emoji_submissions enable row level security;
revoke all on public.emoji_submissions from anon, authenticated;
grant select on public.emoji_submissions to anon, authenticated;

create policy "Public can read approved emoji metadata"
  on public.emoji_submissions
  for select
  to anon, authenticated
  using (status = 'approved');

create policy "Creators can read their own emoji submissions"
  on public.emoji_submissions
  for select
  to authenticated
  using (creator_id = (select auth.uid()));

create type public.app_role as enum ('user', 'moderator', 'admin');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant usage on type public.app_role to authenticated;
grant select on public.user_roles to authenticated;

create policy "Users can read their own role"
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create function public.assign_default_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.assign_default_user_role() from public, anon, authenticated;

create trigger assign_default_user_role_after_signup
  after insert on auth.users
  for each row execute function public.assign_default_user_role();

insert into public.user_roles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create table public.emoji_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji_id uuid not null references public.emoji_submissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, emoji_id)
);

create index emoji_favorites_emoji_idx on public.emoji_favorites (emoji_id);

alter table public.emoji_favorites enable row level security;
revoke all on public.emoji_favorites from anon, authenticated;
grant select, insert, delete on public.emoji_favorites to authenticated;

create policy "Users can read their own favorites"
  on public.emoji_favorites
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can favorite approved emojis"
  on public.emoji_favorites
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.emoji_submissions as submissions
      where submissions.id = emoji_id
        and submissions.status = 'approved'
    )
  );

create policy "Users can remove their own favorites"
  on public.emoji_favorites
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'emoji-submissions',
  'emoji-submissions',
  false,
  2097152,
  array['image/png', 'image/gif', 'image/webp']::text[]
)
on conflict (id) do nothing;

create policy "Public can read approved emoji files"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'emoji-submissions'
    and exists (
      select 1
      from public.emoji_submissions as submissions
      where submissions.storage_path = name
        and submissions.status = 'approved'
    )
  );