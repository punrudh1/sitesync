import Link from 'next/link';
import { ChevronRight, FileText, Folder as FolderIcon } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { UploadZone } from '@/components/upload-zone';
import { ALLOWED, formatBytes } from '@/lib/files';
import { DocActions, FolderActions } from './row-actions';
import { NewFolderButton } from './new-folder';

export const metadata = { title: 'Documents' };
type SP = { folder?: string; q?: string; type?: string; by?: string; mod?: string; sort?: string; dir?: string };

export default async function Documents({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<SP> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: folders }, { data: members }] = await Promise.all([
    supabase.from('folders').select('id, name, parent_id').eq('project_id', projectId).order('name'),
    supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId),
  ]);
  const people = new Map((members ?? []).map((m) => {
    const p = m.profiles as unknown as { full_name: string; email: string } | null;
    return [m.user_id, p?.full_name || p?.email || 'Unknown'];
  }));
  const byId = new Map((folders ?? []).map((f) => [f.id, f]));
  const pathOf = (id: string) => { const out: string[] = []; for (let f = byId.get(id); f; f = f.parent_id ? byId.get(f.parent_id) : undefined) out.unshift(f.name); return out.join(' / '); };
  const folderId = sp.folder && byId.has(sp.folder) ? sp.folder : null;
  const crumbs: { id: string; name: string }[] = [];
  for (let f = folderId ? byId.get(folderId) : undefined; f; f = f.parent_id ? byId.get(f.parent_id) : undefined) crumbs.unshift(f);
  const searching = !!(sp.q || sp.type || sp.by || sp.mod);

  let q = supabase.from('documents').select('id, name, extension, folder_id, status, uploaded_by, last_modified_by, current_version_id, updated_at, created_at').eq('project_id', projectId).limit(500);
  if (!searching) q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null);
  if (sp.q) q = q.ilike('name', `%${sp.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
  if (sp.type && sp.type in ALLOWED) q = q.eq('extension', sp.type);
  if (sp.by && people.has(sp.by)) q = q.eq('uploaded_by', sp.by);
  if (sp.mod && Number(sp.mod) > 0) q = q.gte('updated_at', new Date(Date.now() - Number(sp.mod) * 86400000).toISOString());
  const { data: docs } = await q;

  const verIds = (docs ?? []).map((d) => d.current_version_id).filter(Boolean) as string[];
  const { data: vers } = verIds.length ? await supabase.from('document_versions').select('id, file_size, version_number').in('id', verIds) : { data: [] };
  const vmap = new Map((vers ?? []).map((v) => [v.id, v]));
  const rows = (docs ?? []).map((d) => ({ ...d, size: vmap.get(d.current_version_id!)?.file_size ?? 0, version: vmap.get(d.current_version_id!)?.version_number ?? 1 }));

  const sort = ['name', 'created_at', 'size', 'updated_at'].includes(sp.sort ?? '') ? sp.sort! : 'name';
  const dir = sp.dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const x = a[sort as keyof typeof a], y = b[sort as keyof typeof b];
    return (typeof x === 'string' ? x.localeCompare(y as string, undefined, { numeric: true, sensitivity: 'base' }) : (x as number) - (y as number)) * dir;
  });
  const subfolders = searching ? [] : (folders ?? []).filter((f) => (f.parent_id ?? null) === folderId);

  const qs = (o: Partial<SP>) => { const u = new URLSearchParams(); Object.entries({ ...sp, ...o }).forEach(([k, v]) => v && u.set(k, String(v))); const s = u.toString(); return `/projects/${projectId}/documents${s ? '?' + s : ''}`; };
  const th = (key: string, label: string) => (
    <th scope="col" className="px-3 py-2 text-left font-medium">
      <Link href={qs({ sort: key, dir: sort === key && dir === 1 ? 'desc' : 'asc' })} className="hover:underline">{label}{sort === key ? (dir === 1 ? ' ↑' : ' ↓') : ''}</Link>
    </th>);
  const folderOptions = (folders ?? []).map((f) => ({ id: f.id, label: pathOf(f.id) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <div className="ml-auto"><NewFolderButton projectId={projectId} parentId={folderId} /></div>
      </div>
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm text-navy-500">
        <Link href={`/projects/${projectId}/documents`} className="hover:underline">Project root</Link>
        {crumbs.map((c) => <span key={c.id} className="flex items-center gap-1"><ChevronRight size={14} /><Link href={qs({ folder: c.id, q: undefined, type: undefined, by: undefined, mod: undefined })} className="hover:underline">{c.name}</Link></span>)}
      </nav>

      <form className="flex flex-wrap items-end gap-2 text-sm" role="search">
        {folderId && <input type="hidden" name="folder" value={folderId} />}
        <label className="flex flex-col gap-1">Name<input name="q" defaultValue={sp.q} placeholder="Search all folders" className="rounded-md border border-slate-300 px-2 py-1.5" /></label>
        <label className="flex flex-col gap-1">Type<select name="type" defaultValue={sp.type ?? ''} className="rounded-md border border-slate-300 px-2 py-1.5"><option value="">All</option>{Object.keys(ALLOWED).map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="flex flex-col gap-1">Uploaded by<select name="by" defaultValue={sp.by ?? ''} className="rounded-md border border-slate-300 px-2 py-1.5"><option value="">Anyone</option>{[...people].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="flex flex-col gap-1">Modified<select name="mod" defaultValue={sp.mod ?? ''} className="rounded-md border border-slate-300 px-2 py-1.5"><option value="">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
        <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">Apply</button>
        {searching && <Link href={qs({ q: undefined, type: undefined, by: undefined, mod: undefined })} className="py-1.5 underline">Clear</Link>}
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-navy-700"><tr>
            {th('name', 'Name')}{th('size', 'Size')}<th scope="col" className="px-3 py-2 text-left font-medium">Uploaded by</th>{th('created_at', 'Uploaded')}{th('updated_at', 'Modified')}<th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {subfolders.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-3 py-2" colSpan={5}><Link href={qs({ folder: f.id })} className="flex items-center gap-2 font-medium"><FolderIcon size={16} className="text-brand" />{f.name}</Link></td>
                <td className="px-3 py-2"><FolderActions projectId={projectId} folderId={f.id} name={f.name} /></td>
              </tr>))}
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/projects/${projectId}/documents/${d.id}`} className="flex items-center gap-2 font-medium"><FileText size={16} className="text-navy-500" />{d.name}<span className="rounded bg-slate-100 px-1.5 text-xs font-normal">v{d.version}</span></Link>
                  {searching && d.folder_id && <span className="ml-6 text-xs text-navy-500">{pathOf(d.folder_id)}</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatBytes(d.size)}</td>
                <td className="px-3 py-2">{people.get(d.uploaded_by) ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(d.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(d.updated_at).toLocaleDateString()} <span className="text-xs text-navy-500">by {people.get(d.last_modified_by) ?? '—'}</span></td>
                <td className="px-3 py-2"><DocActions projectId={projectId} documentId={d.id} name={d.name} versionId={d.current_version_id} folders={folderOptions} currentFolder={d.folder_id} /></td>
              </tr>))}
            {!subfolders.length && !rows.length && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-navy-500">{searching ? 'No documents match these filters.' : 'This folder is empty. Upload your first drawing or document below.'}</td></tr>)}
          </tbody>
        </table>
      </Card>
      <UploadZone projectId={projectId} folderId={folderId} />
    </div>
  );
}
