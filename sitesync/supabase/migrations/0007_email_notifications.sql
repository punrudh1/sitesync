-- Optional email delivery of notifications.
-- Flow: notifications INSERT -> trigger -> pg_net HTTP POST -> /api/email-webhook (checks a shared secret) -> Resend.
-- Nothing is sent until you (1) enable the pg_net extension, (2) insert the two app_settings rows below, and
-- (3) set EMAIL_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM on the app. See README "Email notifications".

alter table profiles add column if not exists email_notifications boolean not null default true;
grant update (email_notifications) on profiles to authenticated;

-- Server-side configuration. RLS is on with no policies and no grants: clients can never read it.
create table if not exists app_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
-- Example (run once in the SQL editor, with your own values):
--   insert into app_settings (key, value) values
--     ('email_webhook_url',    'https://YOUR-APP/api/email-webhook'),
--     ('email_webhook_secret', 'a-long-random-string-also-set-as-EMAIL_WEBHOOK_SECRET')
--   on conflict (key) do update set value = excluded.value;

create or replace function trg_notification_email() returns trigger language plpgsql security definer set search_path = public as $$
declare url text; secret text; addr text; wants boolean;
begin
  select value into url from app_settings where key = 'email_webhook_url';
  select value into secret from app_settings where key = 'email_webhook_secret';
  if url is null or secret is null then return new; end if;
  select email, email_notifications into addr, wants from profiles where id = new.user_id;
  if addr is null or wants is not true then return new; end if;
  begin
    perform net.http_post(
      url := url,
      body := jsonb_build_object('to', addr, 'message', new.message, 'link', new.link, 'type', new.type, 'project_id', new.project_id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret));
  exception when others then
    raise warning 'email notification not sent: %', sqlerrm;  -- never block the in-app notification
  end;
  return new;
end $$;
create trigger notifications_email after insert on notifications for each row execute function trg_notification_email();
