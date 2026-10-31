import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Search' };
const esc = (s: string) => s.replace(/[\\%_,()]/g, (c) => (c === ',' || c === '(' || c === ')' ? ' ' : '\\' + c));

export default async function Search({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { projectId } = await params;
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const { supabase } = await requireUser();
  const base = `/projects/${projectId}`;
  type Hit = { key: string; label: string; sub: string; href: string };
  const groups: { title: string; hits: Hit[] }[] = [];
  if (q.length >= 2) {
    const like = `%${esc(q)}%`;
    const [docs, folders, tasks, msgs, notes] = await Promise.all([
      supabase.from('documents').select('id, name, description').eq('project_id', projectId).or(`name.ilike.${like},description.ilike.${like}`).limit(20),
      supabase.from('folders').select('id, name').eq('project_id', projectId).ilike('name', like).limit(20),
      supabase.from('tasks').select('id, title, description').eq('project_id', projectId).or(`title.ilike.${like},description.ilike.${like}`).limit(20),
      supabase.from('discussion_messages').select('id, body, created_at').eq('project_id', projectId).ilike('body', like).limit(20),
      supabase.from('drawing_annotations').select('id, body, document_id, version_id, page_number').eq('project_id', projectId).ilike('body', like).limit(20),
    ]);
    groups.push(
      { title: 'Documents', hits: (docs.data ?? []).map((d) => ({ key: d.id, label: d.name, sub: d.description, href: `${base}/documents/${d.id}` })) },
      { title: 'Folders', hits: (folders.data ?? []).map((f) => ({ key: f.id, label: f.name, sub: 'Folder', href: `${base}/documents?folder=${f.id}` })) },
      { title: 'Tasks', hits: (tasks.data ?? []).map((t) => ({ key: t.id, label: t.title, sub: t.description.slice(0, 120), href: `${base}/tasks/${t.id}` })) },
      { title: 'Discussion messages', hits: (msgs.data ?? []).map((m) => ({ key: m.id, label: m.body.slice(0, 120), sub: new Date(m.created_at).toLocaleString(), href: `${base}/discussions` })) },
      { title: 'Drawing comments', hits: (notes.data ?? []).map((n) => ({ key: n.id, label: n.body.slice(0, 120), sub: `Page ${n.page_number}`, href: `${base}/documents/${n.document_id}/view?v=${n.version_id}` })) },
    );
  }
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Search</h1>
      <form role="search" className="flex gap-2"><input name="q" defaultValue={q} minLength={2} required aria-label="Search" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Search</button></form>
      {q.length < 2 ? <p className="text-sm text-navy-500">Type at least two characters.</p> : total === 0 ? <Card className="py-8 text-center text-sm text-navy-500">No results for “{q}”.</Card> :
        groups.filter((g) => g.hits.length).map((g) => (
          <Card key={g.title} className="p-0"><h2 className="border-b border-slate-100 px-4 py-2 text-sm font-medium">{g.title} <span className="text-navy-500">({g.hits.length})</span></h2>
            <ul className="divide-y divide-slate-100">{g.hits.map((h) => <li key={h.key}><Link href={h.href} className="block px-4 py-2 text-sm hover:bg-slate-50"><span className="font-medium">{h.label}</span>{h.sub && <span className="block truncate text-xs text-navy-500">{h.sub}</span>}</Link></li>)}</ul></Card>))}
    </div>
  );
}
