-- Hako Downloader schema
-- Run in Supabase SQL Editor (or via CLI)

-- Profiles (1-1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  hako_user_label text default 'Chưa đăng nhập',
  hako_logged_in boolean default false,
  hako_storage_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Novels fetched per user
create table if not exists public.novels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_url text not null,
  title text not null,
  author text,
  genres text,
  summary_html text,
  volumes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_url)
);

-- Download job history (client-orchestrated)
create table if not exists public.download_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  novel_id uuid references public.novels (id) on delete set null,
  selected_volume_ids int[] not null default '{}',
  export_formats text[] not null default '{epub}',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress numeric not null default 0,
  current_message text,
  logs text not null default '',
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Generated files metadata
create table if not exists public.download_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.download_jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  novel_id uuid references public.novels (id) on delete set null,
  filename text not null,
  format text,
  storage_path text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

-- App config (admin)
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values
  ('max_concurrent_jobs', '10'::jsonb),
  ('max_sessions', '20'::jsonb)
on conflict (key) do nothing;

-- Indexes
create index if not exists novels_user_id_idx on public.novels (user_id);
create index if not exists download_jobs_user_id_idx on public.download_jobs (user_id);
create index if not exists download_jobs_status_idx on public.download_jobs (status);
create index if not exists download_files_user_id_idx on public.download_files (user_id);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists novels_set_updated_at on public.novels;
create trigger novels_set_updated_at
before update on public.novels
for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_list text := coalesce(current_setting('app.admin_emails', true), '');
  is_admin boolean := false;
begin
  if admin_list <> '' and position(lower(new.email) in lower(admin_list)) > 0 then
    is_admin := true;
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when is_admin then 'admin' else 'user' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.novels enable row level security;
alter table public.download_jobs enable row level security;
alter table public.download_files enable row level security;
alter table public.app_config enable row level security;

-- Helper: is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- profiles policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

-- novels
drop policy if exists "novels_select_own_or_admin" on public.novels;
create policy "novels_select_own_or_admin" on public.novels
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "novels_insert_own" on public.novels;
create policy "novels_insert_own" on public.novels
for insert with check (auth.uid() = user_id);

drop policy if exists "novels_update_own" on public.novels;
create policy "novels_update_own" on public.novels
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "novels_delete_own_or_admin" on public.novels;
create policy "novels_delete_own_or_admin" on public.novels
for delete using (auth.uid() = user_id or public.is_admin());

-- download_jobs
drop policy if exists "jobs_select_own_or_admin" on public.download_jobs;
create policy "jobs_select_own_or_admin" on public.download_jobs
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "jobs_insert_own" on public.download_jobs;
create policy "jobs_insert_own" on public.download_jobs
for insert with check (auth.uid() = user_id);

drop policy if exists "jobs_update_own" on public.download_jobs;
create policy "jobs_update_own" on public.download_jobs
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "jobs_delete_own_or_admin" on public.download_jobs;
create policy "jobs_delete_own_or_admin" on public.download_jobs
for delete using (auth.uid() = user_id or public.is_admin());

-- download_files
drop policy if exists "files_select_own_or_admin" on public.download_files;
create policy "files_select_own_or_admin" on public.download_files
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "files_insert_own" on public.download_files;
create policy "files_insert_own" on public.download_files
for insert with check (auth.uid() = user_id);

drop policy if exists "files_delete_own_or_admin" on public.download_files;
create policy "files_delete_own_or_admin" on public.download_files
for delete using (auth.uid() = user_id or public.is_admin());

-- app_config: everyone can read, only admin write
drop policy if exists "config_select_auth" on public.app_config;
create policy "config_select_auth" on public.app_config
for select to authenticated using (true);

drop policy if exists "config_write_admin" on public.app_config;
create policy "config_write_admin" on public.app_config
for all using (public.is_admin()) with check (public.is_admin());

-- Storage bucket (run in dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('downloads', 'downloads', false)
-- on conflict do nothing;

-- Storage policies example (path: {user_id}/...)
-- create policy "storage_read_own" on storage.objects for select
--   using (bucket_id = 'downloads' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()));
-- create policy "storage_insert_own" on storage.objects for insert
--   with check (bucket_id = 'downloads' and auth.uid()::text = (storage.foldername(name))[1]);
-- create policy "storage_delete_own" on storage.objects for delete
--   using (bucket_id = 'downloads' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()));
