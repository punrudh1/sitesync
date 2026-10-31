-- Phase 4: hardening, rate limits, avatar storage, search indexes.

-- ---------- close client-side write paths that triggers/RPCs already cover ----------
-- Notifications and activity entries are produced only by triggers/RPCs, so a member can neither
-- spam the other member with crafted messages/links nor forge history.
drop policy if exists notifications_insert on notifications;
revoke insert on notifications from authenticated;
drop policy if exists activity_insert on activity_logs;
revoke insert on activity_logs from authenticated;

-- Documents and versions are created only by register_document / add_document_version, which
-- verify the storage object, size and path. Direct inserts would bypass that validation.
drop policy if exists documents_insert on documents;
drop policy if exists versions_insert on document_versions;
revoke insert on documents, document_versions from authenticated;

-- Owners may only revoke a pending invitation (not resurrect an old one).
drop policy if exists invites_update on project_invitations;
create policy invites_update on project_invitations for update to authenticated
  using (is_project_owner(project_id) and status = 'pending')
  with check (is_project_owner(project_id) and status = 'revoked');

-- Folder creation is logged by a trigger instead of the app.
create or replace function trg_folder_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.project_id, new.created_by, 'folder_created', 'folder', new.id, 'created folder ' || new.name);
  return new;
end $$;
create trigger folders_after_insert after insert on folders for each row execute function trg_folder_insert();

-- ---------- rate limits ----------
create or replace function limit_invitations() returns trigger language plpgsql as $$
begin
  if (select count(*) from project_invitations where project_id = new.project_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many invitations created recently. Please try again later.';
  end if;
  return new;
end $$;
create trigger invitations_rate_limit before insert on project_invitations for each row execute function limit_invitations();

create or replace function create_project(
  p_name text, p_code text, p_description text default '',
  p_start_date date default null, p_target_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if (select count(*) from projects where created_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many projects created today';
  end if;
  insert into projects (name, code, description, start_date, target_completion_date, created_by)
  values (trim(p_name), trim(p_code), coalesce(p_description,''), p_start_date, p_target_date, auth.uid())
  returning id into pid;
  insert into project_members (project_id, user_id, role) values (pid, auth.uid(), 'owner');
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (pid, auth.uid(), 'project_created', 'project', pid, 'Created project ' || trim(p_name));
  return pid;
end $$;

-- ---------- avatars (private bucket; own folder; visible to people you share a project with) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function storage_user_id(object_name text) returns uuid
language plpgsql immutable as $$
begin return split_part(object_name,'/',1)::uuid;
exception when others then return null; end $$;

create policy "avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage_user_id(name) = auth.uid() or shares_project_with(storage_user_id(name))));
create policy "avatars upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and storage_user_id(name) = auth.uid());
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and storage_user_id(name) = auth.uid());

-- ---------- search performance ----------
create extension if not exists pg_trgm;
create index if not exists documents_name_trgm on documents using gin (name gin_trgm_ops);
create index if not exists tasks_title_trgm on tasks using gin (title gin_trgm_ops);
create index if not exists messages_body_trgm on discussion_messages using gin (body gin_trgm_ops);
create index if not exists annotations_body_trgm on drawing_annotations using gin (body gin_trgm_ops);
create index if not exists folders_name_trgm on folders using gin (name gin_trgm_ops);
