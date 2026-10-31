'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { PRIORITY_LABEL, PRIORITY_STYLE, STATUSES, STATUS_LABEL, type Priority, type Status } from '@/lib/tasks';
import { StatusSelect } from './status-select';
import { updateTaskStatus } from './actions';

export type BoardTask = { id: string; title: string; status: Status; priority: Priority; due_date: string | null; overdue: boolean; assignee: string | null };

export function Board({ projectId, tasks }: { projectId: string; tasks: BoardTask[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [over, setOver] = useState<Status | null>(null);
  const move = (id: string, status: Status) => start(async () => {
    const t = tasks.find((x) => x.id === id); if (!t || t.status === status) return;
    const r = await updateTaskStatus(projectId, id, status); r.ok ? router.refresh() : toast.error(r.error);
  });
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUSES.map((s) => {
        const col = tasks.filter((t) => t.status === s);
        return (
          <section key={s} aria-label={STATUS_LABEL[s]} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s); }}
            className={`w-72 shrink-0 rounded-lg border p-2 ${over === s ? 'border-brand bg-brand-light' : 'border-slate-200 bg-slate-100'}`}>
            <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-medium">{STATUS_LABEL[s]}<span className="rounded bg-white px-1.5 text-xs">{col.length}</span></h2>
            <ul className="space-y-2">
              {col.map((t) => (
                <li key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="cursor-grab rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm">
                  <Link href={`/projects/${projectId}/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`rounded px-1.5 py-0.5 ${PRIORITY_STYLE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                    {t.due_date && <span className={`inline-flex items-center gap-1 ${t.overdue ? 'font-semibold text-red-600' : 'text-navy-500'}`}><CalendarClock size={12} />{t.due_date}{t.overdue && ' · overdue'}</span>}
                    <span className="ml-auto text-navy-500">{t.assignee ?? 'Unassigned'}</span>
                  </div>
                  <div className="mt-2"><StatusSelect projectId={projectId} taskId={t.id} status={t.status} title={t.title} /></div>
                </li>))}
              {!col.length && <li className="px-1 py-4 text-center text-xs text-navy-500">No tasks</li>}
            </ul>
          </section>);
      })}
    </div>
  );
}
