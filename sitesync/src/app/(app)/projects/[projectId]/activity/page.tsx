import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Activity Log' };

export default async function Activity({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase } = await requireUser();
  const [{ data: log }, { data: members }] = await Promise.all([
    supabase.from('activity_logs').select('id, user_id, action, object_type, object_id, summary, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200),
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
  ]);
  const name = new Map((members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return [m.user_id, p?.full_name || p?.email || 'Unknown']; }));
  const link = (t: string, id: string | null) => !id ? null : t === 'task' ? `/projects/${projectId}/tasks/${id}` : t === 'document' ? `/projects/${projectId}/documents/${id}` : t === 'discussion' ? `/projects/${projectId}/discussions` : null;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Activity Log</h1>
      <p className="text-sm text-navy-500">A read-only history of what happened in this project. Entries cannot be edited or deleted.</p>
      <Card className="p-0">
        {log?.length ? <ul className="divide-y divide-slate-100">{log.map((a) => { const l = link(a.object_type, a.object_id); return (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-sm">
            <span className="font-medium">{name.get(a.user_id) ?? 'Unknown'}</span>
            {l ? <Link href={l} className="text-brand hover:underline">{a.summary}</Link> : <span>{a.summary}</span>}
            <time className="ml-auto text-xs text-navy-500" dateTime={a.created_at}>{new Date(a.created_at).toLocaleString()}</time>
          </li>); })}</ul> : <p className="p-8 text-center text-sm text-navy-500">Nothing has happened yet.</p>}
      </Card>
    </div>
  );
}
