import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export default async function Home() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('project_members').select('project_id, joined_at').order('joined_at').limit(1);
  redirect(data?.[0] ? `/projects/${data[0].project_id}` : '/projects/new');
}
