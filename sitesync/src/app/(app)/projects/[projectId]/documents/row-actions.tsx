'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { deleteDocument, deleteFolder, getDownloadUrl, moveDocument, renameDocument, renameFolder } from './actions';

type Folder = { id: string; label: string };
const btn = 'document-action-button rounded p-1.5 text-navy-500 transition-colors disabled:opacity-50';

export function DocActions({ projectId, documentId, name, versionId, folders, currentFolder }: {
  projectId: string; documentId: string; name: string; versionId: string | null; folders: Folder[]; currentFolder: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); r.ok ? (toast.success(ok), router.refresh()) : toast.error(r.error); });
  return (
    <div className="flex justify-end gap-0.5">
      {versionId && <button className={btn} disabled={pending} aria-label={`Download ${name}`} title="Download" onClick={() => start(async () => {
        const r = await getDownloadUrl(projectId, versionId); r.ok ? (window.location.href = r.url) : toast.error(r.error); })}><Download size={16} /></button>}
      <button className={btn} disabled={pending} aria-label={`Rename ${name}`} title="Rename" onClick={() => {
        const n = prompt('New file name (keep the extension)', name); if (n && n !== name) run(() => renameDocument(projectId, documentId, n), 'Renamed'); }}><Pencil size={16} /></button>
      <label className={btn} title="Move to folder">
        <FolderInput size={16} aria-hidden />
        <select aria-label={`Move ${name} to folder`} className="sr-only" value={currentFolder ?? ''} onChange={(e) => run(() => moveDocument(projectId, documentId, e.target.value || null), 'Moved')}>
          <option value="">Project root</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <button className={btn} disabled={pending} aria-label={`Delete ${name}`} title="Delete" onClick={() => {
        if (confirm(`Delete "${name}" and all of its versions? This cannot be undone.`)) run(() => deleteDocument(projectId, documentId), 'Deleted'); }}><Trash2 size={16} /></button>
    </div>
  );
}

export function FolderActions({ projectId, folderId, name }: { projectId: string; folderId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); r.ok ? (toast.success(ok), router.refresh()) : toast.error(r.error); });
  return (
    <div className="flex justify-end gap-0.5">
      <button className={btn} disabled={pending} aria-label={`Rename folder ${name}`} onClick={() => {
        const n = prompt('Folder name', name); if (n && n !== name) run(() => renameFolder(projectId, folderId, n), 'Renamed'); }}><Pencil size={16} /></button>
      <button className={btn} disabled={pending} aria-label={`Delete folder ${name}`} onClick={() => {
        if (confirm(`Delete folder "${name}" and its subfolders? Documents inside are NOT deleted; they move to the project root.`)) run(() => deleteFolder(projectId, folderId), 'Folder deleted'); }}><Trash2 size={16} /></button>
    </div>
  );
}
