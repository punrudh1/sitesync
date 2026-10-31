import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { InviteForm, RevokeButton, RemoveButton } from './controls';

export const metadata = { title: 'Team' };

export default async function Team({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { projectId } = await params;
  const welcome = (await searchParams).welcome;
  const { supabase, user } = await requireUser();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from('project_members').select('user_id, role, profiles(full_name, email)').eq('project_id', projectId),
    // RLS: only the owner can read invitations, so this is empty for other members.
    supabase.from('project_invitations').select('id, email, status, expires_at').eq('project_id', projectId).eq('status', 'pending'),
  ]);
  const isOwner = members?.some((m) => m.user_id === user.id && m.role === 'owner');
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Team</h1>
      {welcome && isOwner && <p className="rounded bg-brand-light p-3 text-sm">Project created. Step 2: invite your collaborator by email.</p>}
      <Card>
        <h2 className="mb-3 font-medium">Members</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {members?.map((m) => {
            const pr = m.profiles as unknown as { full_name: string; email: string } | null;
            return (
              <li key={m.user_id} className="flex items-center justify-between py-2">
                <span>{pr?.full_name || '—'} <span className="text-navy-500">{pr?.email}</span></span>
                <span className="flex items-center gap-3"><span className="text-navy-500">{m.role}</span>
                  {isOwner && m.role !== 'owner' && <RemoveButton projectId={projectId} userId={m.user_id} />}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      {isOwner && (
        <Card>
          <h2 className="mb-3 font-medium">Invite a collaborator</h2>
          <InviteForm projectId={projectId} />
          {invites && invites.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>{i.email} <span className="text-navy-500">expires {new Date(i.expires_at).toLocaleDateString()}</span></span>
                  <RevokeButton projectId={projectId} invitationId={i.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
