'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Annotation, type Markup } from '@/lib/markup';
import { createAnnotation, deleteAnnotation, replyToAnnotation, setAnnotationResolved } from '@/app/(app)/projects/[projectId]/documents/[documentId]/view/actions';
import type { Draft } from './annotation-layer';

const TYPE_LABEL: Record<string, string> = { pin: 'Pin comment', text: 'Text note', arrow: 'Arrow', rectangle: 'Rectangle', cloud: 'Revision cloud' };

export function AnnotationPanel({ markup, page, numbering, selectedId, onSelect, draft, onDraftDone }: {
  markup: Markup; page: number; numbering: Map<string, number>; selectedId: string | null; onSelect: (a: Annotation) => void; draft: Draft | null; onDraftDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAll, setShowAll] = useState(false);
  const [body, setBody] = useState('');
  const [reply, setReply] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => { const r = await fn(); if (r.ok) { after?.(); router.refresh(); } else toast.error(r.error); });
  const list = markup.annotations.filter((a) => showAll || a.page_number === page);
  const who = (id: string) => markup.people[id] ?? 'Unknown';

  return (
    <aside aria-label="Markup comments" className="flex w-full flex-col border-t border-slate-200 md:w-80 md:shrink-0 md:border-l md:border-t-0">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm">
        <span className="font-medium">Comments ({list.length})</span>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />All pages</label>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {draft && (
          <form className="space-y-2 rounded-md border border-brand bg-brand-light p-2" onSubmit={(e) => { e.preventDefault();
            run(() => createAnnotation(markup.projectId, markup.documentId, markup.versionId, draft.page, { type: draft.type, coordinates: draft.coordinates }, body), () => { setBody(''); onDraftDone(); }); }}>
            <p className="font-medium">New {TYPE_LABEL[draft.type].toLowerCase()} · page {draft.page}</p>
            <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3} required={draft.type === 'text'} aria-label="Comment text"
              placeholder={draft.type === 'text' ? 'Note text (required)' : 'Add a comment (optional)'} className="w-full rounded border border-slate-300 px-2 py-1" />
            <div className="flex gap-2"><Button disabled={pending}>Save</Button><Button type="button" variant="ghost" onClick={() => { setBody(''); onDraftDone(); }}>Cancel</Button></div>
          </form>)}
        {list.length === 0 && !draft && <p className="text-navy-500">No comments on {showAll ? 'this drawing' : 'this page'} yet. Pick a tool in the toolbar and click or drag on the drawing.</p>}
        {list.map((a) => (
          <div key={a.id} className={`rounded-md border p-2 ${a.id === selectedId ? 'border-brand' : 'border-slate-200'} ${a.resolved ? 'opacity-70' : ''}`}>
            <button className="w-full text-left" onClick={() => onSelect(a)}>
              <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{numbering.get(a.id)}</span>
              <span className="font-medium">{who(a.author_id)}</span> <span className="text-xs text-navy-500">{TYPE_LABEL[a.type]} · p.{a.page_number} · {new Date(a.created_at).toLocaleString()}</span>
              {a.resolved && <span className="ml-1 rounded bg-green-100 px-1 text-[10px] uppercase text-green-800">Resolved</span>}
              {a.body && <p className="mt-1 whitespace-pre-wrap break-words">{a.body}</p>}
            </button>
            {markup.replies.filter((r) => r.annotation_id === a.id).map((r) => (
              <div key={r.id} className="ml-3 mt-2 border-l-2 border-slate-200 pl-2"><span className="font-medium">{who(r.author_id)}</span> <span className="text-xs text-navy-500">{new Date(r.created_at).toLocaleString()}</span><p className="whitespace-pre-wrap break-words">{r.body}</p></div>))}
            <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); run(() => replyToAnnotation(markup.projectId, a.id, reply[a.id] ?? ''), () => setReply((s) => ({ ...s, [a.id]: '' }))); }}>
              <input aria-label="Reply" value={reply[a.id] ?? ''} onChange={(e) => setReply((s) => ({ ...s, [a.id]: e.target.value }))} placeholder="Reply…" maxLength={4000} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
              <button disabled={pending || !(reply[a.id] ?? '').trim()} className="rounded border border-slate-300 px-2 text-xs hover:bg-slate-100 disabled:opacity-50">Send</button>
            </form>
            <div className="mt-1 flex gap-2 text-xs">
              <button disabled={pending} onClick={() => run(() => setAnnotationResolved(markup.projectId, a.id, !a.resolved))} className="inline-flex items-center gap-1 text-navy-700 hover:underline">
                {a.resolved ? <><RotateCcw size={12} />Reopen</> : <><CheckCircle2 size={12} />Resolve</>}</button>
              {a.author_id === markup.userId && <button disabled={pending} onClick={() => confirm('Delete this markup and its replies?') && run(() => deleteAnnotation(markup.projectId, a.id))} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Trash2 size={12} />Delete</button>}
            </div>
          </div>))}
      </div>
    </aside>
  );
}
