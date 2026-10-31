import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/safe-redirect';
import { projectSchema, signUpSchema } from '../src/lib/validation';

describe('safeNext', () => {
  it('allows same-site paths', () => expect(safeNext('/projects/1')).toBe('/projects/1'));
  it('blocks external and protocol-relative URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('validation', () => {
  it('rejects short passwords', () =>
    expect(signUpSchema.safeParse({ fullName: 'Ann Lee', email: 'a@b.co', password: 'short' }).success).toBe(false));
  it('normalises email', () =>
    expect(signUpSchema.parse({ fullName: 'Ann Lee', email: ' A@B.CO ', password: 'longenough1' }).email).toBe('a@b.co'));
  it('turns empty dates into null', () =>
    expect(projectSchema.parse({ name: 'Bridge', code: 'B-1', startDate: '' }).startDate).toBeNull());
});

describe('invitation token hash', () => {
  it('equals the SHA-256 hex that the SQL accept_invitation function computes', () =>
    expect(createHash('sha256').update('tok123', 'utf8').digest('hex')).toBe(
      '4f6e1f65055263866dedb3c5fe22defb0cc045648cf0b87afac54cc6420e5647'));
});

import { extOf, storageSafeName, validateUpload } from '../src/lib/files';
describe('upload validation', () => {
  it('accepts a PDF', () => expect(validateUpload('plan.pdf', 1000, 'application/pdf')).toBeNull());
  it('accepts DWG with generic or empty MIME', () => {
    expect(validateUpload('site.dwg', 10, '')).toBeNull();
    expect(validateUpload('site.DXF', 10, 'application/octet-stream')).toBeNull();
  });
  it('rejects unsupported extensions, executables and path tricks', () => {
    expect(validateUpload('run.exe', 10, 'application/octet-stream')).toMatch(/not supported/);
    expect(validateUpload('a/b.pdf', 10, 'application/pdf')).toMatch(/Invalid/);
    expect(validateUpload('noext', 10, '')).toMatch(/not supported/);
  });
  it('rejects a PDF whose MIME says otherwise, empty and oversized files', () => {
    expect(validateUpload('x.pdf', 10, 'text/html')).toMatch(/does not match/);
    expect(validateUpload('x.pdf', 0, 'application/pdf')).toMatch(/empty/);
    expect(validateUpload('x.pdf', 101 * 1024 * 1024, 'application/pdf')).toMatch(/100 MB/);
  });
  it('sanitises storage names', () => {
    expect(storageSafeName('Plan (rev 2) é.pdf')).toBe('Plan_rev_2_.pdf');
    expect(extOf('a.b.PDF')).toBe('pdf');
  });
});

import { cloudPath, rectFrom, anchorOf } from '../src/lib/markup';
import { annotationSchema, taskSchema } from '../src/lib/validation';
import { isOverdue, daysUntil } from '../src/lib/tasks';
describe('markup geometry', () => {
  it('builds a closed scalloped cloud path', () => {
    const d = cloudPath(10, 10, 100, 50);
    expect(d.startsWith('M 10 10')).toBe(true); expect(d.endsWith('Z')).toBe(true); expect((d.match(/A /g) ?? []).length).toBeGreaterThan(8);
  });
  it('normalises drag direction', () => {
    const r = rectFrom({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 });
    expect([r.x, r.y]).toEqual([0.2, 0.1]); expect(r.w).toBeCloseTo(0.4); expect(r.h).toBeCloseTo(0.4);
  });
  it('anchors arrows at their tail', () => expect(anchorOf({ type: 'arrow', coordinates: { x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.9 } })).toEqual({ x: 0.1, y: 0.2 }));
  it('rejects out-of-range or mismatched coordinates', () => {
    expect(annotationSchema.safeParse({ type: 'pin', coordinates: { x: 1.2, y: 0.5 } }).success).toBe(false);
    expect(annotationSchema.safeParse({ type: 'arrow', coordinates: { x: 0.1, y: 0.2 } }).success).toBe(false);
    expect(annotationSchema.safeParse({ type: 'cloud', coordinates: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }).success).toBe(true);
  });
});
describe('tasks', () => {
  it('flags overdue only for open tasks', () => {
    expect(isOverdue('2026-01-01', 'todo', '2026-02-01')).toBe(true);
    expect(isOverdue('2026-01-01', 'completed', '2026-02-01')).toBe(false);
    expect(isOverdue(null, 'todo', '2026-02-01')).toBe(false);
    expect(daysUntil('2026-02-04', '2026-02-01')).toBe(3);
  });
  it('validates task input', () => {
    expect(taskSchema.safeParse({ title: '', priority: 'low', status: 'todo' }).success).toBe(false);
    expect(taskSchema.safeParse({ title: 'x', priority: 'urgent', status: 'todo' }).success).toBe(false);
    expect(taskSchema.safeParse({ title: 'x', priority: 'low', status: 'todo', startDate: '2026-02-02', dueDate: '2026-02-01' }).success).toBe(false);
    expect(taskSchema.parse({ title: 'x', priority: 'low', status: 'todo', assigneeId: '' }).assigneeId).toBeNull();
  });
});

import DxfParser from 'dxf-parser';
import { arcPoints, bulgePoints, dxfToModel, aciHex } from '../src/lib/dxf';
const dxfText = (...rows: string[]) => ['0', 'SECTION', '2', 'ENTITIES', ...rows, '0', 'ENDSEC', '0', 'EOF'].join('\n');
const parse = (t: string) => new DxfParser().parseSync(t);
describe('dxf preview geometry', () => {
  it('converts lines, circles, arcs and closed bulged polylines, flipping Y', () => {
    const m = dxfToModel(parse(dxfText('0','LINE','8','WALLS','10','0','20','0','11','100','21','50','0','CIRCLE','8','WALLS','10','50','20','50','40','10','0','ARC','8','ARCS','10','0','20','0','40','20','50','0','51','90','0','LWPOLYLINE','8','WALLS','90','3','70','1','10','0','20','0','42','0.5','10','10','20','0','10','10','20','10'))!);
    expect(m.layers.map((l) => l.name)).toEqual(['ARCS', 'WALLS']);
    expect(m.groups.find((g) => g.layer === 'WALLS')!.d).toContain('L100 -50'); // y flipped
    expect(m.bounds!.minX).toBeLessThanOrEqual(0); expect(m.bounds!.maxX).toBeGreaterThanOrEqual(100);
    expect(m.unsupported).toEqual([]);
  });
  it('samples an arc through its endpoints', () => {
    const p = arcPoints(0, 0, 10, 0, Math.PI / 2);
    expect(p[0][0]).toBeCloseTo(10); expect(p[0][1]).toBeCloseTo(0); expect(p.at(-1)![0]).toBeCloseTo(0); expect(p.at(-1)![1]).toBeCloseTo(10);
  });
  it('bulge of 1 makes a semicircle that bulges to the right of travel (counter-clockwise)', () => {
    const pts = bulgePoints([{ x: 0, y: 0, bulge: 1 }, { x: 10, y: 0 }], false);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(mid[0]).toBeCloseTo(5, 0); expect(mid[1]).toBeCloseTo(-5, 0);
    expect(pts[0]).toEqual([0, 0]); expect(pts.at(-1)).toEqual([10, 0]);
  });
  it('expands block inserts with translation, scale and rotation', () => {
    const m = dxfToModel(parse(['0','SECTION','2','BLOCKS','0','BLOCK','8','0','2','B1','10','0','20','0','0','LINE','8','0','10','0','20','0','11','10','21','0','0','ENDBLK','0','ENDSEC',
      '0','SECTION','2','ENTITIES','0','INSERT','8','0','2','B1','10','100','20','100','41','2','42','2','50','90','0','ENDSEC','0','EOF'].join('\n'))!);
    // line (0,0)->(10,0) scaled x2 -> (20,0), rotated 90deg -> (0,20), moved by (100,100)
    expect(m.groups[0].d).toBe('M100 -100L100 -120');
  });
  it('reports unsupported entities and truncates oversized drawings', () => {
    const m = dxfToModel(parse(dxfText('0','LINE','8','0','10','0','20','0','11','1','21','1','0','LINE','8','0','10','0','20','0','11','2','21','2','0','LINE','8','0','10','0','20','0','11','3','21','3'))!, 2);
    expect(m.truncated).toBe(true);
    expect(aciHex(0xffffff)).toBe('#111111'); expect(aciHex(0xff0000)).toBe('#ff0000'); expect(aciHex(undefined)).toBeNull();
  });
});

import { absoluteLink, buildEmail, emailPayloadSchema, escapeHtml, safeCompare, sendViaResend } from '../src/lib/email';
import { vi, beforeEach, afterEach } from 'vitest';
describe('email building', () => {
  const base = { to: 'bob@x.com', message: 'Alice assigned you "<b>Check rebar</b>"', link: '/projects/p1/tasks/t1', type: 'task_assigned' };
  it('escapes HTML in messages and links', () => {
    const m = buildEmail(base, 'https://app.example/');
    expect(m.html).not.toContain('<b>Check'); expect(m.html).toContain('&lt;b&gt;Check rebar'); expect(m.html).toContain('href="https://app.example/projects/p1/tasks/t1"');
    expect(escapeHtml(`a&b<"'>`)).toBe('a&amp;b&lt;&quot;&#39;&gt;');
  });
  it('never puts external or protocol-relative links in an email', () => {
    expect(absoluteLink('https://evil.com/x', 'https://app.example')).toBeNull();
    expect(absoluteLink('//evil.com', 'https://app.example')).toBeNull();
    expect(absoluteLink('/ok', 'https://app.example/')).toBe('https://app.example/ok');
    expect(buildEmail({ ...base, link: 'https://evil.com' }, 'https://app.example').html).not.toContain('evil.com');
  });
  it('keeps the subject on one line', () => expect(buildEmail({ ...base, message: 'a\nb\r\nc' }, 'https://x').subject).not.toMatch(/[\r\n]/));
  it('validates payloads and compares secrets safely', () => {
    expect(emailPayloadSchema.safeParse({ ...base, to: 'not-an-email' }).success).toBe(false);
    expect(emailPayloadSchema.safeParse({ ...base, message: '' }).success).toBe(false);
    expect(safeCompare('abc', 'abc')).toBe(true); expect(safeCompare('abc', 'abd')).toBe(false); expect(safeCompare('abc', 'abcd')).toBe(false);
  });
  it('posts the expected request to Resend', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const r = await sendViaResend(f as unknown as typeof fetch, { apiKey: 'k', from: 'S <s@x.com>', to: 'bob@x.com', subject: 's', html: 'h', text: 't' });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0]; expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer k'); expect(JSON.parse(init.body)).toMatchObject({ to: ['bob@x.com'], from: 'S <s@x.com>' });
  });
});

