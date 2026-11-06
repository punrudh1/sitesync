'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, MoveHorizontal, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { AnnotationLayer, type Draft } from '@/components/markup/annotation-layer';
import { AnnotationPanel } from '@/components/markup/annotation-panel';
import { MarkupToolbar } from '@/components/markup/toolbar';
import type { Annotation, Markup, Tool } from '@/lib/markup';
import type { PDFDocumentProxy, PDFRenderTask } from 'pdfjs-dist';

const tb = 'rounded p-1.5 hover:bg-slate-100 disabled:opacity-40';
type Fit = 'width' | 'page' | 'custom';

function Thumb({ pdf, n, active, onClick }: { pdf: PDFDocumentProxy; n: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 0.2 });
      const c = ref.current; if (!c || cancelled) return;
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvas: c, viewport: vp }).promise.catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [pdf, n]);
  return (
    <button onClick={onClick} aria-label={`Go to page ${n}`} aria-current={active} className={`block w-full rounded border p-1 text-xs ${active ? 'border-brand bg-brand-light' : 'border-slate-200 hover:bg-slate-100'}`}>
      <canvas ref={ref} className="mx-auto max-w-full bg-white" />{n}
    </button>
  );
}

export function PdfViewer({ url, name, markup }: { url: string; name: string; markup?: Markup }) {
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<PDFRenderTask | null>(null);
  const renderSequence = useRef(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState<Fit>('width');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string>();
  const [thumbs, setThumbs] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>();
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const numbering = new Map((markup?.annotations ?? []).map((a, i) => [a.id, i + 1]));
  const pick = (a: Annotation) => { setSelectedId(a.id); setPage(a.page_number); };

  useEffect(() => {
    let task: { destroy: () => Promise<void> } | undefined;
    (async () => {
      try {
        const lib = await import('pdfjs-dist');
        lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const t = lib.getDocument({ url, withCredentials: true });
        task = t;
        setPdf(await t.promise);
      } catch { setError('This PDF could not be loaded. Try downloading it instead.'); }
    })();
    return () => { renderTask.current?.cancel(); renderTask.current = null; task?.destroy(); };
  }, [url]);

  const render = useCallback(async () => {
    if (!pdf || !canvas.current || !area.current) return;
    const sequence = ++renderSequence.current;
    renderTask.current?.cancel();
    renderTask.current = null;
    const p = await pdf.getPage(page);
    if (sequence !== renderSequence.current || !canvas.current || !area.current) return;
    const base = p.getViewport({ scale: 1 });
    const availW = area.current.clientWidth - 24, availH = area.current.clientHeight - 24;
    const scale = fit === 'width' ? availW / base.width : fit === 'page' ? Math.min(availW / base.width, availH / base.height) : zoom;
    const vp = p.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
    const c = canvas.current;
    c.width = vp.width; c.height = vp.height;
    c.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`;
    c.style.height = `${vp.height / (window.devicePixelRatio || 1)}px`;
    setSize({ w: vp.width / (window.devicePixelRatio || 1), h: vp.height / (window.devicePixelRatio || 1) });
    if (fit !== 'custom') setZoom(scale);
    const task = p.render({ canvas: c, viewport: vp });
    renderTask.current = task;
    try {
      await task.promise;
    } catch (err) {
      // Rendering is intentionally cancelled when the page, zoom, or viewport changes.
      if (!(err instanceof Error && err.name === 'RenderingCancelledException')) throw err;
    } finally {
      if (renderTask.current === task) renderTask.current = null;
    }
  }, [pdf, page, fit, zoom]);

  useEffect(() => {
    void render().catch(() => setError('This PDF page could not be rendered. Try downloading the original file.'));
    return () => { renderSequence.current += 1; renderTask.current?.cancel(); renderTask.current = null; };
  }, [render]);
  useEffect(() => {
    if (fit === 'custom' || !area.current) return;
    const ro = new ResizeObserver(() => render()); ro.observe(area.current); return () => ro.disconnect();
  }, [fit, render]);

  const pages = pdf?.numPages ?? 0;
  const go = (n: number) => setPage(Math.min(pages, Math.max(1, n)));
  const by = (f: number) => { setFit('custom'); setZoom((z) => Math.min(6, Math.max(0.2, z * f))); };

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  return (
    <div ref={wrap} className="flex h-[calc(100vh-9rem)] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-1.5 text-sm">
        <button className={tb} onClick={() => setThumbs((t) => !t)} aria-pressed={thumbs}>Pages</button>
        <button className={tb} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button>
        <label className="flex items-center gap-1"><span className="sr-only">Page</span>
          <input type="number" min={1} max={pages || 1} value={page} onChange={(e) => go(Number(e.target.value) || 1)} className="w-14 rounded border border-slate-300 px-1 py-0.5 text-center" /> / {pages || '–'}</label>
        <button className={tb} disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight size={18} /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button className={tb} onClick={() => by(1 / 1.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className={tb} onClick={() => by(1.25)} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <button className={tb} onClick={() => setFit('width')} aria-pressed={fit === 'width'} aria-label="Fit to width"><MoveHorizontal size={18} /></button>
        <button className={tb} onClick={() => setFit('page')} aria-pressed={fit === 'page'} aria-label="Fit to page"><Maximize2 size={18} /></button>
        <button className={tb} onClick={() => wrap.current?.requestFullscreen?.()} aria-label="Full screen"><Expand size={18} /></button>
        {markup && <MarkupToolbar tool={tool} onTool={(id) => { setTool(id); if (id === 'select') setDraft(null); }} />}
        <span className="ml-2 truncate text-navy-500">{name}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {thumbs && pdf && (
          <div className="w-28 shrink-0 space-y-2 overflow-y-auto border-r border-slate-200 p-2">
            {Array.from({ length: pages }, (_, i) => <Thumb key={i} pdf={pdf} n={i + 1} active={page === i + 1} onClick={() => go(i + 1)} />)}
          </div>)}
        <div ref={area} className="min-w-0 flex-1 overflow-auto bg-slate-100 p-3">
          {!pdf && <p className="p-6 text-center text-sm text-navy-500">Loading drawing…</p>}
          <div className="relative mx-auto w-fit"><canvas ref={canvas} className="bg-white shadow" />
            {markup && size && <AnnotationLayer size={size} page={page} annotations={markup.annotations} numbering={numbering} tool={tool} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setTool('select'); }} onDraft={(d) => { setDraft(d); setTool('select'); }} />}</div>
        </div>
        {markup && <AnnotationPanel markup={markup} page={page} numbering={numbering} selectedId={selectedId} onSelect={pick} draft={draft} onDraftDone={() => setDraft(null)} />}
      </div>
    </div>
  );
}
