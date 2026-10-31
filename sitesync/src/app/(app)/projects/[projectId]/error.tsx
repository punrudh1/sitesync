'use client';

import { Button } from '@/components/ui/button';

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <h1 className="text-lg font-semibold text-red-800">Something went wrong</h1>
      <p className="text-sm text-red-700">We could not load this page. Your data is safe. Try again, and if it keeps happening, reload or sign in again.</p>
      {error.digest && <p className="text-xs text-red-600">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
