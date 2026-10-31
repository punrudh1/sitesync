'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { inviteSchema, projectSchema } from '@/lib/validation';

export type ActionState = { error?: string; message?: string; inviteLink?: string } | undefined;

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.startDate && d.targetDate && d.targetDate < d.startDate) return { error: 'Target date must be after the start date' };
  const { data, error } = await supabase.rpc('create_project', {
    p_name: d.name, p_code: d.code, p_description: d.description, p_start_date: d.startDate, p_target_date: d.targetDate,
  });
  if (error) return { error: 'Could not create the project. Please try again.' };
  redirect(`/projects/${data}/team?welcome=1`);
}

export async function inviteMember(projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.email === user.email?.toLowerCase()) return { error: 'You are already a member of this project' };

  // The raw token is shown once and never stored; only its SHA-256 hash is saved.
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const { error } = await supabase.from('project_invitations').insert({
    project_id: projectId, email: parsed.data.email, token_hash: tokenHash, invited_by: user.id,
  });
  if (error) {
    if (error.code === '23505') return { error: 'There is already a pending invitation for that email. Revoke it first to create a new link.' };
    return { error: 'Only the project owner can invite members.' };
  }
  revalidatePath(`/projects/${projectId}/team`);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return { message: 'Invitation created. Send this link to your collaborator — it works only for that email address.', inviteLink: `${base}/join/${token}` };
}

export async function revokeInvitation(projectId: string, invitationId: string) {
  const { supabase } = await requireUser();
  await supabase.from('project_invitations').update({ status: 'revoked' }).eq('id', invitationId).eq('project_id', projectId);
  revalidatePath(`/projects/${projectId}/team`);
}

export async function removeMember(projectId: string, userId: string) {
  const { supabase } = await requireUser();
  await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId);
  revalidatePath(`/projects/${projectId}/team`);
}

export async function acceptInvitation(token: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) return { error: error.message.replace(/^.*?:\s*/, '') };
  redirect(`/projects/${data}`);
}

export async function markRead(id: string) {
  const { supabase } = await requireUser();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  revalidatePath('/', 'layout');
}

export async function markAllRead() {
  const { supabase, user } = await requireUser();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
  revalidatePath('/', 'layout');
}
