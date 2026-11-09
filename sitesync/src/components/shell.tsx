import Link from 'next/link';
import { LogOut, Search } from 'lucide-react';
import { Logo } from '@/components/logo';
import { NavLinks } from '@/components/nav-links';
import { NotificationBell, type Notif } from '@/components/notification-bell';
import { signOut } from '@/app/(auth)/actions';

type Project = { id: string; name: string };

export function Shell({ project, projects, userName, avatarUrl, notifications, unread, children }: {
  project: Project; projects: Project[]; userName: string; avatarUrl: string | null; notifications: Notif[]; unread: number; children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:gap-3 sm:px-4">
        <Link href="/" aria-label="Home"><Logo /></Link>
        <details className="relative ml-1 min-w-0 sm:ml-2">
          <summary className="max-w-[9rem] cursor-pointer truncate rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:max-w-xs">{project.name}</summary>
          <ul className="absolute z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {projects.map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">{p.name}</Link></li>)}
            <li><Link href="/projects/new" className="block rounded px-3 py-2 text-sm text-brand hover:bg-brand-light">+ New project</Link></li>
          </ul>
        </details>
        <form action={`/projects/${project.id}/search`} role="search" className="ml-2 hidden flex-1 sm:block sm:max-w-sm">
          <input name="q" type="search" required minLength={2} placeholder="Search documents, tasks, messages…" aria-label="Search project" className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm" />
        </form>
        <div className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link href={`/projects/${project.id}/search`} aria-label="Search" className="header-icon-control rounded-md p-2 transition-colors sm:hidden"><Search size={18} /></Link>
          <NotificationBell items={notifications} unread={unread} />
          <Link href="/account" className="account-link flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors" aria-label={`Account: ${userName}`}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              : <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">{(userName[0] ?? '?').toUpperCase()}</span>}
            <span className="hidden max-w-[10rem] truncate text-navy-500 md:inline">{userName}</span>
          </Link>
          <form action={signOut}><button className="sign-out-button inline-flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors" aria-label="Sign out"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button></form>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <NavLinks projectId={project.id} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-3 outline-none sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
