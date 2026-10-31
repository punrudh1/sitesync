'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { acceptInvitation } from '../../actions';

export function JoinButton({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={() => start(async () => { const r = await acceptInvitation(token); if (r?.error) setError(r.error); })}>
        {pending ? 'Joining…' : 'Accept invitation'}
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
