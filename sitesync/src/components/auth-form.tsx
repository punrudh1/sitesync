'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Logo } from '@/components/logo';
import { BRAND } from '@/lib/brand';
import type { FormState } from '@/app/(auth)/actions';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
const COPY: Record<Mode, { title: string; cta: string }> = {
  login: { title: 'Sign in', cta: 'Sign in' },
  signup: { title: 'Create your account', cta: 'Create account' },
  forgot: { title: 'Reset your password', cta: 'Send reset link' },
  reset: { title: 'Choose a new password', cta: 'Update password' },
};

export function AuthForm({ mode, action, next, notice }: {
  mode: Mode; action: (s: FormState, f: FormData) => Promise<FormState>; next?: string; notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const c = COPY[mode];
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center"><Logo /><p className="mt-2 text-sm text-navy-500">{BRAND.tagline}</p></div>
        <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">{c.title}</h1>
          {notice && <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-800">{notice}</p>}
          {next && <input type="hidden" name="next" value={next} />}
          {mode === 'signup' && <Field id="fullName" label="Full name" autoComplete="name" required />}
          {mode !== 'reset' && <Field id="email" type="email" label="Email" autoComplete="email" required />}
          {mode !== 'forgot' && <Field id="password" type="password" label={mode === 'reset' ? 'New password' : 'Password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 10} required />}
          {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
          {state?.message && <p role="status" className="text-sm text-green-700">{state.message}</p>}
          <Button type="submit" disabled={pending} className="w-full">{pending ? 'Please wait…' : c.cta}</Button>
          <div className="flex justify-between text-xs text-navy-500">
            {mode === 'login' && <><Link href="/forgot-password" className="underline">Forgot password?</Link><Link href="/signup" className="underline">Create account</Link></>}
            {mode === 'signup' && <Link href="/login" className="underline">Already have an account?</Link>}
            {mode === 'forgot' && <Link href="/login" className="underline">Back to sign in</Link>}
          </div>
        </form>
      </div>
    </main>
  );
}
