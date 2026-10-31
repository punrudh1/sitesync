import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { createTask } from '../actions';
import { TaskForm } from '../task-form';

export const metadata = { title: 'New task' };

export default async function NewTask({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase } = await requireUser();
  const { data: members } = await supabase.from('project_members').select('user_id, profiles(full_name, email)').eq('project_id', projectId);
  const people = (members ?? []).map((m) => { const p = m.profiles as unknown as { full_name: string; email: string } | null; return { id: m.user_id, name: p?.full_name || p?.email || 'Unknown' }; });
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New task</h1>
      <Card><TaskForm action={createTask.bind(null, projectId)} people={people} submitLabel="Create task" /></Card>
    </div>
  );
}
