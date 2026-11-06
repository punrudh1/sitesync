/** Browser upload through same-origin server chunks to avoid Google Drive browser CORS restrictions. */
export async function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  const chunkSize = 4 * 1024 * 1024;
  let fileId: string | undefined;

  for (let start = 0; start < file.size; start += chunkSize) {
    const chunk = file.slice(start, Math.min(start + chunkSize, file.size));
    const form = new FormData();
    form.set('uploadUrl', url);
    form.set('start', String(start));
    form.set('total', String(file.size));
    form.set('chunk', chunk, file.name);

    let response: Response;
    try {
      response = await fetch('/api/google/upload-chunk', { method: 'POST', body: form, credentials: 'same-origin' });
    } catch {
      throw new Error('Network error while sending an upload chunk to SiteSync');
    }

    const result = await response.json().catch(() => ({})) as { done?: boolean; id?: string; error?: string };
    if (!response.ok) throw new Error(result.error || `Upload failed (HTTP ${response.status})`);
    onProgress(Math.round(((start + chunk.size) / file.size) * 100));
    if (result.done) fileId = result.id;
  }

  if (!fileId) throw new Error('Google Drive did not confirm the completed upload');
  return fileId;
}
