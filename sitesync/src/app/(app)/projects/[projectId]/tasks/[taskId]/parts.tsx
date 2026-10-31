'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addTaskComment, deleteTask, linkDocument, unlinkDocument } from '../actions';

export function DeleteTaskButton({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => {
    if (confirm('Delete this task and its comments? This cannot be undone.')) start(async () => { const r = await deleteTask(projectId, taskId); if (r && !r.ok) toast.error(r.error); });
  }}>Delete</Button>;
}

export function Comments({ projectId, taskId, comments }: { projectId: string; taskId: string; comments: { id: string; author: string; body: string; created_at: string }[] }) {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {comments.length === 0 && <p className="text-sm text-navy-500">No comments yet.</p>}
      <ul className="space-y-3">{comments.map((c) => (
        <li key={c.id} className="text-sm"><span className="font-medium">{c.author}</span> <time className="text-xs text-navy-500">{new Date(c.created_at).toLocaleString()}</time><p className="whitespace-pre-wrap">{c.body}</p></li>))}</ul>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addTaskComment(projectId, taskId, text); if (r.ok) { setText(''); router.refresh(); } else toast.error(r.error); }); }} className="flex gap-2">
        <label className="sr-only" htmlFor="c">Add a comment</label>
        <input id="c" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Add a comment…" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <Button disabled={pending || !text.trim()}>Post</Button>
      </form>
    </div>
  );
}

export function LinkedDocs({ projectId, taskId, linked, available }: { projectId: string; taskId: string; linked: { id: string; name: string }[]; available: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); r.ok ? router.refresh() : toast.error(r.error); });
  return (
    <div className="space-y-3 text-sm">
      {linked.length === 0 && <p className="text-navy-500">No documents linked.</p>}
      <ul className="space-y-1">{linked.map((d) => (
        <li key={d.id} className="flex items-center justify-between"><Link href={`/projects/${projectId}/documents/${d.id}`} className="text-brand underline">{d.name}</Link>
          <button disabled={pending} onClick={() => run(() => unlinkDocument(projectId, taskId, d.id))} className="text-xs text-navy-500 hover:underline">Unlink</button></li>))}</ul>
      {available.length > 0 && (
        <label className="block">Link a document
          <select value="" disabled={pending} onChange={(e) => e.target.value && run(() => linkDocument(projectId, taskId, e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">Choose…</option>{available.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>)}
    </div>
  );
}
