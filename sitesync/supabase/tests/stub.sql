-- Minimal stand-ins for the Supabase-managed `auth` and `storage` schemas so migrations can run on plain Postgres (testing only).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth; create schema if not exists storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to authenticated, anon;
grant select, insert, delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant execute on functions to authenticated, anon;
create publication supabase_realtime;

-- stand-in for the pg_net extension: records calls (and can be told to fail)
create schema if not exists net;
create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
begin
  if current_setting('test.net_fail', true) = '1' then raise exception 'simulated network failure'; end if;
  insert into net.calls(url, body, headers) values (url, body, headers); return 1;
end $$;
