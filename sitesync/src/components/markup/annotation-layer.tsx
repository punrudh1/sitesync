'use client';

import { useRef, useState } from 'react';
import { type Annotation, type Tool, anchorOf, clamp01, cloudPath, rectFrom } from '@/lib/markup';

export type Draft = { type: Exclude<Tool, 'select'>; coordinates: Record<string, number>; page: number };
type Pt = { x: number; y: number };
const COLOR = '#c2410c', DONE = '#16a34a';

function Shape({ a, w, h, sel, n, preview }: { a: Pick<Annotation, 'type' | 'coordinates' | 'body' | 'resolved'>; w: number; h: number; sel?: boolean; n?: number; preview?: boolean }) {
  const c = a.coordinates, col = a.resolved ? DONE : COLOR, sw = sel ? 3.5 : 2.25;
  const common = { stroke: col, strokeWidth: sw, fill: 'none', opacity: a.resolved ? 0.6 : 1, strokeDasharray: preview ? '5 4' : undefined } as const;
  const an = anchorOf(a as Annotation), ax = an.x * w, ay = an.y * h;
  return (
    <g>
      {a.type === 'rectangle' && <rect x={c.x * w} y={c.y * h} width={c.w * w} height={c.h * h} {...common} />}
      {a.type === 'cloud' && <path d={cloudPath(c.x * w, c.y * h, c.w * w, c.h * h)} {...common} />}
      {a.type === 'arrow' && (() => {
        const x1 = c.x1 * w, y1 = c.y1 * h, x2 = c.x2 * w, y2 = c.y2 * h, ang = Math.atan2(y2 - y1, x2 - x1), L = 12;
        const p = (d: number) => `${x2 - L * Math.cos(ang + d)},${y2 - L * Math.sin(ang + d)}`;
        return <g {...common}><line x1={x1} y1={y1} x2={x2} y2={y2} /><polyline points={`${p(0.45)} ${x2},${y2} ${p(-0.45)}`} /></g>;
      })()}
      {a.type === 'pin' && <circle cx={ax} cy={ay} r={sel ? 9 : 7} fill={col} fillOpacity={0.25} stroke={col} strokeWidth={sw} />}
      {a.type === 'text' && a.body && (
        <text x={ax + 4} y={ay} fontSize={13} fontWeight={600} fill={col} stroke="#fff" strokeWidth={3} paintOrder="stroke">{a.body.slice(0, 60)}</text>)}
      {a.type === 'text' && <circle cx={ax} cy={ay} r={3} fill={col} />}
      {n !== undefined && (<g><circle cx={ax - 10} cy={ay - 10} r={9} fill={col} /><text x={ax - 10} y={ay - 6} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">{n}</text></g>)}
    </g>
  );
}

export function AnnotationLayer({ size, page, annotations, numbering, tool, selectedId, onSelect, onDraft }: {
  size: { w: number; h: number }; page: number; annotations: Annotation[]; numbering: Map<string, number>; tool: Tool;
  selectedId: string | null; onSelect: (id: string) => void; onDraft: (d: Draft) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [start, setStart] = useState<Pt | null>(null);
  const [cur, setCur] = useState<Pt | null>(null);
  const norm = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const drawing = tool !== 'select';

  const finish = (end: Pt) => {
    if (!start) return;
    const s = start; setStart(null); setCur(null);
    if (tool === 'rectangle' || tool === 'cloud') {
      const r = rectFrom(s, end); if (r.w < 0.005 || r.h < 0.005) return;
      onDraft({ type: tool, coordinates: r, page });
    } else if (tool === 'arrow') {
      if (Math.hypot(end.x - s.x, end.y - s.y) < 0.01) return;
      onDraft({ type: 'arrow', coordinates: { x1: s.x, y1: s.y, x2: end.x, y2: end.y }, page });
    }
  };

  let preview: React.ReactNode = null;
  if (start && cur) {
    if (tool === 'rectangle' || tool === 'cloud') preview = <Shape a={{ type: tool, coordinates: rectFrom(start, cur), body: '', resolved: false }} w={size.w} h={size.h} preview />;
    if (tool === 'arrow') preview = <Shape a={{ type: 'arrow', coordinates: { x1: start.x, y1: start.y, x2: cur.x, y2: cur.y }, body: '', resolved: false }} w={size.w} h={size.h} preview />;
  }

  return (
    <svg ref={ref} width={size.w} height={size.h} className="absolute left-0 top-0 touch-none" role="img" aria-label="Drawing markups"
      style={{ pointerEvents: drawing ? 'auto' : 'none', cursor: drawing ? 'crosshair' : 'default' }}
      onPointerDown={(e) => {
        if (!drawing) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = norm(e);
        if (tool === 'pin' || tool === 'text') return onDraft({ type: tool, coordinates: { x: p.x, y: p.y }, page });
        setStart(p); setCur(p);
      }}
      onPointerMove={(e) => start && setCur(norm(e))}
      onPointerUp={(e) => finish(norm(e))}>
      {annotations.filter((a) => a.page_number === page).map((a) => (
        <g key={a.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSelect(a.id); }}>
          <Shape a={a} w={size.w} h={size.h} sel={a.id === selectedId} n={numbering.get(a.id)} />
        </g>))}
      {preview}
    </svg>
  );
}
