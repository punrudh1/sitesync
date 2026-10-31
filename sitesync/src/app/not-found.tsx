import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-4 text-center">
      <div className="space-y-3">
        <Logo />
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-navy-500">It may have been deleted, or you may not have access to it.</p>
        <Link href="/" className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Go to your projects</Link>
      </div>
    </main>
  );
}
