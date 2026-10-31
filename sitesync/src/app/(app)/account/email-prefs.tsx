'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateEmailPrefs } from './actions';

export function EmailPrefs({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1" checked={on} disabled={pending} onChange={(e) => {
        const next = e.target.checked; setOn(next);
        start(async () => { const r = await updateEmailPrefs(next); if (!r.ok) { setOn(!next); toast.error(r.error); } else toast.success(next ? 'Email notifications on' : 'Email notifications off'); });
      }} />
      <span><span className="font-medium">Email me my notifications</span><br /><span className="text-xs text-navy-500">Only applies if your team has configured email delivery. In-app notifications are always on.</span></span>
    </label>
  );
}
