-- Assertion-based security tests. Any failed assertion aborts with a non-zero exit.
-- Users: 1 = Alice (owner), 2 = Bob (invited member), 3 = Carol (outsider).
\set ON_ERROR_STOP on

create schema t;
grant usage on schema t to authenticated;
create table t.ctx (k text primary key, v text);
grant select, insert on t.ctx to authenticated;

create function t.uid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-00000000000' || n)::uuid $$;
create function t.login(n int) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', t.uid(n)::text, false); end $$;
create function t.pid() returns uuid language sql stable as $$ select v::uuid from t.ctx where k = 'pid' $$;
create function t.fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create function t.rows(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
-- true when the statement errors OR changes nothing (what RLS does to UPDATE/DELETE)
create function t.blocked(q text) returns boolean language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n = 0; exception when others then return true; end $$;
create function t.count(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute 'select count(*) from (' || q || ') s' into n; return n; end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$ begin if cond is not true then raise exception 'FAILED: %', msg; end if; end $$;
grant execute on all functions in schema t to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (t.uid(1), 'alice@x.com', '{"full_name":"Alice"}'),
  (t.uid(2), 'bob@x.com',   '{"full_name":"Bob"}'),
  (t.uid(3), 'carol@x.com', '{"full_name":"Carol"}');

-- ===== projects & invitations =====
do $$ declare pid uuid; begin
  execute 'set role authenticated'; perform t.login(1);
  pid := create_project('Bridge', 'BRG-1');
  insert into t.ctx values ('pid', pid::text);
  perform t.ok(t.count('select 1 from projects') = 1, 'owner sees own project');
  perform t.ok(t.fails($q$ insert into projects(name,code,created_by) values ('x','xx',t.uid(1)) $q$), 'projects cannot be inserted directly');

  perform t.ok(t.rows(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'bob@x.com',encode(sha256(convert_to('tok1','UTF8')),'hex'),t.uid(1)) $q$, pid)) = 1, 'owner can invite');
  perform t.ok(t.fails(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'bob@x.com','h-dup',t.uid(1)) $q$, pid)), 'only one pending invite per email');

  perform t.login(3);
  perform t.ok(t.fails($q$ select accept_invitation('tok1') $q$), 'wrong email cannot accept invitation');
  perform t.ok(t.count('select 1 from projects') = 0, 'outsider sees no projects');
  perform t.ok(t.fails(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'c@x.com','h3',t.uid(3)) $q$, pid)), 'outsider cannot invite');

  perform t.login(2);
  perform t.ok(t.count('select 1 from projects') = 0, 'invitee has no access before accepting');
  perform t.ok(t.fails($q$ select accept_invitation('not-the-token') $q$), 'unknown token rejected');
  perform t.ok((select accept_invitation('tok1')) = pid, 'invitee accepts');
  perform t.ok(t.fails($q$ select accept_invitation('tok1') $q$), 'token is single-use');
  perform t.ok(t.count('select 1 from projects') = 1, 'member sees project after joining');
  perform t.ok(t.count('select 1 from project_invitations') = 0, 'non-owner cannot read invitations');
  perform t.ok(t.fails(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'x@x.com','h4',t.uid(2)) $q$, pid)), 'member cannot invite');
  perform t.ok(t.fails(format($q$ insert into project_members(project_id,user_id,role) values (%L,t.uid(3),'member') $q$, pid)), 'members cannot be added directly');
  perform t.ok(t.fails(format($q$ update project_members set role='owner' where user_id=t.uid(2) $q$)), 'role cannot be changed');
  perform t.ok(t.blocked($q$ delete from project_members where role = 'owner' $q$), 'owner membership cannot be removed by a member');
  perform t.ok(t.blocked($q$ update projects set name = 'hacked' $q$), 'member cannot edit project settings');

  perform t.login(1);
  perform t.ok(t.rows(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'dan@x.com','h5',t.uid(1)) $q$, pid)) = 1, 'second invite');
  perform t.ok(t.fails($q$ update project_invitations set status='accepted' where email='dan@x.com' $q$), 'owner cannot mark invite accepted');
  perform t.ok(t.rows($q$ update project_invitations set status='revoked' where email='dan@x.com' $q$) = 1, 'owner can revoke');
  perform t.ok(t.blocked($q$ update project_invitations set status='revoked' where email='dan@x.com' $q$), 'revoked invite cannot be edited again');
  -- rate limit: 2 invitations exist so far; 8 more reach the cap of 10, the next one fails
  for i in 1..8 loop execute format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,%L,%L,t.uid(1)) $q$, pid, 'u'||i||'@x.com', 'hh'||i); end loop;
  perform t.ok(t.fails(format($q$ insert into project_invitations(project_id,email,token_hash,invited_by) values (%L,'over@x.com','hover',t.uid(1)) $q$, pid)), 'invitation rate limit');
  perform t.ok(t.rows($q$ update projects set status='active' $q$) = 1, 'owner can edit project settings');
  perform t.ok(t.blocked(format($q$ delete from project_members where user_id = t.uid(1) $q$)), 'owner row cannot be removed (role = owner)');
