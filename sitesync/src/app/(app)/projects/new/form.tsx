'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, TextArea } from '@/components/ui/field';
import { createProject } from '../../actions';

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProject, undefined);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <Field id="name" label="Project name" required maxLength={120} />
        <Field id="code" label="Project code" placeholder="e.g. BRG-2026-01" required maxLength={32} />
        <TextArea id="description" label="Description" maxLength={4000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="startDate" type="date" label="Start date" />
          <Field id="targetDate" type="date" label="Target completion" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create project'}</Button>
      </form>
    </Card>
  );
}
