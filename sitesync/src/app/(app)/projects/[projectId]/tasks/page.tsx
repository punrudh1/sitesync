import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_STYLE, STATUSES, STATUS_LABEL, isOverdue, type Priority, type Status } from '@/lib/tasks';
import { Board } from './board';
import { StatusSelect } from './status-select';

export const metadata = { title: 'Tasks' };
type SP = { view?: string; priority?: string; assignee?: string; status?: string };

export default async function Tasks({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<SP> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: members } = await supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId);
  const people = (members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return { id: m.user_id, name: p?.full_name || p?.email || 'Unknown' }; });
  const name = new Map(people.map((p) => [p.id, p.name]));

  let q = supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id').eq('project_id', projectId).order('due_date', { ascending: true, nullsFirst: false }).limit(500);
  if ((PRIORITIES as readonly string[]).includes(sp.priority ?? '')) q = q.eq('priority', sp.priority!);
  if ((STATUSES as readonly string[]).includes(sp.status ?? '')) q = q.eq('status', sp.status!);
  if (sp.assignee === 'me') q = q.eq('assignee_id', user.id);
  else if (sp.assignee === 'none') q = q.is('assignee_id', null);
  else if (sp.assignee && name.has(sp.assignee)) q = q.eq('assignee_id', sp.assignee);
  const { data } = await q;
  const tasks = (data ?? []).map((t) => ({ ...t, status: t.status as Status, priority: t.priority as Priority, overdue: isOverdue(t.due_date, t.status), assignee: t.assignee_id ? name.get(t.assignee_id) ?? null : null }));

  const view = sp.view === 'board' ? 'board' : 'list';
  const href = (o: Partial<SP>) => { const u = new URLSearchParams(); Object.entries({ ...sp, ...o }).forEach(([k, v]) => v && u.set(k, v)); return `?${u}`; };
  const filtered = !!(sp.priority || sp.assignee || sp.status);
  const sel = 'rounded-md border border-slate-300 px-2 py-1.5';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <div className="ml-4 inline-flex rounded-md border border-slate-300 bg-white text-sm" role="group" aria-label="View">
          <Link href={href({ view: 'list' })} aria-current={view === 'list'} className={`px-3 py-1.5 ${view === 'list' ? 'bg-slate-100 font-medium' : ''}`}>List</Link>
          <Link href={href({ view: 'board' })} aria-current={view === 'board'} className={`border-l border-slate-300 px-3 py-1.5 ${view === 'board' ? 'bg-slate-100 font-medium' : ''}`}>Board</Link>
        </div>
        <Link href={`/projects/${projectId}/tasks/new`} className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"><Plus size={16} />New task</Link>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="view" value={view} />
        <label className="flex flex-col gap-1">Priority<select name="priority" defaultValue={sp.priority ?? ''} className={sel}><option value="">All</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        <label className="flex flex-col gap-1">Assignee<select name="assignee" defaultValue={sp.assignee ?? ''} className={sel}><option value="">Anyone</option><option value="me">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Unassigned</option></select></label>
        <label className="flex flex-col gap-1">Status<select name="status" defaultValue={sp.status ?? ''} className={sel}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">Apply</button>
        {filtered && <Link href={`?view=${view}`} className="py-1.5 underline">Clear</Link>}
      </form>

      {!tasks.length ? (
        <Card className="py-10 text-center text-sm text-navy-500">{filtered ? 'No tasks match these filters.' : 'No tasks yet. Create the first one to start tracking the work.'}</Card>
      ) : view === 'board' ? (
        <Board projectId={projectId} tasks={tasks} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-navy-700"><tr>
              {['Task', 'Assignee', 'Priority', 'Due', 'Status'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><Link href={`/projects/${projectId}/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link></td>
                  <td className="px-3 py-2">{t.assignee ?? <span className="text-navy-500">Unassigned</span>}</td>
                  <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${PRIORITY_STYLE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span></td>
                  <td className={`px-3 py-2 whitespace-nowrap ${t.overdue ? 'font-semibold text-red-600' : ''}`}>{t.due_date ?? '—'}{t.overdue && ' · overdue'}</td>
                  <td className="px-3 py-2"><StatusSelect projectId={projectId} taskId={t.id} status={t.status} title={t.title} /></td>
                </tr>))}
            </tbody>
          </table>
        </Card>)}
    </div>
  );
}
