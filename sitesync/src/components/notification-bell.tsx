'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { Bell } from 'lucide-react';
import { markAllRead, markRead } from '@/app/(app)/actions';

export type Notif = { id: string; message: string; link: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ items, unread }: { items: Notif[]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <details className="relative">
      <summary className="relative cursor-pointer list-none rounded-md p-2 hover:bg-slate-100" aria-label={`Notifications, ${unread} unread`}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm font-medium">
          Notifications
          {unread > 0 && <button disabled={pending} onClick={() => start(() => markAllRead())} className="text-xs font-normal text-brand underline">Mark all read</button>}
        </div>
        {items.length === 0 ? <p className="p-4 text-center text-sm text-navy-500">You are all caught up.</p> : (
          <ul className="max-h-96 overflow-y-auto text-sm">
            {items.map((n) => (
              <li key={n.id} className={n.read_at ? '' : 'bg-brand-light/60'}>
                <Link href={n.link ?? '#'} onClick={() => !n.read_at && start(() => markRead(n.id))} className="block px-3 py-2 hover:bg-slate-50">
                  {n.message}<time className="block text-xs text-navy-500" dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time>
                </Link>
              </li>))}
          </ul>)}
      </div>
    </details>
  );
}
