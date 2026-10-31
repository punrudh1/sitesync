'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';

const schema = z.object({ body: z.string().trim().min(1, 'Write a message').max(8000), parentId: z.string().uuid().nullable(), documentId: z.string().uuid().nullable() });

export async function postMessage(projectId: string, input: { body: string; parentId: string | null; documentId: string | null }): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (p.data.parentId) {
    const { data: parent } = await supabase.from('discussion_messages').select('id, parent_id').eq('id', p.data.parentId).eq('project_id', projectId).maybeSingle();
    if (!parent) return { ok: false, error: 'The message you are replying to no longer exists' };
    if (parent.parent_id) p.data.parentId = parent.parent_id; // keep threads one level deep
  }
  const { error } = await supabase.from('discussion_messages').insert({ project_id: projectId, author_id: user.id, body: p.data.body, parent_id: p.data.parentId, document_id: p.data.documentId });
  if (error) return { ok: false, error: 'Could not send the message' };
  revalidatePath(`/projects/${projectId}/discussions`);
  return { ok: true };
}

export async function deleteMessage(projectId: string, id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('discussion_messages').delete().eq('id', id).eq('project_id', projectId).select('id');
  revalidatePath(`/projects/${projectId}/discussions`);
  return { ok: !!data?.length, error: data?.length ? undefined : 'You can only delete your own messages' };
}
