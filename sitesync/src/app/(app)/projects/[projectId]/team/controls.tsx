'use client';

import { useActionState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { inviteMember, removeMember, revokeInvitation } from '../../../actions';

export function InviteForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(inviteMember.bind(null, projectId), undefined);
  return (
    <form action={action} className="space-y-3">
      <Field id="email" type="email" label="Collaborator's email" required />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.inviteLink && (
        <div className="space-y-2 rounded bg-slate-50 p-3 text-sm">
          <p>{state.message}</p>
          <code className="block break-all rounded bg-white p-2 text-xs">{state.inviteLink}</code>
          <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(state.inviteLink!); toast.success('Link copied'); }}>Copy link</Button>
          <p className="text-xs text-navy-500">Email delivery is not configured, so you must send this link yourself. It is shown only once.</p>
        </div>
      )}
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invitation'}</Button>
    </form>
  );
}

export function RevokeButton({ projectId, invitationId }: { projectId: string; invitationId: string }) {
  const [pending, start] = useTransition();
  return <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await revokeInvitation(projectId, invitationId); toast.success('Invitation revoked'); })}>Revoke</Button>;
}

export function RemoveButton({ projectId, userId }: { projectId: string; userId: string }) {
  const [pending, start] = useTransition();
  return <Button variant="ghost" disabled={pending} onClick={() => {
    if (!confirm('Remove this member from the project? They will lose access immediately.')) return;
    start(async () => { await removeMember(projectId, userId); toast.success('Member removed'); });
  }}>Remove</Button>;
}
