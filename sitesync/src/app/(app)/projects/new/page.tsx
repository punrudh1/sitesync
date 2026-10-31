import { requireUser } from '@/lib/auth';
import { NewProjectForm } from './form';

export const metadata = { title: 'New project' };

export default async function Page() {
  await requireUser();
  return (
    <main className="mx-auto max-w-xl p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Create your project</h1>
      <p className="mb-6 mt-1 text-sm text-navy-500">Step 1 of 2. Next you will invite your collaborator.</p>
      <NewProjectForm />
    </main>
  );
}