end $$;

-- ===== profiles =====
do $$ begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(3);
  perform t.ok(t.count('select 1 from profiles') = 1, 'outsider sees only their own profile');
  perform t.login(2);
  perform t.ok(t.count('select 1 from profiles') = 2, 'member sees co-member profile');
  perform t.ok(t.rows($q$ update profiles set full_name = 'Bobby' where id = t.uid(2) $q$) = 1, 'user edits own name');
  perform t.ok(t.fails($q$ update profiles set email = 'x@y.z' where id = t.uid(2) $q$), 'email column is not editable');
  perform t.ok(t.blocked($q$ update profiles set full_name = 'x' where id = t.uid(1) $q$), 'cannot edit someone else''s profile');
  perform t.ok(t.rows($q$ update profiles set full_name = 'Bob' where id = t.uid(2) $q$) = 1, 'restore name');
end $$;

-- ===== documents, versions, storage =====
do $$ declare pid uuid := t.pid(); d text := '00000000-0000-0000-0000-0000000000d1'; v1 text := '00000000-0000-0000-0000-0000000000a1'; v2 text := '00000000-0000-0000-0000-0000000000a2'; v3 text := '00000000-0000-0000-0000-0000000000a3'; p1 text; p2 text; p3 text; begin
  execute 'reset role';
  p1 := pid||'/'||d||'/'||v1||'/plan.pdf'; p2 := pid||'/'||d||'/'||v2||'/plan.pdf'; p3 := pid||'/'||d||'/'||v3||'/plan.dwg';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('project-files', p1, t.uid(2)::text, '{"size":1000}'), ('project-files', p2, t.uid(1)::text, '{"size":2000}'), ('project-files', p3, t.uid(1)::text, '{"size":5}'),
    ('project-files', 'not-a-uuid/x', null, '{"size":1}');
  execute 'set role authenticated'; perform t.login(2);

  perform t.ok(t.fails(format($q$ insert into documents(id,project_id,name,extension,uploaded_by,last_modified_by) values (gen_random_uuid(),%L,'a.pdf','pdf',t.uid(2),t.uid(2)) $q$, pid)), 'documents cannot be inserted directly');
  perform t.ok(t.fails(format($q$ select register_document(%L,null,gen_random_uuid(),gen_random_uuid(),'x.pdf','other/x.pdf','application/pdf',1) $q$, pid)), 'path must match project/document/version');
  perform t.ok(t.fails(format($q$ select register_document(%L,null,%L,%L,'plan.pdf',%L,'application/pdf',999) $q$, pid, d, v1, p1)), 'declared size must match storage');
  perform t.ok(t.fails(format($q$ select register_document(%L,null,%L,%L,'x.pdf',%L,'application/pdf',1) $q$, pid, d, '00000000-0000-0000-0000-0000000000ff', pid||'/'||d||'/00000000-0000-0000-0000-0000000000ff/x.pdf')), 'object must exist in storage');
  perform t.ok(t.fails(format($q$ select register_document(%L,null,gen_random_uuid(),gen_random_uuid(),'x.pdf',%L,'application/pdf',200000000) $q$, pid, pid||'/a/b/x.pdf')), 'oversized file rejected');
  perform t.ok(t.fails(format($q$ select register_document(%L,null,%L,%L,'plan.exe',%L,'application/pdf',1000) $q$, pid, d, v1, p1)), 'unsupported extension rejected');
  perform t.ok((select register_document(pid, null, d::uuid, v1::uuid, 'plan.pdf', p1, 'application/pdf', 1000)) = d::uuid, 'valid upload registers');

  perform t.login(3);
  perform t.ok(t.fails(format($q$ select register_document(%L,null,gen_random_uuid(),gen_random_uuid(),'x.pdf',%L,'application/pdf',1) $q$, pid, pid||'/a/b/x.pdf')), 'outsider cannot register a document');
  perform t.ok(t.count('select 1 from documents') = 0 and t.count('select 1 from document_versions') = 0, 'outsider sees no documents or versions');
  perform t.ok(t.count($q$ select 1 from storage.objects where bucket_id = 'project-files' $q$) = 0, 'outsider sees no storage objects');
  perform t.ok(t.fails(format($q$ insert into storage.objects(bucket_id,name,owner_id) values ('project-files',%L,%L) $q$, pid||'/evil.pdf', t.uid(3)::text)), 'outsider cannot upload into project storage');

  perform t.login(1);
  perform t.ok((select add_document_version(d::uuid, v2::uuid, p2, 'application/pdf', 2000, 'Rev 02', 'moved column')) = 2, 'version 2 created');
  perform t.ok(t.fails(format($q$ select add_document_version(%L,%L,%L,'application/octet-stream',5) $q$, d, v3, p3)), 'new version must keep the extension');
  perform t.login(2);
  perform t.ok(t.fails(format($q$ select add_document_version(%L,%L,%L,'application/pdf',2000) $q$, d, v2, p2)), 'cannot claim another user''s uploaded object / reuse a version path');
  perform t.ok(t.count($q$ select 1 from storage.objects where bucket_id = 'project-files' $q$) = 4 - 1, 'member sees project objects but not malformed-path object');

  perform restore_document_version(d::uuid, v1::uuid);
  perform t.ok((select version_number from document_versions where id = (select current_version_id from documents where id = d::uuid)) = 1, 'restore points back to v1');
  perform t.ok(t.count(format($q$ select 1 from document_versions where document_id = %L $q$, d)) = 2, 'restore keeps all versions');
  perform t.ok(t.blocked($q$ update document_versions set revision_notes = 'tampered' $q$), 'versions cannot be updated');
  perform t.ok(t.blocked($q$ delete from document_versions $q$), 'versions cannot be deleted directly');
  perform t.ok(t.fails(format($q$ update documents set current_version_id = %L $q$, v2)), 'current_version_id is RPC-only');
  perform t.ok(t.fails($q$ update documents set uploaded_by = t.uid(2) $q$), 'ownership columns are not editable');
  perform t.ok(t.fails($q$ update documents set name = 'plan.exe', last_modified_by = t.uid(2) $q$), 'rename must keep extension');
  perform t.ok(t.rows($q$ update documents set name = 'plan-2.pdf', last_modified_by = t.uid(2) $q$) = 1, 'valid rename');
  perform t.login(3);
  perform t.ok(t.fails(format($q$ select restore_document_version(%L,%L) $q$, d, v2)), 'outsider cannot restore');
