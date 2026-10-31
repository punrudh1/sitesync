-- Phase 2: transactional document / version RPCs and tighter column grants.

-- Members may edit only these document columns directly. current_version_id changes via RPCs.
revoke update on documents from authenticated;
grant update (name, folder_id, description, status, last_modified_by) on documents to authenticated;
revoke update on folders from authenticated;
grant update (name) on folders to authenticated;

-- A document's name must keep the extension recorded for it, so downloads and viewers stay consistent.
create or replace function enforce_document_extension() returns trigger language plpgsql as $$
begin
  if lower(substring(new.name from '\.([^.]+)$')) is distinct from lower(new.extension) then
    raise exception 'File name must end in .%', new.extension;
  end if;
  return new;
end $$;
create trigger documents_extension before insert or update of name on documents
  for each row execute function enforce_document_extension();

-- Confirms the object really exists in storage, was not uploaded by someone else, and has the declared size.
create or replace function assert_uploaded(p_path text, p_size bigint) returns void
language plpgsql security definer set search_path = public, storage as $$
declare o storage.objects%rowtype;
begin
  select * into o from storage.objects where bucket_id = 'project-files' and name = p_path;
  if not found then raise exception 'The uploaded file was not found in storage'; end if;
  -- Some upload paths leave owner_id null; the per-upload random UUID path plus the membership check still bind this to the caller's project.
  if o.owner_id is not null and o.owner_id <> auth.uid()::text then raise exception 'You did not upload this file'; end if;
  if (o.metadata->>'size')::bigint is distinct from p_size then raise exception 'Uploaded file size does not match'; end if;
end $$;
revoke all on function assert_uploaded(text, bigint) from public, anon, authenticated;

create or replace function register_document(
  p_project uuid, p_folder uuid, p_document uuid, p_version uuid, p_name text,
  p_storage_path text, p_mime text, p_size bigint, p_description text default '',
  p_label text default null, p_notes text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare ext text := lower(substring(p_name from '\.([^.]+)$'));
begin
  if not is_project_member(p_project) then raise exception 'Not a member of this project'; end if;
  if p_size > 104857600 then raise exception 'File is larger than the 100 MB limit'; end if;
  if p_storage_path not like p_project || '/' || p_document || '/' || p_version || '/%' then
    raise exception 'Invalid storage path';
  end if;
  perform assert_uploaded(p_storage_path, p_size);

  insert into documents (id, project_id, folder_id, name, extension, description, uploaded_by, last_modified_by)
  values (p_document, p_project, p_folder, p_name, ext, coalesce(p_description,''), auth.uid(), auth.uid());
  insert into document_versions (id, document_id, project_id, version_number, revision_label, revision_notes,
                                 storage_path, mime_type, file_size, uploaded_by)
  values (p_version, p_document, p_project, 1, p_label, coalesce(p_notes,''), p_storage_path, p_mime, p_size, auth.uid());
  update documents set current_version_id = p_version where id = p_document;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (p_project, auth.uid(), 'document_uploaded', 'document', p_document, 'uploaded ' || p_name);
  return p_document;
end $$;

create or replace function add_document_version(
  p_document uuid, p_version uuid, p_storage_path text, p_mime text, p_size bigint,
  p_label text default null, p_notes text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare d documents%rowtype; n integer;
begin
  select * into d from documents where id = p_document for update;   -- serialises concurrent revisions
  if not found or not is_project_member(d.project_id) then raise exception 'Document not found'; end if;
  if p_size > 104857600 then raise exception 'File is larger than the 100 MB limit'; end if;
  if p_storage_path not like d.project_id || '/' || p_document || '/' || p_version || '/%' then
    raise exception 'Invalid storage path';
  end if;
  if lower(substring(p_storage_path from '\.([^./]+)$')) <> d.extension then
    raise exception 'A new version must be a .% file', d.extension;
  end if;
  perform assert_uploaded(p_storage_path, p_size);

  select coalesce(max(version_number), 0) + 1 into n from document_versions where document_id = p_document;
  insert into document_versions (id, document_id, project_id, version_number, revision_label, revision_notes,
                                 storage_path, mime_type, file_size, uploaded_by)
  values (p_version, p_document, d.project_id, n, p_label, coalesce(p_notes,''), p_storage_path, p_mime, p_size, auth.uid());
  update documents set current_version_id = p_version, last_modified_by = auth.uid() where id = p_document;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (d.project_id, auth.uid(), 'document_version_created', 'document', p_document,
          'uploaded version ' || n || ' of ' || d.name);
  return n;
end $$;

create or replace function restore_document_version(p_document uuid, p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d documents%rowtype; v document_versions%rowtype;
begin
  select * into d from documents where id = p_document for update;
  if not found or not is_project_member(d.project_id) then raise exception 'Document not found'; end if;
  select * into v from document_versions where id = p_version and document_id = p_document;
  if not found then raise exception 'Version not found'; end if;
  -- History is untouched: only the pointer to the current version moves.
  update documents set current_version_id = p_version, last_modified_by = auth.uid() where id = p_document;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (d.project_id, auth.uid(), 'document_version_restored', 'document', p_document,
          'restored version ' || v.version_number || ' of ' || d.name);
end $$;

revoke all on function register_document(uuid,uuid,uuid,uuid,text,text,text,bigint,text,text,text),
  add_document_version(uuid,uuid,text,text,bigint,text,text),
  restore_document_version(uuid,uuid) from public, anon;
grant execute on function register_document(uuid,uuid,uuid,uuid,text,text,text,bigint,text,text,text),
  add_document_version(uuid,uuid,text,text,bigint,text,text),
  restore_document_version(uuid,uuid) to authenticated;
