import { AuthForm } from '@/components/auth-form';
import { updatePassword } from '../actions';

export const metadata = { title: 'Choose a new password' };
export default function Page() { return <AuthForm mode="reset" action={updatePassword} />; }
