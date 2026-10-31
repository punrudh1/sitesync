import { AuthForm } from '@/components/auth-form';
import { signIn } from '../actions';

export const metadata = { title: 'Sign in' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return <AuthForm mode="login" action={signIn} next={sp.next}
    notice={sp.error === 'link' ? 'That link is invalid or has expired. Please try again.' : undefined} />;
}
