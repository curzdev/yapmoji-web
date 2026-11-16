alter table public.emoji_submissions
  add column yapmoji_id text;

create function public.generate_yapmoji_id(display_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  slug text;
  candidate text;
begin
  slug := lower(btrim(display_name));
  slug := regexp_replace(slug, '[[:space:]]+', '-', 'g');
  slug := regexp_replace(slug, '[^a-z0-9-]', '', 'g');
  slug := regexp_replace(slug, '-{2,}', '-', 'g');
  slug := trim(both '-' from slug);

  if slug = '' then
    slug := 'emoji';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.emoji_submissions.yapmoji_id', 0)
  );

  loop
    candidate := lpad(floor(random() * 1000000)::integer::text, 6, '0') || '-' || slug;
    exit when not exists (
      select 1
      from public.emoji_submissions
      where yapmoji_id = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_yapmoji_id(text) from public, anon, authenticated;
grant execute on function public.generate_yapmoji_id(text) to service_role;

do $$
declare
  submission record;
begin
  for submission in
    select id, name
    from public.emoji_submissions
    where yapmoji_id is null
    order by created_at, id
  loop
    update public.emoji_submissions
    set yapmoji_id = public.generate_yapmoji_id(submission.name)
    where id = submission.id;
  end loop;
end;
$$;

alter table public.emoji_submissions
  alter column yapmoji_id set not null,
  add constraint emoji_submissions_yapmoji_id_unique unique (yapmoji_id),
  add constraint emoji_submissions_yapmoji_id_format
    check (yapmoji_id ~ '^[0-9]{6}-[a-z0-9]+(-[a-z0-9]+)*$');

create function public.keep_yapmoji_id_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.yapmoji_id is null then
      new.yapmoji_id := public.generate_yapmoji_id(new.name);
    end if;
  elsif new.yapmoji_id is distinct from old.yapmoji_id then
    raise exception 'Yapmoji IDs cannot be changed after creation';
  end if;

  return new;
end;
$$;

revoke all on function public.keep_yapmoji_id_immutable() from public, anon, authenticated;
grant execute on function public.keep_yapmoji_id_immutable() to service_role;

create trigger keep_emoji_submission_yapmoji_id_immutable
  before insert or update of yapmoji_id on public.emoji_submissions
  for each row execute function public.keep_yapmoji_id_immutable();

create table public.emoji_installations (
  emoji_id text not null references public.emoji_submissions (yapmoji_id) on update restrict on delete restrict,
  server_id uuid not null,
  installed_emoji_id uuid not null,
  installed_at timestamptz not null default now(),
  primary key (emoji_id, server_id)
);

alter table public.emoji_installations enable row level security;
revoke all on public.emoji_installations from anon, authenticated;
