'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 2 * 1024 * 1024;

export async function updateName(_: unknown, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const { supabase, user } = await requireUser();
  const name = String(form.get('fullName') ?? '').trim();
  if (name.length < 2 || name.length > 100) return { error: 'Enter your full name (2–100 characters)' };
  const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
  if (error) return { error: 'Could not save your name' };
  revalidatePath('/', 'layout');
  return { saved: true };
}

export async function prepareAvatar(input: { size: number; mime: string }): Promise<R<{ path: string; signedUrl: string }>> {
  const { supabase, user } = await requireUser();
  const ext = TYPES[input.mime];
  if (!ext) return { ok: false, error: 'Use a JPG, PNG or WebP image' };
  if (!(input.size > 0) || input.size > MAX) return { ok: false, error: 'The image must be 2 MB or smaller' };
  const path = `${user.id}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('avatars').createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'Could not start the upload' };
  return { ok: true, path, signedUrl: data.signedUrl };
}

export async function setAvatar(path: string): Promise<R> {
  const { supabase, user } = await requireUser();
  if (!path.startsWith(`${user.id}/`) || path.includes('..')) return { ok: false, error: 'Invalid avatar' };
  const { data: sig } = await supabase.storage.from('avatars').createSignedUrl(path, 10);
  if (!sig) return { ok: false, error: 'The uploaded image was not found' };
  const { data: old } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
  const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id);
  if (error) return { ok: false, error: 'Could not save your avatar' };
  if (old?.avatar_url && old.avatar_url !== path) await supabase.storage.from('avatars').remove([old.avatar_url]);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateEmailPrefs(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('profiles').update({ email_notifications: enabled }).eq('id', user.id);
  if (error) return { ok: false, error: 'Could not save your preference' };
  revalidatePath('/account');
  return { ok: true };
}


export async function updateAppearance(theme: 'dark' | 'light' | 'system', accent: 'orange' | 'blue' | 'green' | 'purple' | 'pink'): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from('profiles').update({
    theme_preference: theme,
    accent_preference: accent,
  }).eq('id', user.id);
  if (error) return { ok: false, error: 'Could not save appearance preferences. Make sure migration 0012 has been applied.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