end $$;

-- ===== tasks, notifications, deadline reminders =====
do $$ declare pid uuid := t.pid(); tid uuid := '11111111-1111-1111-1111-111111111111'; begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(1);
  perform t.ok(t.rows(format($q$ insert into tasks(id,project_id,title,created_by,assignee_id,due_date) values (%L,%L,'Check rebar',t.uid(1),t.uid(2),current_date+1) $q$, tid, pid)) = 1, 'owner creates task for member');
  perform t.ok(t.fails(format($q$ insert into tasks(project_id,title,created_by,assignee_id) values (%L,'Bad',t.uid(1),t.uid(3)) $q$, pid)), 'cannot assign to a non-member');
  perform t.ok(t.fails(format($q$ insert into tasks(project_id,title,created_by) values (%L,'Forged',t.uid(2)) $q$, pid)), 'cannot create a task as someone else');

  perform t.login(2);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'task_assigned' $q$) = 1, 'assignee notified');
  perform t.ok(t.rows(format($q$ update tasks set status = 'in_progress' where id = %L $q$, tid)) = 1, 'member updates status');
  perform t.ok(t.fails($q$ update tasks set created_by = t.uid(2) $q$), 'task creator is immutable');
  perform t.ok(t.fails($q$ update tasks set project_id = gen_random_uuid() $q$), 'task project is immutable');
  perform t.ok(t.count($q$ select 1 from notifications where type = 'task_status_changed' $q$) = 0, 'actor is not notified of own change');
  perform t.ok(t.fails(format($q$ insert into notifications(user_id,project_id,type,related_table,related_id,message,link) values (t.uid(1),%L,'mention','x',gen_random_uuid(),'phish','https://evil.example') $q$, pid)), 'clients cannot write notifications');
  perform t.ok((select notify_due_tasks()) = 1, 'deadline reminder created');
  perform t.ok((select notify_due_tasks()) = 0, 'deadline reminder is not repeated within 24h');
  perform t.ok(t.rows($q$ update notifications set read_at = now() where type = 'task_assigned' $q$) = 1, 'mark own notification read');
  perform t.ok(t.fails($q$ update notifications set message = 'x' $q$), 'only read_at is editable');
  perform t.ok(t.blocked($q$ update notifications set read_at = now() where user_id = t.uid(1) $q$), 'cannot touch another user''s notifications');

  perform t.login(1);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'task_status_changed' $q$) = 1, 'creator notified of status change');
  perform t.login(3);
  perform t.ok(t.count('select 1 from tasks') = 0 and t.count('select 1 from notifications') = 0, 'outsider sees no tasks or notifications');
  perform t.ok(t.fails(format($q$ insert into task_comments(task_id,project_id,author_id,body) values (%L,%L,t.uid(3),'hi') $q$, tid, pid)), 'outsider cannot comment on a task');
