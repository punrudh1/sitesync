'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut, Expand } from 'lucide-react';
import { dxfToModel, type DxfModel } from '@/lib/dxf';

const tb = 'rounded p-1.5 hover:bg-slate-100';

function fitView(m: DxfModel) {
  const { minX, minY, maxX, maxY } = m.bounds!, w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6), pad = Math.max(w, h) * 0.04;
  return { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 };
}

export function DxfViewer({ url, name }: { url: string; name: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [model, setModel] = useState<DxfModel>();
  const [error, setError] = useState<string>();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url); if (!res.ok) throw new Error('download failed');
        const text = await res.text();
        const { default: DxfParser } = await import('dxf-parser');
        const parsed = new DxfParser().parseSync(text);
        if (!parsed) throw new Error('empty');
        const m = dxfToModel(parsed);
        if (cancelled) return;
        if (!m.bounds) { setError('This DXF has no drawable geometry that the preview supports. Download the original to open it in CAD software.'); return; }
        setModel(m); setView(fitView(m));
      } catch { if (!cancelled) setError('This DXF could not be previewed (it may be binary DXF or use unsupported features). Download the original instead.'); }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const fit = () => model?.bounds && setView(fitView(model));
  const zoom = (f: number, cx = 0.5, cy = 0.5) => setView((v) => ({ x: v.x + v.w * cx * (1 - 1 / f), y: v.y + v.h * cy * (1 - 1 / f), w: v.w / f, h: v.h / f }));
  const visibleGroups = useMemo(() => model?.groups.filter((g) => !hidden.has(g.layer)) ?? [], [model, hidden]);

  if (error) return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>;
  return (
    <div ref={wrap} className="flex h-[calc(100vh-9rem)] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-1.5 text-sm">
        <button className={tb} onClick={() => zoom(1 / 1.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <button className={tb} onClick={() => zoom(1.25)} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <button className={tb} onClick={() => fit()} aria-label="Fit to screen"><Maximize2 size={18} /></button>
        <button className={tb} onClick={() => wrap.current?.requestFullscreen?.()} aria-label="Full screen"><Expand size={18} /></button>
        <span className="ml-2 truncate text-navy-500">{name}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <svg ref={svg} role="img" aria-label={`Preview of ${name}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" className="min-h-0 min-w-0 flex-1 touch-none bg-white"
          onWheel={(e) => { const r = svg.current!.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }}
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const d = drag.current; if (!d) return; const r = svg.current!.getBoundingClientRect(); const k = Math.max(view.w / r.width, view.h / r.height); setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) * k, y: d.vy - (e.clientY - d.y) * k })); }}
          onPointerUp={() => (drag.current = null)}>
          {visibleGroups.map((g) => <path key={g.layer + g.color} d={g.d} fill="none" stroke={g.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {model?.texts.filter((t) => !hidden.has(t.layer)).map((t, i) => <text key={i} x={t.x} y={t.y} fontSize={t.h} fill={t.color} transform={t.rot ? `rotate(${(-t.rot * 180) / Math.PI} ${t.x} ${t.y})` : undefined}>{t.value}</text>)}
        </svg>
        <aside aria-label="Layers" className="max-h-40 w-full overflow-y-auto border-t border-slate-200 p-2 text-sm md:max-h-none md:w-56 md:border-l md:border-t-0">
          <p className="mb-1 font-medium">Layers ({model?.layers.length ?? 0})</p>
          {!model && <p className="text-navy-500">Loading drawing…</p>}
          {model?.layers.map((l) => (
            <label key={l.name} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={!hidden.has(l.name)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(l.name) ? n.delete(l.name) : n.add(l.name); return n; })} />
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-slate-300" style={{ background: l.color }} /><span className="truncate">{l.name}</span></label>))}
          {model && <p className="mt-3 text-xs text-navy-500">Simplified preview ({model.entityCount.toLocaleString()} entities){model.truncated ? ' — truncated for performance' : ''}.
            {model.unsupported.length > 0 && <> Not drawn: {model.unsupported.join(', ')}.</>} Download the original for full fidelity.</p>}
        </aside>
      </div>
    </div>
  );
}
