import { AuthForm } from '@/components/auth-form';
import { requestPasswordReset } from '../actions';

export const metadata = { title: 'Reset password' };
export default function Page() { return <AuthForm mode="forgot" action={requestPasswordReset} />; }