end $$;

-- scheduled reminders (run by the database itself, no user session)
do $$ declare pid uuid := t.pid(); n int; begin
  execute 'reset role';
  insert into tasks(project_id, title, created_by, assignee_id, due_date) values (pid, 'Overdue survey', t.uid(2), t.uid(1), current_date - 3);
  n := notify_all_due_tasks();
  perform t.ok(n = 1, 'scheduled run notifies the assignee of the overdue task (got ' || n || ')');
  perform t.ok(notify_all_due_tasks() = 0, 'scheduled run is idempotent within 24h');
  perform t.ok((select count(*) from notifications where user_id = t.uid(1) and type = 'task_deadline' and message like 'Overdue: %') = 1, 'overdue wording');
  execute 'set role authenticated'; perform t.login(1);
  perform t.ok(t.fails('select notify_all_due_tasks()'), 'clients cannot trigger the all-users job');
  perform t.ok(t.fails('select create_due_notifications(null)'), 'clients cannot call the shared helper');
end $$;

-- ===== drawing markups =====
do $$ declare pid uuid := t.pid(); d text := '00000000-0000-0000-0000-0000000000d1'; v1 text := '00000000-0000-0000-0000-0000000000a1'; a text := '22222222-2222-2222-2222-222222222222'; begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(2);
  perform t.ok(t.rows(format($q$ insert into drawing_annotations(id,project_id,document_id,version_id,author_id,type,coordinates,body) values (%L,%L,%L,%L,t.uid(2),'rectangle','{"x":0.1,"y":0.1,"w":0.2,"h":0.1}','check') $q$, a, pid, d, v1)) = 1, 'valid markup saved');
  perform t.ok(t.fails(format($q$ insert into drawing_annotations(project_id,document_id,version_id,author_id,type,coordinates) values (%L,%L,%L,t.uid(2),'pin','{"x":1.5,"y":0.1}') $q$, pid, d, v1)), 'out-of-range coordinates rejected');
  perform t.ok(t.fails(format($q$ insert into drawing_annotations(project_id,document_id,version_id,author_id,type,coordinates) values (%L,%L,%L,t.uid(2),'arrow','{"x":0.1,"y":0.1}') $q$, pid, d, v1)), 'wrong coordinate keys rejected');
  perform t.ok(t.fails(format($q$ insert into drawing_annotations(project_id,document_id,version_id,author_id,type,coordinates,body) values (%L,%L,%L,t.uid(2),'text','{"x":0.1,"y":0.1}','  ') $q$, pid, d, v1)), 'blank text note rejected');
  perform t.ok(t.fails(format($q$ insert into drawing_annotations(project_id,document_id,version_id,author_id,type,coordinates) values (%L,%L,gen_random_uuid(),t.uid(2),'pin','{"x":0.1,"y":0.1}') $q$, pid, d)), 'version must belong to the document and project');
  perform t.ok(t.fails(format($q$ insert into drawing_annotations(project_id,document_id,version_id,author_id,type,coordinates) values (gen_random_uuid(),%L,%L,t.uid(2),'pin','{"x":0.1,"y":0.1}') $q$, d, v1)), 'project must match the version''s project');
  perform t.login(1);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'drawing_comment' $q$) = 1, 'other member notified of markup');
  perform t.ok(t.fails($q$ update drawing_annotations set body = 'tampered' $q$), 'cannot rewrite someone else''s markup');
  perform t.ok(t.rows($q$ update drawing_annotations set resolved = true $q$) = 1, 'any member can resolve');
  perform t.ok((select resolved_by from drawing_annotations) = t.uid(1), 'resolver recorded by the database');
  perform t.ok(t.rows(format($q$ insert into annotation_replies(annotation_id,project_id,author_id,body) values (%L,%L,t.uid(1),'done') $q$, a, pid)) = 1, 'reply saved');
  perform t.login(2);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'drawing_comment' $q$) = 1, 'author notified of reply');
  perform t.login(3);
  perform t.ok(t.count('select 1 from drawing_annotations') = 0 and t.count('select 1 from annotation_replies') = 0, 'outsider sees no markups');
