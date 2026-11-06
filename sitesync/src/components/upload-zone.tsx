'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { finalizeUpload, prepareUpload } from '@/app/(app)/projects/[projectId]/documents/actions';
import { validateUpload } from '@/lib/files';
import { putWithProgress } from '@/lib/upload';
import { cn } from '@/lib/utils';

type Item = { id: number; name: string; progress: number; state: 'uploading' | 'done' | 'error'; error?: string };

/** Drag-and-drop / picker upload. With `documentId` it uploads a new version of that document. */
export function UploadZone({ projectId, folderId, documentId, label, notes, multiple = true, compact }: {
  projectId: string; folderId?: string | null; documentId?: string; label?: string; notes?: string; multiple?: boolean; compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const patch = (id: number, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function upload(file: File, id: number) {
    const fail = (error: string) => { patch(id, { state: 'error', error }); toast.error(`${file.name}: ${error}`); };
    const pre = validateUpload(file.name, file.size, file.type);
    if (pre) return fail(pre);
    const prep = await prepareUpload(projectId, { fileName: file.name, size: file.size, mime: file.type, documentId });
    if (!prep.ok) return fail(prep.error);
    let driveFileId: string;
    try { driveFileId = await putWithProgress(prep.uploadUrl, file, (progress) => patch(id, { progress })); }
    catch (e) { return fail(e instanceof Error ? e.message : 'Upload failed'); }
    const fin = await finalizeUpload(projectId, { documentId: prep.documentId, versionId: prep.versionId, path: prep.path, driveFileId, fileName: file.name,
      size: file.size, mime: file.type, folderId, isNewVersion: !!documentId, label, notes });
    if (!fin.ok) return fail(fin.error);
    patch(id, { state: 'done', progress: 100 });
    toast.success(`${file.name} uploaded`);
  }

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, multiple ? 20 : 1);
    const base = Date.now();
    setItems((cur) => [...list.map((f, i) => ({ id: base + i, name: f.name, progress: 0, state: 'uploading' as const })), ...cur]);
    await Promise.all(list.map((f, i) => upload(f, base + i)));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div role="button" tabIndex={0} aria-label="Upload files"
        onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white text-center text-sm text-navy-500 hover:border-brand',
          compact ? 'p-3' : 'p-6', over && 'border-brand bg-brand-light')}>
        <UploadCloud size={compact ? 18 : 24} aria-hidden />
        <span>Drag files here or <span className="text-brand underline">browse</span></span>
        {!compact && <span className="text-xs">PDF, JPG, PNG, DOCX, XLSX, CSV, DWG, DXF, RVT, ZIP, TXT · 100 MB per file</span>}
        <input ref={input} type="file" hidden multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      </div>
      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.slice(0, 8).map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              {i.state === 'done' ? <CheckCircle2 size={16} className="text-green-600" /> : i.state === 'error' ? <XCircle size={16} className="text-red-600" /> : null}
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              {i.state === 'uploading' && <progress className="h-2 w-28" value={i.progress} max={100} aria-label={`Uploading ${i.name}`} />}
              {i.state === 'error' && <span className="text-xs text-red-600">{i.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
