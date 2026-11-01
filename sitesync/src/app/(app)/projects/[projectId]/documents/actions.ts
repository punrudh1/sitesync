'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { extOf, storageSafeName, validateUpload } from '@/lib/files';
import { googleDriveFetch } from '@/lib/google-drive';

const BUCKET = 'project-files';
const uuid = z.string().uuid();
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const refresh = (pid: string) => { revalidatePath(`/projects/${pid}/documents`); revalidatePath(`/projects/${pid}/drawings`); };

/** Step 1 of an upload: validate on the server, then hand back a one-time signed upload URL. */
export async function prepareUpload(projectId: string, input: { fileName: string; size: number; mime: string; documentId?: string }):
  Promise<R<{ documentId: string; versionId: string; path: string; uploadUrl: string }>> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(projectId).success) return fail('Invalid project');
  const err = validateUpload(input.fileName, input.size, input.mime);
  if (err) return fail(err);
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!project) return fail('Project not found or you do not have access');

  let documentId = randomUUID();
  if (input.documentId) {
    if (!uuid.safeParse(input.documentId).success) return fail('Invalid document');
    const { data: doc } = await supabase.from('documents').select('id, extension').eq('id', input.documentId).eq('project_id', projectId).maybeSingle();
    if (!doc) return fail('Document not found');
    if (doc.extension !== extOf(input.fileName)) return fail(`A new version must be a .${doc.extension} file`);
    documentId = doc.id;
  }
  const versionId = randomUUID();
  const path = `${projectId}/${documentId}/${versionId}`;
  const session = await googleDriveFetch('upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': input.mime || 'application/octet-stream', 'x-upload-content-length': String(input.size) },
    body: JSON.stringify({ name: storageSafeName(input.fileName), mimeType: input.mime || 'application/octet-stream', appProperties: { sitesyncProject: projectId, sitesyncDocument: documentId, sitesyncVersion: versionId } }),
  });
  const uploadUrl = session.headers.get('location');
  if (!session.ok || !uploadUrl) return fail('Could not start a Google Drive upload. Check the central Drive connection.');
  return { ok: true, documentId, versionId, path, uploadUrl };
}

/** Step 2: record the uploaded object in one database transaction (the RPC re-checks the object in storage). */
export async function finalizeUpload(projectId: string, input: {
  documentId: string; versionId: string; path: string; driveFileId: string; fileName: string; size: number; mime: string;
  folderId?: string | null; isNewVersion: boolean; label?: string; notes?: string;
}): Promise<R> {
  const { supabase } = await requireUser();
  const err = validateUpload(input.fileName, input.size, input.mime);
  if (err) return fail(err);
  const label = input.label?.trim().slice(0, 80) || null;
  const notes = (input.notes ?? '').trim().slice(0, 2000);
  const check = await googleDriveFetch(`files/${encodeURIComponent(input.driveFileId)}?fields=id,size,mimeType,trashed,appProperties`);
  const driveFile = await check.json();
  if (!check.ok || driveFile.trashed || String(driveFile.size) !== String(input.size) || driveFile.appProperties?.sitesyncProject !== projectId || driveFile.appProperties?.sitesyncDocument !== input.documentId || driveFile.appProperties?.sitesyncVersion !== input.versionId) {
    await googleDriveFetch(`files/${encodeURIComponent(input.driveFileId)}`, { method: 'DELETE' });
    return fail('Google Drive upload could not be verified');
  }
  const { error } = input.isNewVersion
    ? await supabase.rpc('add_drive_document_version', { p_document: input.documentId, p_version: input.versionId, p_drive_file_id: input.driveFileId, p_mime: input.mime, p_size: input.size, p_label: label, p_notes: notes })
    : await supabase.rpc('register_drive_document', { p_project: projectId, p_folder: input.folderId || null, p_document: input.documentId, p_version: input.versionId, p_name: input.fileName, p_drive_file_id: input.driveFileId, p_mime: input.mime, p_size: input.size, p_label: label, p_notes: notes });
  if (error) {
    await googleDriveFetch(`files/${encodeURIComponent(input.driveFileId)}`, { method: 'DELETE' });
    return fail(error.message);
  }
  refresh(projectId);
  return { ok: true };
}

