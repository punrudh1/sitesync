import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { formatBytes, kindOf } from '@/lib/files';
import { NewVersionPanel, VersionRowActions } from './version-controls';

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ projectId: string; documentId: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { projectId, documentId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).eq('project_id', projectId).maybeSingle();
  if (!doc) notFound();
  const [{ data: versions }, { data: members }, { data: folder }] = await Promise.all([
    supabase.from('document_versions').select('id, version_number, revision_label, revision_notes, mime_type, file_size, uploaded_by, created_at').eq('document_id', documentId).order('version_number', { ascending: false }),
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
    doc.folder_id ? supabase.from('folders').select('name').eq('id', doc.folder_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const who = new Map((members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return [m.user_id, p?.full_name || p?.email || 'Unknown']; }));
  const current = versions?.find((v) => v.id === doc.current_version_id);
  const canView = kindOf(doc.extension) !== 'other';
  const A = versions?.find((v) => v.id === sp.a), B = versions?.find((v) => v.id === sp.b);
  const fields: [string, (v: NonNullable<typeof A>) => string][] = [
    ['Version', (v) => `v${v.version_number}`], ['Label', (v) => v.revision_label || '—'], ['Notes', (v) => v.revision_notes || '—'],
    ['Size', (v) => formatBytes(v.file_size)], ['File type', (v) => v.mime_type || '—'], ['Uploaded by', (v) => who.get(v.uploaded_by) ?? '—'], ['Uploaded', (v) => new Date(v.created_at).toLocaleString()],
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}/documents${doc.folder_id ? `?folder=${doc.folder_id}` : ''}`} className="text-sm text-navy-500 hover:underline">← {folder?.name ?? 'Project root'}</Link>
        <h1 className="mt-1 break-words text-2xl font-semibold">{doc.name}</h1>
        {['dwg', 'rvt'].includes(doc.extension) && <p className="mt-1 text-xs text-navy-500">{doc.extension.toUpperCase()} files are stored and downloadable, but cannot currently be previewed in the browser. For Revit models, download the RVT file and open it in Autodesk Revit.</p>}
        {canView && current && <Link href={`/projects/${projectId}/documents/${documentId}/view`} className="mt-2 inline-block text-sm font-medium text-brand underline">Open in viewer</Link>}
      </div>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-navy-500">Current version</dt><dd>v{current?.version_number}{current?.revision_label ? ` · ${current.revision_label}` : ''}</dd></div>
          <div><dt className="text-navy-500">Size</dt><dd>{current ? formatBytes(current.file_size) : '—'}</dd></div>
          <div><dt className="text-navy-500">Uploaded by</dt><dd>{who.get(doc.uploaded_by)} on {new Date(doc.created_at).toLocaleDateString()}</dd></div>
          <div><dt className="text-navy-500">Last modified by</dt><dd>{who.get(doc.last_modified_by)} on {new Date(doc.updated_at).toLocaleString()}</dd></div>
          <div><dt className="text-navy-500">Status</dt><dd className="capitalize">{doc.status.replace('_', ' ')}</dd></div>
          <div><dt className="text-navy-500">Format</dt><dd className="uppercase">{doc.extension}</dd></div>
        </dl>
      </Card>
      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-medium">Version history</h2>
        <table className="mt-2 w-full min-w-[640px] text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-left text-navy-700"><tr>
            <th className="px-3 py-2 font-medium">Version</th><th className="px-3 py-2 font-medium">Notes</th><th className="px-3 py-2 font-medium">Uploaded</th><th className="px-3 py-2 font-medium">Size</th><th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {versions?.map((v) => (
              <tr key={v.id} className={v.id === doc.current_version_id ? 'bg-brand-light/60' : ''}>
                <td className="px-3 py-2 whitespace-nowrap font-medium">v{v.version_number}{v.revision_label ? ` · ${v.revision_label}` : ''}{v.id === doc.current_version_id && <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] uppercase text-white">Current</span>}</td>
                <td className="px-3 py-2">{v.revision_notes || <span className="text-navy-500">—</span>}</td>
                <td className="px-3 py-2">{who.get(v.uploaded_by)}<br /><span className="text-xs text-navy-500">{new Date(v.created_at).toLocaleString()}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{formatBytes(v.file_size)}</td>
                <td className="px-3 py-2"><div className="flex items-center justify-end gap-1">
                  <Link href={`?a=${sp.a && !sp.b && sp.a !== v.id ? sp.a : v.id}&b=${sp.a && !sp.b && sp.a !== v.id ? v.id : ''}`} className="rounded px-2 py-1 text-xs hover:bg-slate-100">{sp.a && !sp.b && sp.a !== v.id ? 'Compare with selected' : 'Select to compare'}</Link>
                  <VersionRowActions projectId={projectId} documentId={documentId} versionId={v.id} isCurrent={v.id === doc.current_version_id} /></div></td>
              </tr>))}
          </tbody>
        </table>
      </Card>
      {A && B && (
        <Card>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-medium">Compare v{A.version_number} and v{B.version_number}</h2><Link href="?" className="text-xs underline">Clear</Link></div>
          <p className="mb-2 text-xs text-navy-500">Compares version metadata only, not file contents.</p>
          <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
            {fields.map(([k, f]) => { const x = f(A), y = f(B); return (
              <tr key={k} className={x !== y ? 'bg-amber-50' : ''}><th scope="row" className="py-1.5 pr-3 text-left font-medium">{k}</th><td className="py-1.5 pr-3">{x}</td><td className="py-1.5">{y}</td></tr>); })}
          </tbody></table>
        </Card>
      )}
      <Card><h2 className="mb-3 font-medium">Upload a new version</h2><NewVersionPanel projectId={projectId} documentId={documentId} extension={doc.extension} /></Card>
    </div>
  );
}
