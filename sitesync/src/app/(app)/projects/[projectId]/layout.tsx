import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { signedUrl } from '@/lib/avatar';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user } = await requireUser();
  // RLS returns nothing for non-members, so a guessed ID is indistinguishable from a missing project.
  const [{ data: project }, { data: projects }, { data: profile }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle(),
    supabase.from('projects').select('id, name').order('created_at'),
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
  ]);
  if (!project) notFound();
  await supabase.rpc('notify_due_tasks'); // deadline reminders, at most one per task per 24 h
  const [{ data: notifs }, { count: unread }] = await Promise.all([
    supabase.from('notifications').select('id, message, link, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
  ]);
  const f = `project_id=eq.${projectId}`;
  const avatarUrl = await signedUrl(supabase, 'avatars', profile?.avatar_url);
  return (
    <Shell project={project} projects={projects ?? []} userName={profile?.full_name || user.email || ''} avatarUrl={avatarUrl} notifications={notifs ?? []} unread={unread ?? 0}>
      <RealtimeRefresh name={`project-${projectId}`} subs={[
        ...['tasks', 'task_comments', 'documents', 'document_versions', 'folders', 'discussion_messages', 'drawing_annotations', 'annotation_replies', 'activity_logs'].map((table) => ({ table, filter: f })),
        { table: 'notifications', filter: `user_id=eq.${user.id}` },
      ]} />
      {children}
    </Shell>
  );
}
