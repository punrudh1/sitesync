'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { putWithProgress } from '@/lib/upload';
import { prepareAvatar, setAvatar } from './actions';

export function AvatarUploader({ url, initial }: { url: string | null; initial: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const prep = await prepareAvatar({ size: file.size, mime: file.type });
      if (!prep.ok) return toast.error(prep.error);
      await putWithProgress(prep.signedUrl, file, () => {});
      const r = await setAvatar(prep.path);
      if (!r.ok) return toast.error(r.error);
      toast.success('Avatar updated'); router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed'); } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-4">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="Your avatar" className="h-16 w-16 rounded-full object-cover" />
        : <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-navy-900 text-xl font-semibold text-white">{initial}</span>}
      <div><Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : 'Change avatar'}</Button>
        <p className="mt-1 text-xs text-navy-500">JPG, PNG or WebP, up to 2 MB.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></div>
    </div>
  );
}
