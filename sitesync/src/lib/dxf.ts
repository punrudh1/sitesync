// Converts a parsed DXF (from dxf-parser) into SVG-ready geometry. Pure functions so they can be unit-tested.
// Y is flipped (CAD is Y-up, SVG is Y-down). Arcs/circles/bulges are sampled into short segments.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DxfGroup = { layer: string; color: string; d: string };
export type DxfText = { layer: string; color: string; x: number; y: number; h: number; rot: number; value: string };
export type DxfModel = {
  groups: DxfGroup[]; texts: DxfText[]; layers: { name: string; color: string }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null; entityCount: number; truncated: boolean; unsupported: string[];
};
type M = [number, number, number, number, number, number]; // a b c d e f  (x' = a x + c y + e, y' = b x + d y + f)
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const SEG = Math.PI / 60; // 3 degrees per sample

export function aciHex(c: unknown): string | null {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const h = (c & 0xffffff).toString(16).padStart(6, '0');
  return h === 'ffffff' ? '#111111' : `#${h}`; // white is invisible on a light background
}

export function arcPoints(cx: number, cy: number, r: number, a1: number, a2: number): [number, number][] {
  let sweep = a2 - a1; while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.min(240, Math.ceil(sweep / SEG)));
  return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(a1 + (sweep * i) / n), cy + r * Math.sin(a1 + (sweep * i) / n)] as [number, number]);
}

/** Expands a polyline with bulges (arc segments) into plain points. */
export function bulgePoints(verts: { x: number; y: number; bulge?: number }[], closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const p = verts[i], q = verts[(i + 1) % verts.length], b = p.bulge ?? 0;
    out.push([p.x, p.y]);
    if (b) {
      const theta = 4 * Math.atan(b), chord = Math.hypot(q.x - p.x, q.y - p.y);
      if (chord > 0) {
        const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
        const nx = -(q.y - p.y) / chord, ny = (q.x - p.x) / chord, sgn = (b > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
        const cx = mx + nx * h * sgn * -1, cy = my + ny * h * sgn * -1;
        const a1 = Math.atan2(p.y - cy, p.x - cx);
        const n = Math.max(2, Math.ceil(Math.abs(theta) / SEG));
        for (let k = 1; k < n; k++) { const a = a1 + (theta * k) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      }
    }
  }
  const last = closed ? verts[0] : verts[verts.length - 1];
  out.push([last.x, last.y]);
  return out;
}

export function dxfToModel(dxf: any, limit = 150000): DxfModel {
  const layerTable: Record<string, any> = dxf?.tables?.layer?.layers ?? {};
  const layerColor = (n: string) => aciHex(layerTable[n]?.color) ?? '#111111';
  const groups = new Map<string, DxfGroup>();
  const texts: DxfText[] = [];
  const unsupported = new Set<string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0, truncated = false;
  const seenLayers = new Set<string>();

  const grow = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  const path = (e: any, m: M, pts: [number, number][], closed = false) => {
    if (pts.length < 2) return;
    const layer = String(e.layer ?? '0'), color = aciHex(e.color) ?? layerColor(layer);
    seenLayers.add(layer);
    const key = `${layer}|${color}`;
    let g = groups.get(key); if (!g) groups.set(key, (g = { layer, color, d: '' }));
    g.d += pts.map(([x, y], i) => { const [tx, ty] = apply(m, x, y); grow(tx, -ty); return `${i ? 'L' : 'M'}${+tx.toFixed(3)} ${+(-ty).toFixed(3)}`; }).join('') + (closed ? 'Z' : '');
  };

  const draw = (e: any, m: M, depth: number) => {
    if (truncated) return;
    if (++count > limit) { truncated = true; return; }
    switch (e.type) {
      case 'LINE': path(e, m, (e.vertices ?? []).map((v: any) => [v.x, v.y])); break;
      case 'LWPOLYLINE': case 'POLYLINE': {
        const v = (e.vertices ?? []).filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (v.length >= 2) path(e, m, bulgePoints(v, !!e.shape), false);
        break; }
      case 'CIRCLE': path(e, m, arcPoints(e.center.x, e.center.y, e.radius, 0, Math.PI * 2)); break;
      case 'ARC': path(e, m, arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle)); break;
      case 'ELLIPSE': {
        const mx = e.majorAxisEndPoint?.x ?? 1, my = e.majorAxisEndPoint?.y ?? 0, a = Math.hypot(mx, my), b = a * (e.axisRatio ?? 1), rot = Math.atan2(my, mx);
        const s = e.startAngle ?? 0; let t = e.endAngle ?? Math.PI * 2; if (t <= s) t += Math.PI * 2;
        const n = Math.max(12, Math.ceil((t - s) / SEG));
        path(e, m, Array.from({ length: n + 1 }, (_, i) => { const u = s + ((t - s) * i) / n; const x = a * Math.cos(u), y = b * Math.sin(u); return [e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number]; }));
        break; }
      case 'SPLINE': { const pts = (e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? []).map((v: any) => [v.x, v.y] as [number, number]); path(e, m, pts); break; }
      case 'TEXT': case 'MTEXT': {
        if (texts.length >= 4000) break;
        const p = e.startPoint ?? e.position; if (!p) break;
        const [tx, ty] = apply(m, p.x, p.y); const layer = String(e.layer ?? '0'); seenLayers.add(layer);
        const h = (e.textHeight ?? e.height ?? 2.5) * Math.hypot(m[0], m[1]);
        grow(tx, -ty);
        texts.push({ layer, color: aciHex(e.color) ?? layerColor(layer), x: tx, y: -ty, h, rot: ((e.rotation ?? 0) * Math.PI) / 180, value: String(e.text ?? '').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').replace(/\\P/g, ' ') });
        break; }
      case 'INSERT': case 'DIMENSION': {
        const name = e.type === 'INSERT' ? e.name : e.block;
        const block = name && dxf?.blocks?.[name]; if (!block || depth > 8) { if (!block) unsupported.add(e.type); break; }
        let t: M = I;
        if (e.type === 'INSERT') {
          const r = ((e.rotation ?? 0) * Math.PI) / 180, sx = e.xScale ?? 1, sy = e.yScale ?? 1, c = Math.cos(r), s = Math.sin(r);
          const base = block.position ?? { x: 0, y: 0 };
          t = mul([1, 0, 0, 1, e.position?.x ?? 0, e.position?.y ?? 0], mul([c, s, -s, c, 0, 0], mul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -base.x, -base.y])));
        }
        for (const child of block.entities ?? []) draw(child, mul(m, t), depth + 1);
        break; }
      default: unsupported.add(String(e.type));
    }
  };

  for (const e of dxf?.entities ?? []) draw(e, I, 0);
  const names = [...seenLayers].sort();
  return {
    groups: [...groups.values()], texts, layers: names.map((name) => ({ name, color: layerColor(name) })),
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null, entityCount: Math.min(count, limit), truncated, unsupported: [...unsupported].sort(),
  };
}
