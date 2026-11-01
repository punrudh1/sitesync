/** Browser-only: PUT a file to a Google Drive resumable upload session with progress events. */
export function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Google Drive upload failed (${xhr.status})`));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText) as { id?: string };
        if (!result.id) throw new Error('Google Drive did not return a file ID');
        resolve(result.id);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not read Google Drive upload result'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}
