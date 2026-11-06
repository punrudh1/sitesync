-- Add RVT support and enforce a 2 GiB per-project storage quota.
-- Quota counts every retained document version, not only each document's current version.
create or replace function register_drive_document(
  p_project uuid, p_folder uuid, p_document uuid, p_version uuid, p_name text,
  p_drive_file_id text, p_mime text, p_size bigint,
  p_label text default null, p_notes text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  ext text := lower(substring(p_name from '\\.([^.]+)$'));
  stored_path text := p_project::text || '/' || p_document::text || '/' || p_version::text || '/' || p_drive_file_id;
  used_bytes bigint;
begin
  if not is_project_member(p_project) then raise exception 'Not a member of this project'; end if;
  perform 1 from projects where id = p_project for update;
  if not found then raise exception 'Project not found'; end if;
  if p_size <= 0 or p_size > 104857600 then raise exception 'File must be between 1 byte and 100 MB'; end if;
  if p_drive_file_id !~ '^[A-Za-z0-9_-]+$' then raise exception 'Invalid Google Drive file id'; end if;
  if position('.' in p_name) = 0 or ext not in ('pdf','jpg','jpeg','png','docx','xlsx','csv','dwg','dxf','zip','txt','rvt') then raise exception 'Unsupported file extension'; end if;

  select coalesce(sum(file_size), 0) into used_bytes from document_versions where project_id = p_project;
  if used_bytes + p_size > 2147483648 then
    raise exception 'Project storage limit reached (2 GB). Delete old document versions or files to free space.';
  end if;

  insert into documents (id, project_id, folder_id, name, extension, uploaded_by, last_modified_by)
  values (p_document, p_project, p_folder, p_name, ext, auth.uid(), auth.uid());
  insert into document_versions (id, document_id, project_id, version_number, revision_label, revision_notes,
    storage_path, storage_provider, mime_type, file_size, uploaded_by)
  values (p_version, p_document, p_project, 1, p_label, coalesce(p_notes,''), stored_path, 'google_drive', p_mime, p_size, auth.uid());
  update documents set current_version_id = p_version where id = p_document;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (p_project, auth.uid(), 'document_uploaded', 'document', p_document, 'uploaded ' || p_name);
  return p_document;
end $$;

create or replace function add_drive_document_version(
  p_document uuid, p_version uuid, p_drive_file_id text, p_mime text, p_size bigint,
  p_label text default null, p_notes text default ''
) returns integer language plpgsql security definer set search_path = public as $$
declare
  d documents%rowtype;
  n integer;
  stored_path text;
  v_project_id uuid;
  used_bytes bigint;
begin
  select project_id into v_project_id from documents where id = p_document;
  if not found or not is_project_member(v_project_id) then raise exception 'Document not found'; end if;
  perform 1 from projects where id = v_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  select * into d from documents where id = p_document for update;
  if not found then raise exception 'Document not found'; end if;
  if p_size <= 0 or p_size > 104857600 then raise exception 'File must be between 1 byte and 100 MB'; end if;
  if p_drive_file_id !~ '^[A-Za-z0-9_-]+$' then raise exception 'Invalid Google Drive file id'; end if;

  select coalesce(sum(file_size), 0) into used_bytes from document_versions where project_id = v_project_id;
  if used_bytes + p_size > 2147483648 then
    raise exception 'Project storage limit reached (2 GB). Delete old document versions or files to free space.';
  end if;

  stored_path := d.project_id::text || '/' || p_document::text || '/' || p_version::text || '/' || p_drive_file_id;
  select coalesce(max(version_number), 0) + 1 into n from document_versions where document_id = p_document;
  insert into document_versions (id, document_id, project_id, version_number, revision_label, revision_notes,
    storage_path, storage_provider, mime_type, file_size, uploaded_by)
  values (p_version, p_document, d.project_id, n, p_label, coalesce(p_notes,''), stored_path, 'google_drive', p_mime, p_size, auth.uid());
  update documents set current_version_id = p_version, last_modified_by = auth.uid() where id = p_document;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (d.project_id, auth.uid(), 'document_version_created', 'document', p_document,
    'uploaded version ' || n || ' of ' || d.name);
  return n;
end $$;

create or replace function get_project_storage_usage(p_project uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare used_bytes bigint;
begin
  if not is_project_member(p_project) then raise exception 'Not a member of this project'; end if;
  select coalesce(sum(file_size), 0) into used_bytes from document_versions where project_id = p_project;
  return used_bytes;
end $$;

revoke all on function register_drive_document(uuid,uuid,uuid,uuid,text,text,text,bigint,text,text),
  add_drive_document_version(uuid,uuid,text,text,bigint,text,text),
  get_project_storage_usage(uuid) from public, anon;
grant execute on function register_drive_document(uuid,uuid,uuid,uuid,text,text,text,bigint,text,text),
  add_drive_document_version(uuid,uuid,text,text,bigint,text,text),
  get_project_storage_usage(uuid) to authenticated;
