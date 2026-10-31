'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { UploadZone } from '@/components/upload-zone';
import { getDownloadUrl, restoreVersion } from '../actions';

const btn = 'inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50';

export function VersionRowActions({ projectId, documentId, versionId, isCurrent }: { projectId: string; documentId: string; versionId: string; isCurrent: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex justify-end gap-1">
      <button className={btn} disabled={pending} onClick={() => start(async () => { const r = await getDownloadUrl(projectId, versionId); r.ok ? (window.location.href = r.url) : toast.error(r.error); })}><Download size={14} />Download</button>
      {!isCurrent && <button className={btn} disabled={pending} onClick={() => {
        if (!confirm('Make this the current version? Newer versions are kept in the history.')) return;
        start(async () => { const r = await restoreVersion(projectId, documentId, versionId); r.ok ? (toast.success('Version restored'), router.refresh()) : toast.error(r.error); });
      }}><RotateCcw size={14} />Restore</button>}
    </div>
  );
}

export function NewVersionPanel({ projectId, documentId, extension }: { projectId: string; documentId: string; extension: string }) {
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-500">Uploading a revised file keeps every earlier version. Only .{extension} files are accepted.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Revision label<input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Revision 02" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm">Revision notes<input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="What changed?" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      </div>
      <UploadZone projectId={projectId} documentId={documentId} label={label} notes={notes} multiple={false} compact />
    </div>
  );
}
