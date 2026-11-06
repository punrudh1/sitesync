export const MAX_FILE_SIZE = PROJECT_STORAGE_LIMIT; // a single file may use the remaining project quota
export const PROJECT_STORAGE_LIMIT = 2 * 1024 * 1024 * 1024; // 2 GiB per project

// Extension is authoritative. Browsers report inconsistent MIME types for CAD/zip files,
// so those accept the generic types too.
const GENERIC = ['', 'application/octet-stream'];
export const ALLOWED: Record<string, string[]> = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ...GENERIC],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ...GENERIC],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain', ...GENERIC],
  txt: ['text/plain', ...GENERIC],
  dwg: ['application/acad', 'application/x-acad', 'image/vnd.dwg', 'image/x-dwg', 'application/dwg', ...GENERIC],
  dxf: ['application/dxf', 'image/vnd.dxf', 'image/x-dxf', 'text/plain', ...GENERIC],
  rvt: ['application/vnd.autodesk.revit', 'application/x-autodesk-revit', ...GENERIC],
  zip: ['application/zip', 'application/x-zip-compressed', ...GENERIC],
};

export const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

export function validateUpload(name: string, size: number, mime: string): string | null {
  if (!name || name.includes('/') || name.includes('\\\\') || name.length > 255) return 'Invalid file name';
  const ext = extOf(name);
  if (!(ext in ALLOWED)) return `.${ext || '?'} files are not supported. Allowed: ${Object.keys(ALLOWED).join(', ')}`;
  if (!Number.isFinite(size) || size <= 0) return 'The file is empty';
  if (size > MAX_FILE_SIZE) return 'The file is larger than the 2 GB project limit';
  if (!ALLOWED[ext].includes(mime)) return `File type does not match its .${ext} extension`;
  return null;
}

/** Storage keys are restricted, so keep a conservative ASCII form; the display name is stored separately. */
export const storageSafeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'file';

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export type Kind = 'pdf' | 'image' | 'dxf' | 'other';
/** What the in-browser viewer can show. DWG and RVT are stored/downloaded only. */
export const kindOf = (ext: string): Kind => (ext === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png'].includes(ext) ? 'image' : ext === 'dxf' ? 'dxf' : 'other');
