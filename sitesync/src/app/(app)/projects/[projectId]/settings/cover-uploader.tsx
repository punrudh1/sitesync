'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { putWithProgress } from '@/lib/upload';
import { prepareCover, setCover } from './actions';

export function CoverUploader({ projectId, url }: { projectId: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const prep = await prepareCover(projectId, { size: file.size, mime: file.type });
      if (!prep.ok) return toast.error(prep.error);
      await putWithProgress(prep.signedUrl, file, () => {});
      const r = await setCover(projectId, prep.path);
      r.ok ? (toast.success('Cover image updated'), router.refresh()) : toast.error(r.error);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed'); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <h2 className="font-medium">Cover image</h2>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="Project cover" className="h-32 w-full rounded-md object-cover" />
        : <p className="text-sm text-navy-500">No cover image yet.</p>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : url ? 'Replace image' : 'Upload image'}</Button>
      <p className="text-xs text-navy-500">JPG, PNG or WebP, up to 5 MB.</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
