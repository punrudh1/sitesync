'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import { updateProject } from './actions';

type P = { name: string; code: string; description: string; status: string; start_date: string | null; target_completion_date: string | null };

export function SettingsForm({ projectId, project }: { projectId: string; project: P }) {
  const [state, action, pending] = useActionState(updateProject.bind(null, projectId), undefined);
  return (
    <form action={action} className="space-y-4">
      <Field id="name" label="Project name" defaultValue={project.name} required maxLength={120} />
      <Field id="code" label="Project code" defaultValue={project.code} required maxLength={32} />
      <TextArea id="description" label="Description" defaultValue={project.description} maxLength={4000} />
      <label className="block space-y-1 text-sm font-medium text-navy-700">Status
        <select name="status" defaultValue={project.status} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          {[['planning', 'Planning'], ['active', 'Active'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['archived', 'Archived']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><Field id="startDate" type="date" label="Start date" defaultValue={project.start_date ?? ''} /><Field id="targetDate" type="date" label="Target completion" defaultValue={project.target_completion_date ?? ''} /></div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.saved && <p role="status" className="text-sm text-green-700">Settings saved.</p>}
      <Button disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button>
    </form>
  );
}
