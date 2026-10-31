'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { taskSchema } from '@/lib/validation';
import { STATUSES, type Status } from '@/lib/tasks';

export type TaskState = { error?: string; fieldErrors?: Record<string, string> } | undefined;
const uuid = z.string().uuid();
const touch = (pid: string) => revalidatePath(`/projects/${pid}/tasks`);

function parse(form: FormData) {
  const r = taskSchema.safeParse(Object.fromEntries(form));
  if (r.success) return { data: r.data };
  return { error: r.error.issues[0].message, fieldErrors: Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])) };
}

export async function createTask(projectId: string, _: TaskState, form: FormData): Promise<TaskState> {
  const { supabase, user } = await requireUser();
  const p = parse(form);
  if (!p.data) return { error: p.error, fieldErrors: p.fieldErrors };
  const d = p.data;
  const { data, error } = await supabase.from('tasks').insert({
    project_id: projectId, title: d.title, description: d.description, assignee_id: d.assigneeId, priority: d.priority, status: d.status,
    start_date: d.startDate, due_date: d.dueDate, created_by: user.id,
  }).select('id').single();
  if (error) return { error: 'Could not create the task. Check that the assignee is a project member.' };
  touch(projectId);
  redirect(`/projects/${projectId}/tasks/${data.id}`);
}

export async function updateTask(projectId: string, taskId: string, _: TaskState, form: FormData): Promise<TaskState> {
  const { supabase } = await requireUser();
  const p = parse(form);
  if (!p.data) return { error: p.error, fieldErrors: p.fieldErrors };
  const d = p.data;
  const { data, error } = await supabase.from('tasks').update({
    title: d.title, description: d.description, assignee_id: d.assigneeId, priority: d.priority, status: d.status, start_date: d.startDate, due_date: d.dueDate,
  }).eq('id', taskId).eq('project_id', projectId).select('id');
  if (error || !data?.length) return { error: 'Could not save the task' };
  touch(projectId);
  return { error: undefined };
}

export async function updateTaskStatus(projectId: string, taskId: string, status: Status): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireUser();
  if (!STATUSES.includes(status) || !uuid.safeParse(taskId).success) return { ok: false, error: 'Invalid status' };
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', taskId).eq('project_id', projectId).select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not update the task' };
  touch(projectId);
  return { ok: true };
}

export async function deleteTask(projectId: string, taskId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('tasks').delete().eq('id', taskId).eq('project_id', projectId).select('id');
  if (!data?.length) return { ok: false, error: 'Only the project owner or the task creator can delete it' };
  touch(projectId);
  redirect(`/projects/${projectId}/tasks`);
}

export async function addTaskComment(projectId: string, taskId: string, body: string) {
  const { supabase, user } = await requireUser();
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: 'Write a comment (up to 4000 characters)' };
  const { error } = await supabase.from('task_comments').insert({ task_id: taskId, project_id: projectId, author_id: user.id, body: text });
  if (error) return { ok: false, error: 'Could not post the comment' };
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  return { ok: true };
}

export async function linkDocument(projectId: string, taskId: string, documentId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from('task_documents').upsert({ task_id: taskId, document_id: documentId, project_id: projectId });
  if (error) return { ok: false, error: 'Could not link that document' };
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  return { ok: true };
}

export async function unlinkDocument(projectId: string, taskId: string, documentId: string) {
  const { supabase } = await requireUser();
  await supabase.from('task_documents').delete().eq('task_id', taskId).eq('document_id', documentId).eq('project_id', projectId);
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  return { ok: true };
}
