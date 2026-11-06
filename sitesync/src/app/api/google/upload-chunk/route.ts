import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_CHUNK = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const uploadUrl = form.get('uploadUrl');
  const startValue = form.get('start');
  const totalValue = form.get('total');
  const chunk = form.get('chunk');

  if (typeof uploadUrl !== 'string' || typeof startValue !== 'string' ||
      typeof totalValue !== 'string' || !(chunk instanceof File)) {
    return NextResponse.json({ error: 'Invalid upload chunk' }, { status: 400 });
  }

  let target: URL;
  try { target = new URL(uploadUrl); } catch {
    return NextResponse.json({ error: 'Invalid Google upload session' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com' ||
      !(target.pathname === '/upload/drive/v3/files' || target.pathname.startsWith('/upload/drive/v3/files/'))) {
    return NextResponse.json({ error: 'Invalid Google upload session' }, { status: 400 });
  }

  const start = Number(startValue);
  const total = Number(totalValue);
  const end = start + chunk.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(total) || start < 0 ||
      total <= 0 || chunk.size <= 0 || chunk.size > MAX_CHUNK || end >= total) {
    return NextResponse.json({ error: 'Invalid upload range' }, { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(chunk.size),
        'content-range': `bytes ${start}-${end}/${total}`,
      },
      body: await chunk.arrayBuffer(),
      cache: 'no-store',
    });

    if (upstream.status === 308) {
      return NextResponse.json({ done: false, received: upstream.headers.get('range') ?? null });
    }
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 1000);
      return NextResponse.json({ error: `Google Drive upload failed (HTTP ${upstream.status}): ${detail}` }, { status: 502 });
    }

    const result = await upstream.json() as { id?: string };
    if (!result.id) return NextResponse.json({ error: 'Google Drive did not return a file ID' }, { status: 502 });
    return NextResponse.json({ done: true, id: result.id });
  } catch (error) {
    console.error('Google Drive chunk transfer failed:', error);
    return NextResponse.json({ error: 'Could not transfer this upload chunk to Google Drive' }, { status: 502 });
  }
}
