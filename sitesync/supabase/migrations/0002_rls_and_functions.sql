-- Row Level Security, privileged RPCs and storage policies.

-- ---------- lock down default grants ----------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table project_invitations enable row level security;
alter table folders enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table tasks enable row level security;
alter table task_documents enable row level security;
alter table task_comments enable row level security;
alter table drawing_annotations enable row level security;
alter table annotation_replies enable row level security;
alter table discussion_messages enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

create or replace function shares_project_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members a join project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;
revoke all on function shares_project_with(uuid) from public;
grant execute on function shares_project_with(uuid) to authenticated;

-- ---------- profiles ----------
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or shares_project_with(id));
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (full_name, avatar_url) on profiles to authenticated;

-- ---------- projects (creation only through create_project RPC) ----------
create policy projects_select on projects for select to authenticated using (is_project_member(id));
create policy projects_update on projects for update to authenticated
  using (is_project_owner(id)) with check (is_project_owner(id));
create policy projects_delete on projects for delete to authenticated using (is_project_owner(id));
revoke update on projects from authenticated;
grant update (name, code, description, status, start_date, target_completion_date, cover_image_path) on projects to authenticated;

-- ---------- membership (no direct insert/update; owner may remove members; members may leave) ----------
create policy members_select on project_members for select to authenticated using (is_project_member(project_id));
create policy members_delete on project_members for delete to authenticated
  using (role = 'member' and (is_project_owner(project_id) or user_id = auth.uid()));
revoke insert, update on project_members from authenticated;

-- ---------- invitations (owner only; invitee uses accept_invitation RPC) ----------
create policy invites_select on project_invitations for select to authenticated using (is_project_owner(project_id));
create policy invites_insert on project_invitations for insert to authenticated
  with check (is_project_owner(project_id) and invited_by = auth.uid() and status = 'pending');
create policy invites_update on project_invitations for update to authenticated
  using (is_project_owner(project_id)) with check (is_project_owner(project_id));
revoke update on project_invitations from authenticated;
grant update (status) on project_invitations to authenticated;

-- ---------- folders / documents / versions ----------
create policy folders_select on folders for select to authenticated using (is_project_member(project_id));
create policy folders_insert on folders for insert to authenticated
  with check (is_project_member(project_id) and created_by = auth.uid());
create policy folders_update on folders for update to authenticated
  using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy folders_delete on folders for delete to authenticated
  using (is_project_owner(project_id) or created_by = auth.uid());

create policy documents_select on documents for select to authenticated using (is_project_member(project_id));
create policy documents_insert on documents for insert to authenticated
  with check (is_project_member(project_id) and uploaded_by = auth.uid() and last_modified_by = auth.uid());
create policy documents_update on documents for update to authenticated
  using (is_project_member(project_id))
  with check (is_project_member(project_id) and last_modified_by = auth.uid());
create policy documents_delete on documents for delete to authenticated
  using (is_project_owner(project_id) or uploaded_by = auth.uid());

create policy versions_select on document_versions for select to authenticated using (is_project_member(project_id));
create policy versions_insert on document_versions for insert to authenticated
  with check (is_project_member(project_id) and uploaded_by = auth.uid());
-- no update / delete policies: versions are append-only (cascade from documents still works)

-- ---------- tasks ----------
create policy tasks_select on tasks for select to authenticated using (is_project_member(project_id));
create policy tasks_insert on tasks for insert to authenticated
  with check (is_project_member(project_id) and created_by = auth.uid()
    and (assignee_id is null or is_user_in_project(project_id, assignee_id)));
create policy tasks_update on tasks for update to authenticated
  using (is_project_member(project_id))
  with check (is_project_member(project_id) and (assignee_id is null or is_user_in_project(project_id, assignee_id)));
create policy tasks_delete on tasks for delete to authenticated
  using (is_project_owner(project_id) or created_by = auth.uid());

create policy task_docs_all on task_documents for all to authenticated
  using (is_project_member(project_id)) with check (is_project_member(project_id));

create policy task_comments_select on task_comments for select to authenticated using (is_project_member(project_id));
create policy task_comments_insert on task_comments for insert to authenticated
  with check (is_project_member(project_id) and author_id = auth.uid());
create policy task_comments_delete on task_comments for delete to authenticated using (author_id = auth.uid());

