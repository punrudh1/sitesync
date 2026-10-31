-- Phase 3: notifications, activity triggers, annotation validation, realtime.
alter type notification_type add value if not exists 'mention';
alter table notifications add column if not exists link text;

-- Column-level grants so members cannot rewrite ownership fields.
revoke update on tasks from authenticated;
grant update (title, description, assignee_id, priority, status, start_date, due_date) on tasks to authenticated;
revoke update on drawing_annotations from authenticated;
grant update (body, coordinates, resolved) on drawing_annotations to authenticated;

-- ---------- annotation geometry validation (all coordinates normalised to 0..1) ----------
create or replace function annotation_coords_valid(t annotation_type, c jsonb) returns boolean
language plpgsql immutable as $$
declare k text; keys text[];
begin
  if jsonb_typeof(c) is distinct from 'object' then return false; end if;
  keys := case when t in ('pin','text') then array['x','y']
               when t in ('rectangle','cloud') then array['x','y','w','h']
               else array['x1','y1','x2','y2'] end;
  foreach k in array keys loop
    if coalesce(jsonb_typeof(c->k),'') <> 'number' or (c->>k)::numeric < 0 or (c->>k)::numeric > 1 then return false; end if;
  end loop;
  return true;
end $$;
alter table drawing_annotations add constraint annotation_coords_valid_chk check (annotation_coords_valid(type, coordinates));
alter table drawing_annotations add constraint annotation_text_body_chk check (type <> 'text' or char_length(btrim(body)) > 0);

-- ---------- helpers (not callable by clients) ----------
create or replace function notify_user(p_user uuid, p_project uuid, p_type notification_type, p_table text, p_id uuid, p_msg text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, project_id, type, related_table, related_id, message, link)
  select p_user, p_project, p_type, p_table, p_id, p_msg, p_link
  where p_user is not null and exists (select 1 from project_members where project_id = p_project and user_id = p_user)
$$;
create or replace function notify_others(p_actor uuid, p_project uuid, p_type notification_type, p_table text, p_id uuid, p_msg text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, project_id, type, related_table, related_id, message, link)
  select user_id, p_project, p_type, p_table, p_id, p_msg, p_link from project_members
  where project_id = p_project and user_id <> p_actor
$$;
create or replace function log_activity(p_project uuid, p_user uuid, p_action text, p_type text, p_id uuid, p_summary text)
returns void language sql security definer set search_path = public as $$
  insert into activity_logs (project_id, user_id, action, object_type, object_id, summary) values (p_project, p_user, p_action, p_type, p_id, p_summary)
$$;
create or replace function display_name(p_user uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name,''), email) from profiles where id = p_user
$$;
revoke all on function notify_user(uuid,uuid,notification_type,text,uuid,text,text), notify_others(uuid,uuid,notification_type,text,uuid,text,text),
  log_activity(uuid,uuid,text,text,uuid,text), display_name(uuid) from public, anon, authenticated;

-- ---------- tasks ----------
create or replace function trg_task_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.project_id, new.created_by, 'task_created', 'task', new.id, 'created task "' || new.title || '"');
  if new.assignee_id is not null then
    perform log_activity(new.project_id, new.created_by, 'task_assigned', 'task', new.id, 'assigned "' || new.title || '" to ' || display_name(new.assignee_id));
    if new.assignee_id <> new.created_by then
      perform notify_user(new.assignee_id, new.project_id, 'task_assigned', 'tasks', new.id,
        display_name(new.created_by) || ' assigned you "' || new.title || '"', '/projects/' || new.project_id || '/tasks/' || new.id);
    end if;
  end if;
  return new;
end $$;
create trigger tasks_after_insert after insert on tasks for each row execute function trg_task_insert();

create or replace function trg_task_update() returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    perform log_activity(new.project_id, actor, 'task_assigned', 'task', new.id, 'assigned "' || new.title || '" to ' || display_name(new.assignee_id));
    if new.assignee_id <> actor then
      perform notify_user(new.assignee_id, new.project_id, 'task_assigned', 'tasks', new.id,
        display_name(actor) || ' assigned you "' || new.title || '"', '/projects/' || new.project_id || '/tasks/' || new.id);
    end if;
  end if;
  if new.status is distinct from old.status then
    perform log_activity(new.project_id, actor, 'task_status_changed', 'task', new.id, 'moved "' || new.title || '" to ' || replace(new.status::text,'_',' '));
    if new.created_by <> actor then
      perform notify_user(new.created_by, new.project_id, 'task_status_changed', 'tasks', new.id,
        '"' || new.title || '" is now ' || replace(new.status::text,'_',' '), '/projects/' || new.project_id || '/tasks/' || new.id);
    end if;
  end if;
  return new;
end $$;
create trigger tasks_after_update after update on tasks for each row execute function trg_task_update();

create or replace function trg_task_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.project_id, new.author_id, 'comment_added', 'task', new.task_id, 'commented on a task');
  return new;
end $$;
create trigger task_comments_after_insert after insert on task_comments for each row execute function trg_task_comment();

