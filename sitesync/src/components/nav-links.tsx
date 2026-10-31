'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CheckSquare, FileText, History, MessagesSquare, Ruler, Settings, Users } from 'lucide-react';

export function NavLinks({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const b = `/projects/${projectId}`;
  const items = [
    { href: b, label: 'Overview', icon: BarChart3, exact: true }, { href: `${b}/documents`, label: 'Documents', icon: FileText },
    { href: `${b}/drawings`, label: 'Drawings', icon: Ruler }, { href: `${b}/tasks`, label: 'Tasks', icon: CheckSquare },
    { href: `${b}/discussions`, label: 'Discussions', icon: MessagesSquare }, { href: `${b}/activity`, label: 'Activity Log', icon: History },
    { href: `${b}/team`, label: 'Team', icon: Users }, { href: `${b}/settings`, label: 'Settings', icon: Settings },
  ];
  return (
    <nav aria-label="Project" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-2 md:w-56 md:flex-col md:border-b-0 md:border-r">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-slate-100 ${active ? 'bg-brand-light font-medium text-brand' : ''}`}><Icon size={16} aria-hidden />{label}</Link>);
      })}
    </nav>
  );
}
