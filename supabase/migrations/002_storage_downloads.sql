-- Storage bucket + RLS policies for downloaded novel files
-- Path convention: {user_id}/{job_id}/{filename}

insert into storage.buckets (id, name, public)
values ('downloads', 'downloads', false)
on conflict (id) do nothing;

-- Clean re-runs
drop policy if exists "storage_read_own" on storage.objects;
drop policy if exists "storage_insert_own" on storage.objects;
drop policy if exists "storage_update_own" on storage.objects;
drop policy if exists "storage_delete_own" on storage.objects;

create policy "storage_read_own" on storage.objects
for select
using (
  bucket_id = 'downloads'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.is_admin()
  )
);

create policy "storage_insert_own" on storage.objects
for insert
with check (
  bucket_id = 'downloads'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "storage_update_own" on storage.objects
for update
using (
  bucket_id = 'downloads'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'downloads'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "storage_delete_own" on storage.objects
for delete
using (
  bucket_id = 'downloads'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.is_admin()
  )
);