end $$;

-- ===== discussions, folders, project settings =====
do $$ declare pid uuid := t.pid(); m uuid := '33333333-3333-3333-3333-333333333333'; begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(1);
  perform t.ok(t.rows(format($q$ insert into discussion_messages(id,project_id,author_id,body) values (%L,%L,t.uid(1),'Kickoff @Bob please review') $q$, m, pid)) = 1, 'message posted');
  perform t.ok(t.fails(format($q$ insert into discussion_messages(project_id,author_id,body) values (%L,t.uid(2),'forged') $q$, pid)), 'cannot post as someone else');
  perform t.login(2);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'mention' $q$) = 1, '@mention notifies the named member');
  perform t.ok(t.rows(format($q$ insert into discussion_messages(project_id,author_id,parent_id,body) values (%L,t.uid(2),%L,'will do') $q$, pid, m)) = 1, 'reply posted');
  perform t.ok(t.blocked(format($q$ delete from discussion_messages where id = %L $q$, m)), 'cannot delete another member''s message');
  perform t.ok(t.rows(format($q$ insert into folders(project_id,name,created_by) values (%L,'Structural',t.uid(2)) $q$, pid)) = 1, 'folder created');
  perform t.ok(t.fails(format($q$ insert into folders(project_id,name,created_by) values (%L,'structural',t.uid(2)) $q$, pid)), 'folder names are unique (case-insensitive)');
  perform t.login(1);
  perform t.ok(t.count($q$ select 1 from notifications where type = 'discussion_reply' $q$) = 1, 'reply notifies the parent author');
  perform t.login(3);
  perform t.ok(t.fails(format($q$ insert into discussion_messages(project_id,author_id,body) values (%L,t.uid(3),'hi') $q$, pid)), 'outsider cannot post');
  perform t.ok(t.count('select 1 from discussion_messages') = 0 and t.count('select 1 from folders') = 0, 'outsider sees no messages or folders');
end $$;

-- ===== activity log is append-only and trigger-written =====
do $$ declare pid uuid := t.pid(); act text; begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(1);
  perform t.ok(t.fails(format($q$ insert into activity_logs(project_id,user_id,action,object_type,summary) values (%L,t.uid(1),'forged','x','I never did this') $q$, pid)), 'clients cannot write activity');
  perform t.ok(t.fails($q$ update activity_logs set summary = 'edited' $q$), 'activity cannot be updated');
  perform t.ok(t.fails($q$ delete from activity_logs $q$), 'activity cannot be deleted');
  foreach act in array array['project_created','member_joined','document_uploaded','document_version_created','document_version_restored','task_created','task_assigned','task_status_changed','comment_added','annotation_resolved','message_posted','folder_created','project_updated'] loop
    perform t.ok(t.count(format($q$ select 1 from activity_logs where action = %L $q$, act)) >= 1, 'activity recorded: ' || act);
  end loop;
  perform t.login(3);
  perform t.ok(t.count('select 1 from activity_logs') = 0, 'outsider sees no activity');
end $$;

