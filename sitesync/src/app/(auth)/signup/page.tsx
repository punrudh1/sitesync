import { AuthForm } from '@/components/auth-form';
import { signUp } from '../actions';

export const metadata = { title: 'Create account' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <AuthForm mode="signup" action={signUp} next={(await searchParams).next} />;
}
