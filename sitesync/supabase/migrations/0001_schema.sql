-- SiteSync schema. Run via `supabase db push` or the SQL editor, in order.
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type project_status as enum ('planning','active','on_hold','completed','archived');
create type member_role as enum ('owner','member');
create type invitation_status as enum ('pending','accepted','revoked','expired');
create type document_status as enum ('draft','for_review','approved','superseded');
create type task_status as enum ('todo','in_progress','under_review','completed','blocked');
create type task_priority as enum ('low','medium','high','critical');
create type annotation_type as enum ('pin','text','arrow','rectangle','cloud');
create type notification_type as enum (
  'task_assigned','task_deadline','document_uploaded','document_version',
  'drawing_comment','discussion_reply','task_status_changed');

-- ---------- helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- projects ----------
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  code text not null check (char_length(code) between 2 and 32),
  description text not null default '' check (char_length(description) <= 4000),
  status project_status not null default 'planning',
  start_date date,
  target_completion_date date,
  cover_image_path text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_completion_date is null or start_date is null or target_completion_date >= start_date)
);
create trigger projects_updated before update on projects for each row execute function set_updated_at();

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members(user_id);
create unique index one_owner_per_project on project_members(project_id) where role = 'owner';

create table project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  status invitation_status not null default 'pending',
  invited_by uuid not null references profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index one_pending_invite_per_email on project_invitations(project_id, email) where status = 'pending';

-- ---------- membership helper functions (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid())
$$;
create or replace function is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid() and role = 'owner')
$$;
create or replace function is_user_in_project(pid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = uid)
$$;
revoke all on function is_project_member(uuid), is_project_owner(uuid), is_user_in_project(uuid,uuid) from public;
grant execute on function is_project_member(uuid), is_project_owner(uuid), is_user_in_project(uuid,uuid) to authenticated;

-- ---------- folders ----------
create table folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 120 and name !~ '[/\\]'),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (parent_id, project_id) references folders(id, project_id) on delete cascade
);
create unique index folders_unique_name on folders(project_id, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'), lower(name));
create trigger folders_updated before update on folders for each row execute function set_updated_at();

-- ---------- documents & versions ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  folder_id uuid,
  name text not null check (char_length(name) between 1 and 255 and name !~ '[/\\]'),
  extension text not null check (extension in ('pdf','jpg','jpeg','png','docx','xlsx','csv','dwg','dxf','zip','txt')),
  description text not null default '',
  status document_status not null default 'draft',
  current_version_id uuid,
  uploaded_by uuid not null references profiles(id),
  last_modified_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (folder_id, project_id) references folders(id, project_id) on delete set null (folder_id)
);
create index documents_project_folder_idx on documents(project_id, folder_id);
create index documents_name_idx on documents(project_id, lower(name));
create trigger documents_updated before update on documents for each row execute function set_updated_at();

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  project_id uuid not null,
  version_number integer not null check (version_number > 0),
  revision_label text,
  revision_notes text not null default '',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  uploaded_by uuid not null references profiles(id),
  restored_from_version_id uuid,
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (id, document_id),
  unique (id, project_id, document_id),
  foreign key (document_id, project_id) references documents(id, project_id) on delete cascade,
  -- storage path must start with the project id so storage policies and rows agree
  check (split_part(storage_path,'/',1) = project_id::text)
);
alter table documents add constraint documents_current_version_fk
  foreign key (current_version_id, id) references document_versions(id, document_id)
  deferrable initially deferred;

-- versions are immutable
create or replace function forbid_version_mutation() returns trigger language plpgsql as $$
begin raise exception 'document_versions rows are immutable'; end $$;
create trigger versions_immutable before update on document_versions for each row execute function forbid_version_mutation();

-- ---------- tasks ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid not null references profiles(id),
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_project_status_idx on tasks(project_id, status);
create index tasks_assignee_idx on tasks(assignee_id);
create index tasks_due_idx on tasks(project_id, due_date);
create trigger tasks_updated before update on tasks for each row execute function set_updated_at();

create table task_documents (
  task_id uuid not null,
  document_id uuid not null,
  project_id uuid not null,
  primary key (task_id, document_id),
  foreign key (task_id, project_id) references tasks(id, project_id) on delete cascade,
  foreign key (document_id, project_id) references documents(id, project_id) on delete cascade
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  author_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (task_id, project_id) references tasks(id, project_id) on delete cascade
);
create index task_comments_task_idx on task_comments(task_id, created_at);

-- ---------- drawing annotations ----------
create table drawing_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  document_id uuid not null,
  version_id uuid not null,
  page_number integer not null default 1 check (page_number > 0),
  author_id uuid not null references profiles(id),
  type annotation_type not null,
  -- normalized 0..1 coordinates relative to page width/height, e.g. {"x":0.4,"y":0.2,"w":0.1,"h":0.05}
  coordinates jsonb not null,
  body text not null default '' check (char_length(body) <= 4000),
  resolved boolean not null default false,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (version_id, project_id, document_id) references document_versions(id, project_id, document_id) on delete cascade
);
create index annotations_version_page_idx on drawing_annotations(version_id, page_number);

create table annotation_replies (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null,
  project_id uuid not null,
  author_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (annotation_id, project_id) references drawing_annotations(id, project_id) on delete cascade
);

-- ---------- discussions ----------
create table discussion_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references profiles(id),
  parent_id uuid references discussion_messages(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  document_id uuid,
  created_at timestamptz not null default now(),
  foreign key (document_id, project_id) references documents(id, project_id) on delete set null (document_id)
);
create index discussion_project_idx on discussion_messages(project_id, created_at);

-- ---------- notifications & activity ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  type notification_type not null,
  related_table text not null,
  related_id uuid not null,
  message text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id),
  action text not null,
  object_type text not null,
  object_id uuid,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index activity_project_idx on activity_logs(project_id, created_at desc);
