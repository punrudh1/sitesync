'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { annotationSchema } from '@/lib/validation';

type R = { ok: boolean; error?: string };

export async function createAnnotation(projectId: string, documentId: string, versionId: string, page: number,
  shape: { type: string; coordinates: Record<string, number> }, body: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const s = annotationSchema.safeParse(shape);
  if (!s.success) return { ok: false, error: 'Invalid markup shape' };
  const text = body.trim().slice(0, 4000);
  if (s.data.type === 'text' && !text) return { ok: false, error: 'A text note needs some text' };
  if (!Number.isInteger(page) || page < 1) return { ok: false, error: 'Invalid page' };
  const { error } = await supabase.from('drawing_annotations').insert({
    project_id: projectId, document_id: documentId, version_id: versionId, page_number: page, author_id: user.id,
    type: s.data.type, coordinates: s.data.coordinates, body: text,
  });
  if (error) return { ok: false, error: 'Could not save the markup' };
  revalidatePath(`/projects/${projectId}/documents/${documentId}/view`);
  return { ok: true };
}

export async function replyToAnnotation(projectId: string, annotationId: string, body: string): Promise<R> {
  const { supabase, user } = await requireUser();
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: 'Write a reply (up to 4000 characters)' };
  const { error } = await supabase.from('annotation_replies').insert({ annotation_id: annotationId, project_id: projectId, author_id: user.id, body: text });
  return error ? { ok: false, error: 'Could not post the reply' } : { ok: true };
}

export async function setAnnotationResolved(projectId: string, annotationId: string, resolved: boolean): Promise<R> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from('drawing_annotations').update({ resolved }).eq('id', annotationId).eq('project_id', projectId).select('id');
  return error || !data?.length ? { ok: false, error: 'Could not update the comment' } : { ok: true };
}

export async function deleteAnnotation(projectId: string, annotationId: string): Promise<R> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('drawing_annotations').delete().eq('id', annotationId).eq('project_id', projectId).select('id');
  return data?.length ? { ok: true } : { ok: false, error: 'Only the author can delete a markup' };
}
