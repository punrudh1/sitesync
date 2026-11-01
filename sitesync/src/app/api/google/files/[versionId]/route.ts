import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { googleDriveFetch } from '@/lib/google-drive';

export async function GET(request: NextRequest, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: version } = await supabase.from('document_versions')
    .select('storage_path, storage_provider, mime_type, document_id')
    .eq('id', versionId).maybeSingle();
  if (!version) return new NextResponse('File not found', { status: 404 });

  if (version.storage_provider !== 'google_drive') {
    return NextResponse.json({ error: 'This file is stored in legacy storage.' }, { status: 409 });
  }
  const driveId = version.storage_path.split('/').at(-1);
  if (!driveId) return new NextResponse('Invalid file reference', { status: 500 });

  const { data: doc } = await supabase.from('documents').select('name').eq('id', version.document_id).maybeSingle();
  const upstream = await googleDriveFetch(`files/${encodeURIComponent(driveId)}?alt=media`);
  if (!upstream.ok || !upstream.body) return new NextResponse('Could not retrieve file from Google Drive', { status: upstream.status || 502 });

  const filename = (doc?.name ?? 'download').replace(/[\r\n"]/g, '_');
  const headers = new Headers({
    'content-type': version.mime_type || 'application/octet-stream',
    'content-disposition': `${request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return new Response(upstream.body, { status: 200, headers });
}
