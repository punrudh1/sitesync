-- Central Google Drive connection. OAuth refresh tokens are encrypted by the application
-- before they reach this table. No client role receives access to this table.
create table if not exists site_integrations (
  id text primary key check (id = 'primary'),
  drive_email text not null,
  refresh_token_encrypted text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table site_integrations enable row level security;
revoke all on table site_integrations from anon, authenticated;
