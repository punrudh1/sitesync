import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, ListPlus, Upload } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { signedUrl } from '@/lib/avatar';
import { PRIORITY_LABEL, PRIORITY_STYLE, STATUS_LABEL, daysUntil, isOverdue, todayStr, type Priority, type Status } from '@/lib/tasks';

const PSTATUS: Record<string, string> = { planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', archived: 'Archived' };

export default async function Overview({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: p }, { data: members }, { data: activity }, { data: tasks }, { data: docs }, { count: pendingInvites }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase.from('project_members').select('user_id, role, profiles(full_name, email)').eq('project_id', projectId),
    supabase.from('activity_logs').select('id, user_id, summary, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(8),
    supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id').eq('project_id', projectId).limit(1000),
    supabase.from('documents').select('id, name, updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(5),
    supabase.from('project_invitations').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'pending'), // owner-only via RLS
  ]);
  if (!p) notFound();
  const cover = await signedUrl(supabase, 'project-files', p.cover_image_path);
  const steps = [
    { label: 'Create your project', done: true, href: null },
    { label: 'Add a description and target date', done: !!p.description && !!p.target_completion_date, href: `/projects/${projectId}/settings` },
    { label: 'Invite your collaborator', done: (members?.length ?? 0) > 1 || (pendingInvites ?? 0) > 0, href: `/projects/${projectId}/team` },
    { label: 'Upload your first document', done: (docs?.length ?? 0) > 0, href: `/projects/${projectId}/documents` },
    { label: 'Create your first task', done: (tasks?.length ?? 0) > 0, href: `/projects/${projectId}/tasks/new` },
  ];
  const stepsLeft = steps.filter((x) => !x.done).length;
  const name = new Map((members ?? []).map((m) => { const pr = m.profiles as unknown as { full_name: string; email: string } | null; return [m.user_id, pr?.full_name || pr?.email || 'Unknown']; }));
  const all = tasks ?? [];
  const today = todayStr();
  const done = all.filter((t) => t.status === 'completed').length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const mine = all.filter((t) => t.assignee_id === user.id && t.status !== 'completed').sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 5);
  const overdue = all.filter((t) => isOverdue(t.due_date, t.status, today));
  const upcoming = all.filter((t) => t.due_date && t.status !== 'completed' && t.due_date >= today && daysUntil(t.due_date, today) <= 14).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 5);
  const TaskLi = ({ t }: { t: (typeof all)[number] }) => (
    <li className="flex items-center gap-2 py-1.5 text-sm"><Link href={`/projects/${projectId}/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
      <span className={`rounded px-1.5 text-xs ${PRIORITY_STYLE[t.priority as Priority]}`}>{PRIORITY_LABEL[t.priority as Priority]}</span>
      <span className={`text-xs ${isOverdue(t.due_date, t.status, today) ? 'font-semibold text-red-600' : 'text-navy-500'}`}>{t.due_date ?? STATUS_LABEL[t.status as Status]}</span></li>);

  return (
    <div className="space-y-6">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-36 w-full rounded-lg object-cover md:h-48" />)}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-navy-500">{p.code}</p>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          {p.description && <p className="mt-1 max-w-2xl text-sm text-navy-700">{p.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${projectId}/documents`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"><Upload size={16} />Upload document</Link>
          <Link href={`/projects/${projectId}/tasks/new`} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"><ListPlus size={16} />New task</Link>
        </div>
      </div>
      {stepsLeft > 0 && (
        <Card className="border-brand/40 bg-brand-light"><h2 className="mb-2 font-medium">Get started ({steps.length - stepsLeft}/{steps.length})</h2>
          <ol className="space-y-1.5 text-sm">{steps.map((x) => (
            <li key={x.label} className="flex items-center gap-2"><span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-xs ${x.done ? 'bg-green-600 text-white' : 'border border-slate-400'}`}>{x.done ? '✓' : ''}</span>
              {x.done || !x.href ? <span className={x.done ? 'text-navy-500 line-through' : ''}><span className="sr-only">{x.done ? 'Done: ' : 'To do: '}</span>{x.label}</span> : <Link href={x.href} className="font-medium text-brand underline"><span className="sr-only">To do: </span>{x.label}</Link>}</li>))}</ol></Card>)}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-xs text-navy-500">Status</p><p className="text-lg font-medium">{PSTATUS[p.status]}</p></Card>
        <Card><p className="text-xs text-navy-500">Start</p><p className="text-lg font-medium">{p.start_date ?? 'Not set'}</p></Card>
        <Card><p className="text-xs text-navy-500">Target completion</p><p className="text-lg font-medium">{p.target_completion_date ?? 'Not set'}</p></Card>
        <Card><p className="text-xs text-navy-500">Task progress</p><p className="text-lg font-medium">{all.length ? `${pct}% (${done}/${all.length})` : 'No tasks'}</p>
          <div className="mt-2 h-2 rounded bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Task completion"><div className="h-2 rounded bg-brand" style={{ width: `${pct}%` }} /></div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-medium">My open tasks</h2>{mine.length ? <ul className="divide-y divide-slate-100">{mine.map((t) => <TaskLi key={t.id} t={t} />)}</ul> : <p className="text-sm text-navy-500">Nothing assigned to you.</p>}</Card>
        <Card><h2 className="mb-2 font-medium">Deadlines</h2>
          {overdue.length > 0 && <><p className="text-xs font-semibold uppercase text-red-600">Overdue ({overdue.length})</p><ul className="mb-2 divide-y divide-slate-100">{overdue.slice(0, 5).map((t) => <TaskLi key={t.id} t={t} />)}</ul></>}
          {upcoming.length ? <><p className="text-xs font-semibold uppercase text-navy-500">Next 14 days</p><ul className="divide-y divide-slate-100">{upcoming.map((t) => <TaskLi key={t.id} t={t} />)}</ul></> : !overdue.length && <p className="text-sm text-navy-500">No upcoming deadlines.</p>}</Card>
        <Card><h2 className="mb-2 font-medium">Recently modified documents</h2>
          {docs?.length ? <ul className="divide-y divide-slate-100">{docs.map((d) => <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm"><FileText size={14} className="text-navy-500" /><Link href={`/projects/${projectId}/documents/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">{d.name}</Link><span className="text-xs text-navy-500">{new Date(d.updated_at).toLocaleDateString()}</span></li>)}</ul> : <p className="text-sm text-navy-500">No documents yet. Upload your first drawing.</p>}</Card>
        <Card><h2 className="mb-2 flex justify-between font-medium">Recent activity <Link href={`/projects/${projectId}/activity`} className="text-xs font-normal text-brand">View all</Link></h2>
          {activity?.length ? <ul className="space-y-1.5 text-sm">{activity.map((a) => <li key={a.id}><span className="font-medium">{name.get(a.user_id)}</span> {a.summary}<time className="ml-2 text-xs text-navy-500" dateTime={a.created_at}>{new Date(a.created_at).toLocaleString()}</time></li>)}</ul> : <p className="text-sm text-navy-500">No activity yet.</p>}</Card>
      </div>
    </div>
  );
}
