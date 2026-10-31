import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BRAND } from './brand';

export const emailPayloadSchema = z.object({
  to: z.string().email().max(254),
  message: z.string().min(1).max(500),
  link: z.string().max(500).nullable().optional(),
  type: z.string().max(50),
  project_id: z.string().uuid().optional(),
});
export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function safeCompare(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only same-site relative links are ever put in an email. */
export function absoluteLink(link: string | null | undefined, siteUrl: string) {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  return siteUrl.replace(/\/+$/, '') + link;
}

export function buildEmail(p: EmailPayload, siteUrl: string) {
  const url = absoluteLink(p.link, siteUrl);
  const subject = `${BRAND.name}: ${p.message.replace(/[\r\n]+/g, ' ').slice(0, 90)}`;
  const text = `${p.message}\n\n${url ? `Open: ${url}\n\n` : ''}You receive this because email notifications are on. Turn them off on your account page.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2 style="margin:0 0 12px;color:#0f172a">${escapeHtml(BRAND.name)}</h2>`
    + `<p style="font-size:15px;color:#1e293b">${escapeHtml(p.message)}</p>`
    + (url ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#c2410c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in ${escapeHtml(BRAND.name)}</a></p>` : '')
    + `<p style="font-size:12px;color:#64748b">You receive this because email notifications are on. Turn them off on your account page.</p></div>`;
  return { subject, text, html };
}

export async function sendViaResend(f: typeof fetch, o: { apiKey: string; from: string; to: string; subject: string; html: string; text: string }) {
  const res = await f('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: o.from, to: [o.to], subject: o.subject, html: o.html, text: o.text }),
  });
  return { ok: res.ok, status: res.status };
}
