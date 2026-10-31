export type Tool = 'select' | 'pin' | 'text' | 'arrow' | 'rectangle' | 'cloud';
export type Coords = Record<string, number>;
export type Annotation = { id: string; page_number: number; author_id: string; type: Exclude<Tool, 'select'>; coordinates: Coords; body: string; resolved: boolean; created_at: string };
export type Reply = { id: string; annotation_id: string; author_id: string; body: string; created_at: string };
export type Markup = { projectId: string; documentId: string; versionId: string; userId: string; annotations: Annotation[]; replies: Reply[]; people: Record<string, string> };

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Cloud-style revision marker: scalloped outline around a rectangle, in pixel space. */
export function cloudPath(x: number, y: number, w: number, h: number, bump = 10): string {
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / (bump * 1.6)));
    const r = len / n / 1.6;
    let d = '';
    for (let i = 1; i <= n; i++) d += `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x1 + ((x2 - x1) * i) / n).toFixed(2)} ${(y1 + ((y2 - y1) * i) / n).toFixed(2)} `;
    return d;
  };
  return `M ${x} ${y} ${edge(x, y, x + w, y)}${edge(x + w, y, x + w, y + h)}${edge(x + w, y + h, x, y + h)}${edge(x, y + h, x, y)}Z`;
}

/** Anchor point (normalised) used for the numbered marker. */
export const anchorOf = (a: Pick<Annotation, 'type' | 'coordinates'>) =>
  a.type === 'arrow' ? { x: a.coordinates.x1, y: a.coordinates.y1 } : { x: a.coordinates.x, y: a.coordinates.y };

/** Normalised rect from two drag points, regardless of drag direction. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
