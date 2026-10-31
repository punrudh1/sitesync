'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signInSchema, signUpSchema } from '@/lib/validation';
import { safeNext } from '@/lib/safe-redirect';

export type FormState = { error?: string; message?: string } | undefined;

async function siteUrl() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Incorrect email or password.' };
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(String(form.get('next') ?? '')))}`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: 'Check your email to confirm your account, then sign in.' };
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Enter your email' };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists, to avoid account enumeration.
  return { message: 'If an account exists for that email, a reset link is on its way.' };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 10) return { error: 'Use at least 10 characters' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
