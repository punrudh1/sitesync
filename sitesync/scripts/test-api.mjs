// Runs the query shapes the app uses through a real PostgREST, as real (JWT-authenticated) users.
// Requires: PostgREST on POSTGREST_URL, a DB with stub + migrations, and DATABASE_URL (superuser, for seeding storage rows).
import { createHmac, createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { PostgrestClient } from '@supabase/postgrest-js';

const URL_ = process.env.POSTGREST_URL ?? 'http://localhost:3001';
const SECRET = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:pw@localhost:5432/api';
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (n) => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U(n), role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };
const as = (n) => new PostgrestClient(URL_, { headers: { Authorization: `Bearer ${jwt(n)}` } });
const [A, B, C] = [as(1), as(2), as(3)];

let failed = 0, passed = 0;
async function check(name, p, test = () => true) {
  const r = await p;
  let ok = false, why = '';
  try { ok = !r.error && test(r.data, r) !== false; why = r.error ? `${r.error.code} ${r.error.message}` : 'unexpected result'; } catch (e) { why = String(e); }
  ok ? passed++ : (failed++, console.log(`FAIL  ${name}: ${why}`));
  if (ok) console.log(`ok    ${name}`);
  return r.data;
}
async function expectError(name, p, codeOrText) {
  const r = await p;
  const ok = !!r.error && (!codeOrText || `${r.error.code} ${r.error.message}`.includes(codeOrText));
  ok ? (passed++, console.log(`ok    ${name} (rejected)`)) : (failed++, console.log(`FAIL  ${name}: expected an error${codeOrText ? ` containing "${codeOrText}"` : ''}, got ${JSON.stringify(r.error ?? r.data)?.slice(0, 120)}`));
}

