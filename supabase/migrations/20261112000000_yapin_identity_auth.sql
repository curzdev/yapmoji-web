begin;

create table public.yapin_users (
  id uuid primary key default gen_random_uuid(),
  yapin_user_id text unique,
  username text,
  display_name text,
  avatar_url text,
  legacy_auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yapin_users_profile_fields check (
    (yapin_user_id is null and username is null and display_name is null and avatar_url is null)
    or (yapin_user_id is not null and char_length(btrim(yapin_user_id)) > 0
      and username is not null and char_length(btrim(username)) > 0)
  )
);

alter table public.yapin_users enable row level security;
revoke all on public.yapin_users from public, anon, authenticated;
grant all on public.yapin_users to service_role;

insert into public.yapin_users (id, legacy_auth_user_id)
select id, id
from auth.users
on conflict (id) do nothing;

drop trigger if exists assign_default_user_role_after_signup on auth.users;
drop function if exists public.assign_default_user_role();

alter table public.emoji_submissions
  drop constraint if exists emoji_submissions_creator_id_fkey,
  drop constraint if exists emoji_submissions_moderated_by_fkey;

alter table public.emoji_submissions
  add constraint emoji_submissions_creator_id_fkey
    foreign key (creator_id) references public.yapin_users (id) on delete set null,
  add constraint emoji_submissions_moderated_by_fkey
    foreign key (moderated_by) references public.yapin_users (id) on delete restrict;

alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey,
  add constraint user_roles_user_id_fkey
    foreign key (user_id) references public.yapin_users (id) on delete cascade;

alter table public.emoji_favorites
  drop constraint if exists emoji_favorites_user_id_fkey,
  add constraint emoji_favorites_user_id_fkey
    foreign key (user_id) references public.yapin_users (id) on delete cascade;

create function public.assign_default_yapin_user_role()
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

revoke execute on function public.assign_default_yapin_user_role() from public, anon, authenticated;

create trigger assign_default_yapin_user_role_after_insert
  after insert on public.yapin_users
  for each row execute function public.assign_default_yapin_user_role();

drop policy if exists "Creators can read their own emoji submissions"
  on public.emoji_submissions;
drop policy if exists "Users can read their own role"
  on public.user_roles;
drop policy if exists "Users can read their own favorites"
  on public.emoji_favorites;
drop policy if exists "Users can favorite approved emojis"
  on public.emoji_favorites;
drop policy if exists "Users can remove their own favorites"
  on public.emoji_favorites;

revoke all on public.user_roles from public, anon, authenticated;
revoke all on public.emoji_favorites from public, anon, authenticated;
grant all on public.user_roles to service_role;
grant all on public.emoji_favorites to service_role;

commit;
