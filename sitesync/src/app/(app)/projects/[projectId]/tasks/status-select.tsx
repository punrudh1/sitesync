'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { STATUSES, STATUS_LABEL, type Status } from '@/lib/tasks';
import { updateTaskStatus } from './actions';

export function StatusSelect({ projectId, taskId, status, title }: { projectId: string; taskId: string; status: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select aria-label={`Status of ${title}`} value={status} disabled={pending} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
      onChange={(e) => start(async () => { const r = await updateTaskStatus(projectId, taskId, e.target.value as Status); r.ok ? router.refresh() : toast.error(r.error); })}>
      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}
