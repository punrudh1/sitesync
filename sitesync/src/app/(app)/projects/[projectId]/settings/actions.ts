'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { projectSchema } from '@/lib/validation';

export type SettingsState = { error?: string; saved?: boolean } | undefined;
const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'];

export async function updateProject(projectId: string, _: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase } = await requireUser();
  const p = projectSchema.safeParse(Object.fromEntries(form));
  const status = String(form.get('status'));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!STATUSES.includes(status)) return { error: 'Choose a valid status' };
  const d = p.data;
  if (d.startDate && d.targetDate && d.targetDate < d.startDate) return { error: 'Target date must be after the start date' };
  const { data, error } = await supabase.from('projects').update({ name: d.name, code: d.code, description: d.description, status, start_date: d.startDate, target_completion_date: d.targetDate }).eq('id', projectId).select('id');
  if (error || !data?.length) return { error: 'Only the project owner can change project settings' };
  revalidatePath(`/projects/${projectId}`, 'layout');
  return { saved: true };
}

import { randomUUID } from 'node:crypto';
const COVER_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function assertOwner(projectId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle();
  return { supabase, owner: data?.role === 'owner' };
}

export async function prepareCover(projectId: string, input: { size: number; mime: string }): Promise<{ ok: true; path: string; signedUrl: string } | { ok: false; error: string }> {
  const { supabase, owner } = await assertOwner(projectId);
  if (!owner) return { ok: false, error: 'Only the project owner can change the cover image' };
  const ext = COVER_TYPES[input.mime];
  if (!ext) return { ok: false, error: 'Use a JPG, PNG or WebP image' };
  if (!(input.size > 0) || input.size > 5 * 1024 * 1024) return { ok: false, error: 'The image must be 5 MB or smaller' };
  const path = `${projectId}/cover/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('project-files').createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'Could not start the upload' };
  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function setCover(projectId: string, path: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, owner } = await assertOwner(projectId);
  if (!owner || !path.startsWith(`${projectId}/cover/`) || path.includes('..')) return { ok: false, error: 'Not allowed' };
  const { data: old } = await supabase.from('projects').select('cover_image_path').eq('id', projectId).maybeSingle();
  const { data, error } = await supabase.from('projects').update({ cover_image_path: path }).eq('id', projectId).select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not save the cover image' };
  if (old?.cover_image_path && old.cover_image_path !== path) await supabase.storage.from('project-files').remove([old.cover_image_path]);
  revalidatePath(`/projects/${projectId}`, 'layout');
  return { ok: true };
}