const folderName = z.string().trim().min(1, 'Enter a name').max(120).regex(/^[^/\\]+$/, 'Names cannot contain / or \\');

export async function createFolder(projectId: string, parentId: string | null, name: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const n = folderName.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const { error } = await supabase.from('folders').insert({ project_id: projectId, parent_id: parentId, name: n.data, created_by: user.id });
  if (error) return fail(error.code === '23505' ? 'A folder with that name already exists here' : 'Could not create the folder');
  refresh(projectId);
  return { ok: true };
}

export async function renameFolder(projectId: string, folderId: string, name: string): Promise<R> {
  const { supabase } = await requireUser();
  const n = folderName.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const { data, error } = await supabase.from('folders').update({ name: n.data }).eq('id', folderId).eq('project_id', projectId).select('id');
  if (error) return fail(error.code === '23505' ? 'A folder with that name already exists here' : 'Could not rename the folder');
  if (!data?.length) return fail('Folder not found');
  refresh(projectId);
  return { ok: true };
}

export async function deleteFolder(projectId: string, folderId: string): Promise<R> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from('folders').delete().eq('id', folderId).eq('project_id', projectId).select('id');
  if (error || !data?.length) return fail('Only the project owner or the folder creator can delete it');
  refresh(projectId);
  return { ok: true };
}

export async function renameDocument(projectId: string, documentId: string, name: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const n = folderName.safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const { data, error } = await supabase.from('documents').update({ name: n.data, last_modified_by: user.id }).eq('id', documentId).eq('project_id', projectId).select('id');
  if (error) return fail(error.message.includes('must end in') ? error.message.replace(/^.*?File name/, 'File name') : 'Could not rename');
  if (!data?.length) return fail('Document not found');
  refresh(projectId);
  return { ok: true };
}

export async function moveDocument(projectId: string, documentId: string, folderId: string | null): Promise<R> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from('documents').update({ folder_id: folderId, last_modified_by: user.id }).eq('id', documentId).eq('project_id', projectId).select('id');
  if (error || !data?.length) return fail('Could not move the document');
  refresh(projectId);
  return { ok: true };
}

export async function deleteDocument(projectId: string, documentId: string): Promise<R> {
  const { supabase } = await requireUser();
  const { data: versions } = await supabase.from('document_versions').select('storage_path, storage_provider').eq('document_id', documentId).eq('project_id', projectId);
  const { data, error } = await supabase.from('documents').delete().eq('id', documentId).eq('project_id', projectId).select('id');
  if (error || !data?.length) return fail('Only the project owner or the uploader can delete this document');
  // Files uploaded by someone else may survive if storage policy denies removal; they stay private to the project.
  if (versions?.length) for (const v of versions) {
    if (v.storage_provider === 'google_drive') { const id = v.storage_path.split('/').at(-1); if (id) await googleDriveFetch(`files/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
    else await supabase.storage.from(BUCKET).remove([v.storage_path]);
  }
  refresh(projectId);
  return { ok: true };
}

export async function getDownloadUrl(projectId: string, versionId: string): Promise<R<{ url: string }>> {
  const { supabase } = await requireUser();
  // Two plain queries: embedding documents(name) from document_versions is ambiguous in PostgREST
  // (documents.current_version_id also points back at versions), so it fails with PGRST201.
  const { data: v } = await supabase.from('document_versions').select('storage_path, storage_provider, document_id').eq('id', versionId).eq('project_id', projectId).maybeSingle();
  if (!v) return fail('File not found');
  if (v.storage_provider === 'google_drive') return { ok: true, url: `/api/google/files/${versionId}?download=1` };
  const { data: doc } = await supabase.from('documents').select('name').eq('id', v.document_id).maybeSingle();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.storage_path, 60, { download: doc?.name ?? 'download' });
  if (error || !data) return fail('Could not prepare the download');
  return { ok: true, url: data.signedUrl };
}

export async function restoreVersion(projectId: string, documentId: string, versionId: string): Promise<R> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('restore_document_version', { p_document: documentId, p_version: versionId });
  if (error) return fail('Could not restore that version');
  refresh(projectId);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  return { ok: true };
}
