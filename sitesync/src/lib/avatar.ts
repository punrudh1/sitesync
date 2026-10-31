import type { SupabaseClient } from '@supabase/supabase-js';

/** Short-lived signed URL for a private avatar/cover object, or null if none/unavailable. */
export async function signedUrl(supabase: SupabaseClient, bucket: string, path: string | null | undefined, seconds = 3600) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
