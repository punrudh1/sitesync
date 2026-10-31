'use client';

import { useActionState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '@/lib/tasks';
import type { TaskState } from './actions';

type Task = { title: string; description: string; assignee_id: string | null; priority: string; status: string; start_date: string | null; due_date: string | null };
const sel = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

export function TaskForm({ action, task, people, submitLabel }: {
  action: (s: TaskState, f: FormData) => Promise<TaskState>; task?: Task; people: { id: string; name: string }[]; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(async (s: TaskState, f: FormData) => {
    const r = await action(s, f);
    if (r && !r.error) toast.success('Task saved');
    return r;
  }, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field id="title" label="Title" defaultValue={task?.title} required maxLength={200} error={state?.fieldErrors?.title} />
      <TextArea id="description" label="Description" defaultValue={task?.description} maxLength={8000} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium text-navy-700">Assignee
          <select name="assigneeId" defaultValue={task?.assignee_id ?? ''} className={sel}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium text-navy-700">Priority
          <select name="priority" defaultValue={task?.priority ?? 'medium'} className={sel}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium text-navy-700">Status
          <select name="status" defaultValue={task?.status ?? 'todo'} className={sel}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="startDate" type="date" label="Start date" defaultValue={task?.start_date ?? ''} />
        <Field id="dueDate" type="date" label="Due date" defaultValue={task?.due_date ?? ''} error={state?.fieldErrors?.dueDate} />
      </div>
      {state?.error && !state.fieldErrors?.title && !state.fieldErrors?.dueDate && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
    </form>
  );
}
