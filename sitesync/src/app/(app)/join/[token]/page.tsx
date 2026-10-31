import { requireUser } from '@/lib/auth';
import { JoinButton } from './join-button';

export const metadata = { title: 'Join project' };

export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUser();
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">You have been invited to a project</h1>
        <p className="text-sm text-navy-500">Accept to join. This only works if you are signed in with the email address that was invited.</p>
        <JoinButton token={token} />
      </div>
    </main>
  );
}
