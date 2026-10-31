-- Deadline reminders: one shared implementation, callable per user (on page load) or for everyone (scheduled).

create or replace function create_due_notifications(p_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with ins as (
    insert into notifications (user_id, project_id, type, related_table, related_id, message, link)
    select t.assignee_id, t.project_id, 'task_deadline', 'tasks', t.id,
           case when t.due_date < current_date then 'Overdue: ' else 'Due ' || to_char(t.due_date, 'Mon DD') || ': ' end || t.title,
           '/projects/' || t.project_id || '/tasks/' || t.id
    from tasks t
    where (p_user is null or t.assignee_id = p_user)
      and t.assignee_id is not null and t.status <> 'completed' and t.due_date is not null and t.due_date <= current_date + 2
      and not exists (select 1 from notifications x where x.user_id = t.assignee_id and x.type = 'task_deadline'
                      and x.related_id = t.id and x.created_at > now() - interval '24 hours')
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function create_due_notifications(uuid) from public, anon, authenticated;

create or replace function notify_due_tasks() returns integer language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 0; end if;
  return create_due_notifications(auth.uid());
end $$;

create or replace function notify_all_due_tasks() returns integer language sql security definer set search_path = public as $$
  select create_due_notifications(null)
$$;
revoke all on function notify_all_due_tasks() from public, anon, authenticated;

-- Hourly schedule when pg_cron is available (enable it in Supabase: Database > Extensions). Skipped, not failed, otherwise.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('sitesync-due-reminders', '0 * * * *', 'select public.notify_all_due_tasks()');
    exception when others then
      raise notice 'pg_cron could not be configured (%); reminders will still be created when members open the app.', sqlerrm;
    end;
  else
    raise notice 'pg_cron not available; reminders will still be created when members open the app.';
  end if;
end $$;