const db = new pg.Client({ connectionString: DB }); await db.connect();
await db.query('truncate auth.users cascade; truncate storage.objects');
await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'alice@x.com','{"full_name":"Alice"}'),($2,'bob@x.com','{"full_name":"Bob"}'),($3,'carol@x.com','{"full_name":"Carol"}')`, [U(1), U(2), U(3)]);

// ---- project + invitation flow (rpc, insert, rpc)
const pid = (await check('rpc create_project', A.rpc('create_project', { p_name: 'Bridge', p_code: 'BRG-1', p_description: 'd', p_start_date: null, p_target_date: null }), (d) => typeof d === 'string'));
const token = 'tok-' + randomUUID();
await check('insert invitation', A.from('project_invitations').insert({ project_id: pid, email: 'bob@x.com', token_hash: createHash('sha256').update(token).digest('hex'), invited_by: U(1) }));
await expectError('outsider cannot accept', C.rpc('accept_invitation', { p_token: token }), 'different email');
await check('rpc accept_invitation', B.rpc('accept_invitation', { p_token: token }), (d) => d === pid);

// ---- shared selects (every page uses this embed)
await check('members + profiles embed', A.from('project_members').select('user_id, role, profiles(full_name, email)').eq('project_id', pid), (d) => d.length === 2 && d.some((m) => m.profiles?.full_name === 'Bob'));
await check('projects list/overview', B.from('projects').select('*').eq('id', pid).maybeSingle(), (d) => d?.name === 'Bridge');
await check('pending invites count (owner)', A.from('project_invitations').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('status', 'pending'), (_d, r) => r.count === 0);
await check('profile select', B.from('profiles').select('full_name, avatar_url').eq('id', U(2)).maybeSingle());
await check('home redirect query', B.from('project_members').select('project_id, joined_at').order('joined_at').limit(1), (d) => d.length === 1);

// ---- folders
await check('create folder', A.from('folders').insert({ project_id: pid, parent_id: null, name: 'Structural', created_by: U(1) }));
const folders = await check('folders list', A.from('folders').select('id, name, parent_id').eq('project_id', pid).order('name'), (d) => d.length === 1);
await check('rename folder .select(id)', A.from('folders').update({ name: 'Structure' }).eq('id', folders[0].id).eq('project_id', pid).select('id'), (d) => d.length === 1);
await expectError('duplicate folder name', A.from('folders').insert({ project_id: pid, parent_id: null, name: 'structure', created_by: U(1) }), '23505');

// ---- documents: seed storage rows like Supabase Storage would, then use the RPCs
const doc = randomUUID(), v1 = randomUUID(), v2 = randomUUID();
const p1 = `${pid}/${doc}/${v1}/plan.pdf`, p2 = `${pid}/${doc}/${v2}/plan.pdf`;
await db.query(`insert into storage.objects(bucket_id,name,owner_id,metadata) values ('project-files',$1,$3,'{"size":1000}'),('project-files',$2,$4,'{"size":2000}')`, [p1, p2, U(2), U(1)]);
await check('rpc register_document', B.rpc('register_document', { p_project: pid, p_folder: folders[0].id, p_document: doc, p_version: v1, p_name: 'plan.pdf', p_storage_path: p1, p_mime: 'application/pdf', p_size: 1000, p_label: 'Rev 01', p_notes: '' }));
await check('rpc add_document_version', A.rpc('add_document_version', { p_document: doc, p_version: v2, p_storage_path: p2, p_mime: 'application/pdf', p_size: 2000, p_label: 'Rev 02', p_notes: 'moved column' }), (d) => d === 2);
await check('documents list (folder + filters)', A.from('documents').select('id, name, extension, folder_id, status, uploaded_by, last_modified_by, current_version_id, updated_at, created_at').eq('project_id', pid).eq('folder_id', folders[0].id).ilike('name', '%pl\\_n%'.replace('\\_', '_')).eq('extension', 'pdf').eq('uploaded_by', U(2)).gte('updated_at', new Date(Date.now() - 86400000).toISOString()).limit(500), (d) => d.length === 1);
await check('documents root (is null)', A.from('documents').select('id').eq('project_id', pid).is('folder_id', null), (d) => d.length === 0);
const cur = (await A.from('documents').select('current_version_id').eq('id', doc).single()).data.current_version_id;
await check('current version sizes (in)', A.from('document_versions').select('id, file_size, version_number').in('id', [cur]), (d) => d[0].file_size === 2000);
await check('version history', A.from('document_versions').select('id, version_number, revision_label, revision_notes, mime_type, file_size, uploaded_by, created_at').eq('document_id', doc).order('version_number', { ascending: false }), (d) => d.length === 2);
await check('rpc restore_document_version', B.rpc('restore_document_version', { p_document: doc, p_version: v1 }));
await check('rename document', B.from('documents').update({ name: 'plan-rev.pdf', last_modified_by: U(2) }).eq('id', doc).eq('project_id', pid).select('id'), (d) => d.length === 1);
await check('move document to root', B.from('documents').update({ folder_id: null, last_modified_by: U(2) }).eq('id', doc).eq('project_id', pid).select('id'), (d) => d.length === 1);

// ---- download lookup: the ORIGINAL embed shape vs the fixed one
const dl = await B.from('document_versions').select('storage_path, documents(name)').eq('id', v1).eq('project_id', pid).maybeSingle();
console.log(`info  original download query (embed documents(name)): ${dl.error ? 'ERROR ' + dl.error.code + ' ' + dl.error.message : 'works'}`);
await check('download lookup (two queries)', (async () => {
  const v = await B.from('document_versions').select('storage_path, document_id').eq('id', v1).eq('project_id', pid).maybeSingle();
  if (v.error || !v.data) return v;
  return B.from('documents').select('name').eq('id', v.data.document_id).maybeSingle();
})(), (d) => d?.name === 'plan-rev.pdf');

// ---- tasks
const t = await check('create task .select.single', A.from('tasks').insert({ project_id: pid, title: 'Check rebar', description: '', assignee_id: U(2), priority: 'high', status: 'todo', start_date: null, due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), created_by: U(1) }).select('id').single());
await check('tasks list filters', A.from('tasks').select('id, title, status, priority, due_date, assignee_id').eq('project_id', pid).order('due_date', { ascending: true, nullsFirst: false }).limit(500).eq('priority', 'high').eq('status', 'todo').eq('assignee_id', U(2)), (d) => d.length === 1);
await check('tasks unassigned filter', A.from('tasks').select('id').eq('project_id', pid).is('assignee_id', null), (d) => d.length === 0);
await check('update status .select(id)', B.from('tasks').update({ status: 'in_progress' }).eq('id', t.id).eq('project_id', pid).select('id'), (d) => d.length === 1);
await check('task comment', B.from('task_comments').insert({ task_id: t.id, project_id: pid, author_id: U(2), body: 'on it' }));
await check('link document (upsert)', B.from('task_documents').upsert({ task_id: t.id, document_id: doc, project_id: pid }));
await check('task docs select', B.from('task_documents').select('document_id').eq('task_id', t.id), (d) => d.length === 1);
await check('unlink document', B.from('task_documents').delete().eq('task_id', t.id).eq('document_id', doc).eq('project_id', pid));
await check('rpc notify_due_tasks', B.rpc('notify_due_tasks'), (d) => d === 1);

// ---- annotations
const ann = await check('insert annotation', B.from('drawing_annotations').insert({ project_id: pid, document_id: doc, version_id: v1, page_number: 1, author_id: U(2), type: 'rectangle', coordinates: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, body: 'check this lintel' }).select('id').single());
await check('annotations for version', A.from('drawing_annotations').select('id, page_number, author_id, type, coordinates, body, resolved, created_at').eq('version_id', v1).order('created_at'), (d) => d.length === 1 && d[0].coordinates.w === 0.2);
await check('reply', A.from('annotation_replies').insert({ annotation_id: ann.id, project_id: pid, author_id: U(1), body: 'fixed' }));
await check('replies list', A.from('annotation_replies').select('id, annotation_id, author_id, body, created_at').eq('project_id', pid).order('created_at'), (d) => d.length === 1);
await check('resolve', A.from('drawing_annotations').update({ resolved: true }).eq('id', ann.id).eq('project_id', pid).select('id'), (d) => d.length === 1);
await expectError('invalid markup coordinates', B.from('drawing_annotations').insert({ project_id: pid, document_id: doc, version_id: v1, author_id: U(2), type: 'pin', coordinates: { x: 2, y: 0 } }), '23514');

// ---- discussions, notifications, activity
await check('post message', A.from('discussion_messages').insert({ project_id: pid, author_id: U(1), body: 'Kickoff @Bob please review', parent_id: null, document_id: doc }));
await check('messages list', B.from('discussion_messages').select('id, author_id, parent_id, body, document_id, created_at').eq('project_id', pid).order('created_at', { ascending: false }).limit(200), (d) => d.length === 1);
await check('notifications list + unread count', B.from('notifications').select('id, message, link, read_at, created_at').eq('user_id', U(2)).order('created_at', { ascending: false }).limit(15), (d) => d.length >= 4 && d.some((n) => n.link?.startsWith(`/projects/${pid}/`)));
await check('unread head count', B.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', U(2)).is('read_at', null), (_d, r) => r.count >= 4);
await check('mark all read', B.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', U(2)).is('read_at', null));
await check('activity feed', A.from('activity_logs').select('id, user_id, action, object_type, object_id, summary, created_at').eq('project_id', pid).order('created_at', { ascending: false }).limit(200), (d) => ['document_uploaded', 'task_created', 'annotation_resolved', 'folder_created'].every((a) => d.some((x) => x.action === a)));

// ---- search (the or() syntax is the risky part)
const esc = (s) => s.replace(/[\\%_,()"]/g, (c) => (c === ',' || c === '(' || c === ')' || c === '"' ? ' ' : '\\' + c));
for (const term of ['plan', 'rebar', 'lintel', 'Kickoff', 'plan.pdf', '50% off', 'a,b (c)', "O'Brien"]) {
  const like = `%${esc(term)}%`;
  const rs = await Promise.all([
    A.from('documents').select('id, name, description').eq('project_id', pid).or(`name.ilike.${like},description.ilike.${like}`).limit(20),
    A.from('folders').select('id, name').eq('project_id', pid).ilike('name', like).limit(20),
    A.from('tasks').select('id, title, description').eq('project_id', pid).or(`title.ilike.${like},description.ilike.${like}`).limit(20),
    A.from('discussion_messages').select('id, body, created_at').eq('project_id', pid).ilike('body', like).limit(20),
    A.from('drawing_annotations').select('id, body, document_id, version_id, page_number').eq('project_id', pid).ilike('body', like).limit(20),
  ]);
  const bad = rs.find((r) => r.error);
  bad ? (failed++, console.log(`FAIL  search "${term}": ${bad.error.code} ${bad.error.message}`)) : (passed++, console.log(`ok    search "${term}" (${rs.map((r) => r.data.length).join('/')})`));
}

// ---- isolation through the REST layer
for (const [name, tbl] of [['projects', 'projects'], ['documents', 'documents'], ['versions', 'document_versions'], ['tasks', 'tasks'], ['annotations', 'drawing_annotations'], ['messages', 'discussion_messages'], ['activity', 'activity_logs'], ['members', 'project_members']]) {
  await check(`outsider sees no ${name}`, C.from(tbl).select('*'), (d) => d.length === 0);
}
await check('outsider URL guess (maybeSingle)', C.from('projects').select('*').eq('id', pid).maybeSingle(), (d) => d === null);
await expectError('outsider cannot call restore', C.rpc('restore_document_version', { p_document: doc, p_version: v2 }));
await expectError('anonymous request rejected', new PostgrestClient(URL_).from('projects').select('*'), '');

await db.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
