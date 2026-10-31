'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { updateName } from './actions';

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, undefined);
  return (
    <form action={action} className="space-y-3">
      <Field id="fullName" label="Full name" defaultValue={name} required minLength={2} maxLength={100} autoComplete="name" />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
      <Button disabled={pending}>{pending ? 'Saving…' : 'Save name'}</Button>
    </form>
  );
}
