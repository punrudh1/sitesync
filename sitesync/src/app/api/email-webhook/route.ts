import { buildEmail, emailPayloadSchema, safeCompare, sendViaResend } from '@/lib/email';

// Called by the database (pg_net) when a notification is created. Authenticated by a shared secret, not a user session.
export async function POST(req: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET, apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !apiKey || !from || !site) return Response.json({ error: 'Email is not configured' }, { status: 503 });
  if (!safeCompare(req.headers.get('x-webhook-secret') ?? '', secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.text();
  if (raw.length > 10_000) return Response.json({ error: 'Payload too large' }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = emailPayloadSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 });

  const mail = buildEmail(parsed.data, site);
  const r = await sendViaResend(fetch, { apiKey, from, to: parsed.data.to, ...mail }).catch(() => ({ ok: false, status: 0 }));
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: 'Email provider rejected the request' }, { status: 502 });
}