-- ---------- annotations ----------
create policy annotations_select on drawing_annotations for select to authenticated using (is_project_member(project_id));
create policy annotations_insert on drawing_annotations for insert to authenticated
  with check (is_project_member(project_id) and author_id = auth.uid());
create policy annotations_update on drawing_annotations for update to authenticated
  using (is_project_member(project_id)) with check (is_project_member(project_id));
create policy annotations_delete on drawing_annotations for delete to authenticated using (author_id = auth.uid());

-- Non-authors may resolve/reopen, but not rewrite someone else's markup.
create or replace function restrict_annotation_edits() returns trigger language plpgsql as $$
begin
  if auth.uid() is distinct from old.author_id and
     (new.body, new.coordinates, new.type, new.page_number, new.version_id, new.author_id)
       is distinct from (old.body, old.coordinates, old.type, old.page_number, old.version_id, old.author_id) then
    raise exception 'Only the author can edit an annotation';
  end if;
  if new.resolved and not old.resolved then new.resolved_by = auth.uid(); new.resolved_at = now(); end if;
  if not new.resolved then new.resolved_by = null; new.resolved_at = null; end if;
  return new;
end $$;
create trigger annotations_guard before update on drawing_annotations for each row execute function restrict_annotation_edits();

create policy replies_select on annotation_replies for select to authenticated using (is_project_member(project_id));
create policy replies_insert on annotation_replies for insert to authenticated
  with check (is_project_member(project_id) and author_id = auth.uid());
create policy replies_delete on annotation_replies for delete to authenticated using (author_id = auth.uid());

-- ---------- discussions ----------
create policy discussion_select on discussion_messages for select to authenticated using (is_project_member(project_id));
create policy discussion_insert on discussion_messages for insert to authenticated
  with check (is_project_member(project_id) and author_id = auth.uid());
create policy discussion_delete on discussion_messages for delete to authenticated using (author_id = auth.uid());

-- ---------- notifications ----------
create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated
  with check (is_project_member(project_id) and is_user_in_project(project_id, user_id));
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;

-- ---------- activity log: append-only for users ----------
create policy activity_select on activity_logs for select to authenticated using (is_project_member(project_id));
create policy activity_insert on activity_logs for insert to authenticated
  with check (is_project_member(project_id) and user_id = auth.uid());
revoke update, delete on activity_logs from authenticated;

-- ======================================================================
-- Privileged RPCs (single transaction each)
-- ======================================================================
create or replace function create_project(
  p_name text, p_code text, p_description text default '',
  p_start_date date default null, p_target_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into projects (name, code, description, start_date, target_completion_date, created_by)
  values (trim(p_name), trim(p_code), coalesce(p_description,''), p_start_date, p_target_date, auth.uid())
  returning id into pid;
  insert into project_members (project_id, user_id, role) values (pid, auth.uid(), 'owner');
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (pid, auth.uid(), 'project_created', 'project', pid, 'Created project ' || trim(p_name));
  return pid;
end $$;

create or replace function accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv project_invitations%rowtype; my_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select lower(email) into my_email from auth.users where id = auth.uid();
  select * into inv from project_invitations
   where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'This invitation is invalid or has expired';
  end if;
  if inv.email <> my_email then
    raise exception 'This invitation was sent to a different email address';
  end if;
  insert into project_members (project_id, user_id, role) values (inv.project_id, auth.uid(), 'member')
  on conflict do nothing;
  update project_invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary)
  values (inv.project_id, auth.uid(), 'member_joined', 'project', inv.project_id, 'Joined the project');
  return inv.project_id;
end $$;

revoke all on function create_project(text,text,text,date,date), accept_invitation(text) from public, anon;
grant execute on function create_project(text,text,text,date,date), accept_invitation(text) to authenticated;

-- ======================================================================
-- Storage: private bucket, path convention  <project_id>/<document_id>/<version_id>/<file>
-- ======================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function storage_project_id(object_name text) returns uuid
language plpgsql immutable as $$
begin return split_part(object_name,'/',1)::uuid;
exception when others then return null; end $$;

create policy "project files read" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and is_project_member(storage_project_id(name)));
create policy "project files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and is_project_member(storage_project_id(name)));
create policy "project files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (is_project_owner(storage_project_id(name)) or owner_id = auth.uid()::text));
-- No update policy: objects are never overwritten; new versions get new paths.