-- ===== email notification trigger =====
do $$ declare pid uuid := t.pid(); c0 bigint; n0 bigint; begin
  execute 'reset role';
  perform t.ok((select count(*) from net.calls) = 0, 'no email is attempted while unconfigured');
  insert into app_settings values ('email_webhook_url', 'https://app.example/api/email-webhook'), ('email_webhook_secret', 's3cret');
  execute 'set role authenticated'; perform t.login(1);
  insert into discussion_messages(project_id, author_id, body) values (pid, t.uid(1), 'Ping @Bob about the footing');
  execute 'reset role';
  perform t.ok((select count(*) from net.calls) = 1, 'one email request per notification');
  perform t.ok((select body->>'to' from net.calls) = 'bob@x.com' and (select body->>'type' from net.calls) = 'mention', 'email goes to the notified user only');
  perform t.ok((select headers->>'x-webhook-secret' from net.calls) = 's3cret' and (select url from net.calls) = 'https://app.example/api/email-webhook', 'request carries URL and secret');
  perform t.ok((select body->>'link' from net.calls) = '/projects/' || pid || '/discussions', 'link is relative');
  -- opt out
  execute 'set role authenticated'; perform t.login(2);
  perform t.ok(t.rows($q$ update profiles set email_notifications = false where id = t.uid(2) $q$) = 1, 'user can opt out of email');
  perform t.login(1);
  insert into discussion_messages(project_id, author_id, body) values (pid, t.uid(1), 'Another @Bob ping');
  execute 'reset role';
  perform t.ok((select count(*) from net.calls) = 1, 'opted-out user gets no email');
  update profiles set email_notifications = true where id = t.uid(2);
  -- delivery failure must not block the in-app notification
  select count(*) into n0 from notifications where user_id = t.uid(2);
  perform set_config('test.net_fail', '1', false);
  execute 'set role authenticated'; perform t.login(1);
  insert into discussion_messages(project_id, author_id, body) values (pid, t.uid(1), 'Third @Bob ping');
  execute 'reset role';
  perform set_config('test.net_fail', '0', false);
  perform t.ok((select count(*) from notifications where user_id = t.uid(2)) = n0 + 1, 'in-app notification still created when email delivery fails');
  -- clients cannot see or change the configuration
  execute 'set role authenticated'; perform t.login(2);
  perform t.ok(t.fails('select * from app_settings'), 'clients cannot read app_settings');
  perform t.ok(t.fails($q$ update app_settings set value = 'https://evil.example' $q$), 'clients cannot modify app_settings');
  perform t.ok(t.fails($q$ update profiles set email = 'x@y.z' $q$), 'email address column stays read-only');
  execute 'reset role'; delete from app_settings;
end $$;

-- ===== avatars bucket =====
do $$ begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(1);
  perform t.ok(t.rows(format($q$ insert into storage.objects(bucket_id,name,owner_id) values ('avatars',%L,%L) $q$, t.uid(1)::text||'/a.png', t.uid(1)::text)) = 1, 'user uploads own avatar');
  perform t.ok(t.fails(format($q$ insert into storage.objects(bucket_id,name,owner_id) values ('avatars',%L,%L) $q$, t.uid(2)::text||'/a.png', t.uid(1)::text)), 'cannot upload into another user''s avatar folder');
  perform t.login(2);
  perform t.ok(t.count($q$ select 1 from storage.objects where bucket_id = 'avatars' $q$) = 1, 'co-member can read avatar');
  perform t.login(3);
  perform t.ok(t.count($q$ select 1 from storage.objects where bucket_id = 'avatars' $q$) = 0, 'stranger cannot read avatar');
end $$;

-- ===== deletion permissions, then a final sweep: an outsider sees nothing anywhere =====
do $$ declare r record; n bigint; begin
  execute 'reset role'; execute 'set role authenticated'; perform t.login(3);
  perform t.ok(t.blocked('delete from documents'), 'outsider cannot delete documents');
  perform t.login(2);
  perform t.ok(t.rows($q$ delete from documents $q$) = 1, 'uploader can delete own document');
  perform t.ok(t.count('select 1 from document_versions') = 0, 'versions cascade with their document');
  perform t.login(3);
  for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'app_settings' loop
    execute format('select count(*) from %I', r.tablename) into n;
    perform t.ok(n = case when r.tablename = 'profiles' then 1 else 0 end, 'outsider sees rows in ' || r.tablename);
  end loop;
end $$;

\echo ALL SECURITY TESTS PASSED
