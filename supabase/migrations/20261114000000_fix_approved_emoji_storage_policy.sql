begin;

drop policy if exists "Public can read approved emoji files"
  on storage.objects;

create policy "Public can read approved emoji files"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'emoji-submissions'
    and exists (
      select 1
      from public.emoji_submissions as submissions
      where submissions.storage_path = storage.objects.name
        and submissions.status = 'approved'
    )
  );

commit;
