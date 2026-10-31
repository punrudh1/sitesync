import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { SettingsForm } from './form';
import { CoverUploader } from './cover-uploader';
import { signedUrl } from '@/lib/avatar';

export const metadata = { title: 'Settings' };

export default async function Settings({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: p }, { data: me }] = await Promise.all([
    supabase.from('projects').select('name, code, description, status, start_date, target_completion_date, cover_image_path').eq('id', projectId).maybeSingle(),
    supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (!p) notFound();
  const cover = await signedUrl(supabase, 'project-files', p.cover_image_path);
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {me?.role === 'owner' ? <><Card><CoverUploader projectId={projectId} url={cover} /></Card><Card><SettingsForm projectId={projectId} project={p} /></Card></> : <Card className="text-sm text-navy-500">Only the project owner can change project settings.</Card>}
    </div>
  );
}