describe('email webhook route', () => {
  const env = { ...process.env };
  const req = (body: unknown, secret?: string) => new Request('http://x/api/email-webhook', { method: 'POST', headers: secret ? { 'x-webhook-secret': secret } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const good = { to: 'bob@x.com', message: 'Hello', link: '/p', type: 'mention' };
  beforeEach(() => { Object.assign(process.env, { EMAIL_WEBHOOK_SECRET: 's3', RESEND_API_KEY: 'k', EMAIL_FROM: 'S <s@x.com>', NEXT_PUBLIC_SITE_URL: 'https://app.example' }); });
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
  it('is disabled (503) until configured', async () => {
    delete process.env.RESEND_API_KEY; const { POST } = await import('../src/app/api/email-webhook/route');
    expect((await POST(req(good, 's3'))).status).toBe(503);
  });
  it('rejects a missing or wrong secret (401) before reading anything else', async () => {
    const { POST } = await import('../src/app/api/email-webhook/route');
    expect((await POST(req(good))).status).toBe(401); expect((await POST(req(good, 'nope'))).status).toBe(401);
  });
  it('rejects bad JSON and bad payloads (400)', async () => {
    const { POST } = await import('../src/app/api/email-webhook/route');
    expect((await POST(req('{oops', 's3'))).status).toBe(400); expect((await POST(req({ ...good, to: 'x' }, 's3'))).status).toBe(400);
  });
  it('sends through Resend (200) and reports provider failure (502)', async () => {
    const { POST } = await import('../src/app/api/email-webhook/route');
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 }); vi.stubGlobal('fetch', f);
    expect((await POST(req(good, 's3'))).status).toBe(200); expect(f).toHaveBeenCalledTimes(1);
    f.mockResolvedValue({ ok: false, status: 422 }); expect((await POST(req(good, 's3'))).status).toBe(502);
    f.mockRejectedValue(new Error('network')); expect((await POST(req(good, 's3'))).status).toBe(502);
  });
});
