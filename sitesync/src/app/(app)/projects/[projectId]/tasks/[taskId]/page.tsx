import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { updateTask } from '../actions';
import { TaskForm } from '../task-form';
import { Comments, DeleteTaskButton, LinkedDocs } from './parts';

export default async function TaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const { supabase } = await requireUser();
  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).eq('project_id', projectId).maybeSingle();
  if (!task) notFound();
  const [{ data: members }, { data: comments }, { data: links }, { data: docs }] = await Promise.all([
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
    supabase.from('task_comments').select('id, author_id, body, created_at').eq('task_id', taskId).order('created_at'),
    supabase.from('task_documents').select('document_id').eq('task_id', taskId),
    supabase.from('documents').select('id, name').eq('project_id', projectId).order('name').limit(500),
  ]);
  const people = (members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return { id: m.user_id, name: p?.full_name || p?.email || 'Unknown' }; });
  const name = new Map(people.map((p) => [p.id, p.name]));
  const linkedIds = new Set((links ?? []).map((l) => l.document_id));
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div><Link href={`/projects/${projectId}/tasks`} className="text-sm text-navy-500 hover:underline">← Tasks</Link>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <p className="text-xs text-navy-500">Created by {name.get(task.created_by)} · updated {new Date(task.updated_at).toLocaleString()}</p></div>
        <DeleteTaskButton projectId={projectId} taskId={taskId} />
      </div>
      <Card><TaskForm action={updateTask.bind(null, projectId, taskId)} task={task} people={people} submitLabel="Save changes" /></Card>
      <Card><h2 className="mb-3 font-medium">Related documents</h2>
        <LinkedDocs projectId={projectId} taskId={taskId} linked={(docs ?? []).filter((d) => linkedIds.has(d.id))} available={(docs ?? []).filter((d) => !linkedIds.has(d.id))} /></Card>
      <Card><h2 className="mb-3 font-medium">Comments</h2>
        <Comments projectId={projectId} taskId={taskId} comments={(comments ?? []).map((c) => ({ ...c, author: name.get(c.author_id) ?? 'Unknown' }))} /></Card>
    </div>
  );
}