-- ---------- documents ----------
create or replace function trg_version_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare dname text;
begin
  select name into dname from documents where id = new.document_id;
  if new.version_number = 1 then
    perform notify_others(new.uploaded_by, new.project_id, 'document_uploaded', 'documents', new.document_id,
      display_name(new.uploaded_by) || ' uploaded ' || dname, '/projects/' || new.project_id || '/documents/' || new.document_id);
  else
    perform notify_others(new.uploaded_by, new.project_id, 'document_version', 'documents', new.document_id,
      display_name(new.uploaded_by) || ' uploaded version ' || new.version_number || ' of ' || dname, '/projects/' || new.project_id || '/documents/' || new.document_id);
  end if;
  return new;
end $$;
create trigger versions_after_insert after insert on document_versions for each row execute function trg_version_notify();

-- ---------- drawing annotations ----------
create or replace function trg_annotation_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare dname text;
begin
  select name into dname from documents where id = new.document_id;
  perform log_activity(new.project_id, new.author_id, 'comment_added', 'annotation', new.id, 'added a ' || new.type || ' markup on ' || dname || ' (page ' || new.page_number || ')');
  perform notify_others(new.author_id, new.project_id, 'drawing_comment', 'drawing_annotations', new.id,
    display_name(new.author_id) || ' marked up ' || dname || ' (page ' || new.page_number || ')',
    '/projects/' || new.project_id || '/documents/' || new.document_id || '/view?v=' || new.version_id);
  return new;
end $$;
create trigger annotations_after_insert after insert on drawing_annotations for each row execute function trg_annotation_insert();

create or replace function trg_annotation_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resolved and not old.resolved then
    perform log_activity(new.project_id, coalesce(auth.uid(), new.author_id), 'annotation_resolved', 'annotation', new.id, 'resolved a markup comment');
  end if;
  return new;
end $$;
create trigger annotations_after_update after update on drawing_annotations for each row execute function trg_annotation_update();

create or replace function trg_reply_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare a drawing_annotations%rowtype;
begin
  select * into a from drawing_annotations where id = new.annotation_id;
  perform log_activity(new.project_id, new.author_id, 'comment_added', 'annotation', a.id, 'replied to a markup comment');
  if a.author_id <> new.author_id then
    perform notify_user(a.author_id, new.project_id, 'drawing_comment', 'drawing_annotations', a.id,
      display_name(new.author_id) || ' replied to your markup',
      '/projects/' || new.project_id || '/documents/' || a.document_id || '/view?v=' || a.version_id);
  end if;
  return new;
end $$;
create trigger replies_after_insert after insert on annotation_replies for each row execute function trg_reply_insert();

-- ---------- discussions ----------
create or replace function trg_message_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare parent_author uuid; r record;
begin
  perform log_activity(new.project_id, new.author_id, 'message_posted', 'discussion', new.id, 'posted in the discussion');
  if new.parent_id is not null then
    select author_id into parent_author from discussion_messages where id = new.parent_id;
    if parent_author <> new.author_id then
      perform notify_user(parent_author, new.project_id, 'discussion_reply', 'discussion_messages', new.id,
        display_name(new.author_id) || ' replied to your message', '/projects/' || new.project_id || '/discussions');
    end if;
  end if;
  for r in select pm.user_id from project_members pm join profiles p on p.id = pm.user_id
           where pm.project_id = new.project_id and pm.user_id <> new.author_id and p.full_name <> ''
             and position(lower('@' || p.full_name) in lower(new.body)) > 0
             and pm.user_id is distinct from parent_author loop
    perform notify_user(r.user_id, new.project_id, 'mention', 'discussion_messages', new.id,
      display_name(new.author_id) || ' mentioned you', '/projects/' || new.project_id || '/discussions');
  end loop;
  return new;
end $$;
create trigger messages_after_insert after insert on discussion_messages for each row execute function trg_message_insert();

-- ---------- project settings ----------
create or replace function trg_project_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.name, new.code, new.description, new.status, new.start_date, new.target_completion_date)
     is distinct from (old.name, old.code, old.description, old.status, old.start_date, old.target_completion_date) then
    perform log_activity(new.id, coalesce(auth.uid(), new.created_by), 'project_updated', 'project', new.id, 'updated the project settings');
  end if;
  return new;
end $$;
create trigger projects_after_update after update on projects for each row execute function trg_project_update();

-- ---------- deadline reminders ----------
-- There is no scheduler in plain Supabase; this runs when a member opens the app (once per task per 24 h).
create or replace function notify_due_tasks() returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  with ins as (
    insert into notifications (user_id, project_id, type, related_table, related_id, message, link)
    select t.assignee_id, t.project_id, 'task_deadline', 'tasks', t.id,
           case when t.due_date < current_date then 'Overdue: ' else 'Due ' || to_char(t.due_date, 'Mon DD') || ': ' end || t.title,
           '/projects/' || t.project_id || '/tasks/' || t.id
    from tasks t
    where t.assignee_id = auth.uid() and t.status <> 'completed' and t.due_date is not null and t.due_date <= current_date + 2
      and not exists (select 1 from notifications x where x.user_id = t.assignee_id and x.type = 'task_deadline'
                      and x.related_id = t.id and x.created_at > now() - interval '24 hours')
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function notify_due_tasks() from public, anon;
grant execute on function notify_due_tasks() to authenticated;

-- ---------- realtime (respects RLS) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table tasks, task_comments, discussion_messages, drawing_annotations,
      annotation_replies, notifications, activity_logs, documents, document_versions, folders;
  end if;
end $$;
