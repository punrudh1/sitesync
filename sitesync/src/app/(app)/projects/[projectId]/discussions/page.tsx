import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Composer, DeleteMessage, ReplyToggle } from './composer';

export const metadata = { title: 'Discussions' };

export default async function Discussions({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: msgs }, { data: members }, { data: docs }] = await Promise.all([
    supabase.from('discussion_messages').select('id, author_id, parent_id, body, document_id, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200),
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
    supabase.from('documents').select('id, name').eq('project_id', projectId).order('name').limit(500),
  ]);
  const name = new Map((members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return [m.user_id, p?.full_name || p?.email || 'Unknown']; }));
  const others = (members ?? []).filter((m) => m.user_id !== user.id).map((m) => name.get(m.user_id)!).filter(Boolean);
  const docName = new Map((docs ?? []).map((d) => [d.id, d.name]));
  const threads = (msgs ?? []).filter((m) => !m.parent_id);
  const replies = (id: string) => (msgs ?? []).filter((m) => m.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));

  const Msg = ({ m }: { m: NonNullable<typeof msgs>[number] }) => (
    <div className="text-sm">
      <span className="font-medium">{name.get(m.author_id)}</span> <time className="text-xs text-navy-500" dateTime={m.created_at}>{new Date(m.created_at).toLocaleString()}</time>
      <p className="whitespace-pre-wrap break-words">{m.body}</p>
      {m.document_id && docName.has(m.document_id) && <Link href={`/projects/${projectId}/documents/${m.document_id}`} className="mt-1 inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-brand"><FileText size={12} />{docName.get(m.document_id)}</Link>}
      {m.author_id === user.id && <span className="ml-3"><DeleteMessage projectId={projectId} id={m.id} /></span>}
    </div>);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Discussions</h1>
      <Card><Composer projectId={projectId} others={others} docs={docs ?? []} /></Card>
      {threads.length === 0 && <Card className="py-8 text-center text-sm text-navy-500">No messages yet. Start the conversation, share a document link, or @mention your collaborator.</Card>}
      {threads.map((t) => (
        <Card key={t.id} className="space-y-3">
          <Msg m={t} />
          {replies(t.id).map((r) => <div key={r.id} className="ml-5 border-l-2 border-slate-200 pl-3"><Msg m={r} /></div>)}
          <ReplyToggle projectId={projectId} parentId={t.id} others={others} docs={docs ?? []} />
        </Card>))}
    </div>
  );
}
