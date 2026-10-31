'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteMessage, postMessage } from './actions';

export function Composer({ projectId, parentId, others, docs, onDone, autoFocus }: {
  projectId: string; parentId?: string; others: string[]; docs: { id: string; name: string }[]; onDone?: () => void; autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const [doc, setDoc] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = () => start(async () => {
    const r = await postMessage(projectId, { body, parentId: parentId ?? null, documentId: doc || null });
    if (r.ok) { setBody(''); setDoc(''); onDone?.(); router.refresh(); } else toast.error(r.error);
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-2">
      <label className="sr-only" htmlFor={`m-${parentId ?? 'new'}`}>{parentId ? 'Reply' : 'New message'}</label>
      <textarea id={`m-${parentId ?? 'new'}`} autoFocus={autoFocus} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) send(); }}
        rows={parentId ? 2 : 3} maxLength={8000} placeholder={parentId ? 'Write a reply…' : 'Message your team… (Ctrl+Enter to send)'} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {others.map((n) => <button type="button" key={n} onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${n} `)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100">@{n}</button>)}
        <select value={doc} onChange={(e) => setDoc(e.target.value)} aria-label="Attach a document link" className="max-w-48 rounded border border-slate-300 bg-white px-2 py-1">
          <option value="">Attach document link…</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <span className="ml-auto flex gap-2">{onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}<Button disabled={pending || !body.trim()}>{pending ? 'Sending…' : parentId ? 'Reply' : 'Send'}</Button></span>
      </div>
    </form>
  );
}

export function ReplyToggle({ projectId, parentId, others, docs }: { projectId: string; parentId: string; others: string[]; docs: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-brand hover:underline">Reply</button>;
  return <div className="mt-2"><Composer projectId={projectId} parentId={parentId} others={others} docs={docs} onDone={() => setOpen(false)} autoFocus /></div>;
}

export function DeleteMessage({ projectId, id }: { projectId: string; id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button disabled={pending} onClick={() => confirm('Delete this message and its replies?') && start(async () => { const r = await deleteMessage(projectId, id); r.ok ? router.refresh() : toast.error(r.error); })} className="text-xs text-navy-500 hover:underline">Delete</button>;
}
