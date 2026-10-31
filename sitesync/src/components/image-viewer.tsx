'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut, Expand } from 'lucide-react';
import { AnnotationLayer, type Draft } from '@/components/markup/annotation-layer';
import { AnnotationPanel } from '@/components/markup/annotation-panel';
import { MarkupToolbar } from '@/components/markup/toolbar';
import type { Annotation, Markup, Tool } from '@/lib/markup';

const tb = 'rounded p-1.5 hover:bg-slate-100 disabled:opacity-40';

export function ImageViewer({ url, name, markup }: { url: string; name: string; markup?: Markup }) {
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number }>();
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const numbering = new Map((markup?.annotations ?? []).map((a, i) => [a.id, i + 1]));

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => setAvail({ w: box.current!.clientWidth, h: box.current!.clientHeight }));
    ro.observe(box.current); return () => ro.disconnect();
  }, []);

  // Image is laid out at its "fit to screen" size; zoom/pan are CSS transforms on a wrapper that also holds the markup layer,
  // so normalised markup coordinates stay glued to the picture.
  const fitScale = nat && avail.w ? Math.min((avail.w - 16) / nat.w, (avail.h - 16) / nat.h) : 0;
  const size = nat && fitScale > 0 ? { w: nat.w * fitScale, h: nat.h * fitScale } : undefined;
  const reset = () => { setZoom(1); setPos({ x: 0, y: 0 }); };
  const by = (f: number) => setZoom((z) => Math.min(8, Math.max(0.2, z * f)));

  return (
    <div ref={outer} className="flex h-[calc(100vh-9rem)] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-1.5 text-sm">
        <button className={tb} onClick={() => by(1 / 1.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className={tb} onClick={() => by(1.25)} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <button className={tb} onClick={reset} aria-label="Fit to screen"><Maximize2 size={18} /></button>
        <button className={tb} onClick={() => outer.current?.requestFullscreen?.()} aria-label="Full screen"><Expand size={18} /></button>
        {markup && <MarkupToolbar tool={tool} onTool={(id) => { setTool(id); if (id === 'select') setDraft(null); }} />}
        <span className="ml-2 truncate text-navy-500">{name}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={box} className="relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden bg-slate-100"
          onWheel={(e) => by(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
          onPointerDown={(e) => { if (tool !== 'select') return; drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
          onPointerUp={() => (drag.current = null)}>
          <div className="absolute inset-0 m-auto" style={{ width: size?.w ?? 0, height: size?.h ?? 0, transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, cursor: tool === 'select' ? 'grab' : 'crosshair' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} draggable={false} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} className="h-full w-full select-none bg-white shadow" />
            {markup && size && <AnnotationLayer size={size} page={1} annotations={markup.annotations} numbering={numbering} tool={tool} selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setTool('select'); }} onDraft={(d) => { setDraft(d); setTool('select'); }} />}
          </div>
        </div>
        {markup && <AnnotationPanel markup={markup} page={1} numbering={numbering} selectedId={selectedId} onSelect={(a: Annotation) => setSelectedId(a.id)} draft={draft} onDraftDone={() => setDraft(null)} />}
      </div>
    </div>
  );
}
