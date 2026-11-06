import Link from 'next/link';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { kindOf } from '@/lib/files';
import type { Annotation, Reply } from '@/lib/markup';
import { DownloadButton } from './download-button';

const PdfViewer = dynamic(() => import('@/components/pdf-viewer').then((m) => m.PdfViewer));
const DxfViewer = dynamic(() => import('@/components/dxf-viewer').then((m) => m.DxfViewer));
const ImageViewer = dynamic(() => import('@/components/image-viewer').then((m) => m.ImageViewer));

export const metadata = { title: 'Viewer' };

export default async function ViewPage({ params, searchParams }: { params: Promise<{ projectId: string; documentId: string }>; searchParams: Promise<{ v?: string }> }) {
  const { projectId, documentId } = await params;
  const { v } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: doc } = await supabase.from('documents').select('id, name, extension, current_version_id').eq('id', documentId).eq('project_id', projectId).maybeSingle();
  if (!doc) notFound();
  const kind = kindOf(doc.extension);
  if (kind === 'other') notFound();
  const { data: ver } = await supabase.from('document_versions').select('id, version_number, storage_path, storage_provider').eq('id', v ?? doc.current_version_id ?? '').eq('document_id', documentId).maybeSingle();
  if (!ver) notFound();
  const [{ data: versions }, { data: anns }, { data: reps }, { data: members }] = await Promise.all([
    supabase.from('document_versions').select('id, version_number, revision_label').eq('document_id', documentId).order('version_number', { ascending: false }),
    kind !== 'dxf' ? supabase.from('drawing_annotations').select('id, page_number, author_id, type, coordinates, body, resolved, created_at').eq('version_id', ver.id).order('created_at') : Promise.resolve({ data: [] }),
    kind !== 'dxf' ? supabase.from('annotation_replies').select('id, annotation_id, author_id, body, created_at').eq('project_id', projectId).order('created_at') : Promise.resolve({ data: [] }),
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
  ]);
  const people = Object.fromEntries((members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return [m.user_id, p?.full_name || p?.email || 'Unknown']; }));
  const annIds = new Set((anns ?? []).map((a) => a.id));
  const markup = { projectId, documentId, versionId: ver.id, userId: user.id, people, annotations: (anns ?? []) as Annotation[], replies: ((reps ?? []) as Reply[]).filter((r) => annIds.has(r.annotation_id)) };
  const fileUrl = ver.storage_provider === 'google_drive' ? `/api/google/files/${ver.id}` : (await supabase.storage.from('project-files').createSignedUrl(ver.storage_path, 3600)).data?.signedUrl;
  if (!fileUrl) notFound();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/projects/${projectId}/documents/${documentId}`} className="text-navy-500 hover:underline">← Document details</Link>
        <span className="font-medium">{doc.name} · v{ver.version_number}</span>
        {versions && versions.length > 1 && (
          <nav aria-label="Versions" className="flex items-center gap-1 text-xs">Version:
            {versions.map((x) => <Link key={x.id} href={`?v=${x.id}`} aria-current={x.id === ver.id} className={`rounded px-1.5 py-0.5 ${x.id === ver.id ? 'bg-brand text-white' : 'border border-slate-300 hover:bg-slate-100'}`}>v{x.version_number}</Link>)}</nav>)}
        <div className="ml-auto"><DownloadButton projectId={projectId} versionId={ver.id} /></div>
      </div>
      {kind === 'pdf' && <PdfViewer url={fileUrl} name={doc.name} markup={markup} />}
      {kind === 'image' && <ImageViewer url={fileUrl} name={doc.name} markup={markup} />}
      {kind === 'dxf' && <><DxfViewer url={fileUrl} name={doc.name} /><p className="text-xs text-navy-500">DXF preview is simplified and read-only. Markups are available on PDF and image drawings.</p></>}
    </div>
  );
}
