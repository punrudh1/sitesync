import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/logo';
import { signedUrl } from '@/lib/avatar';
import { AvatarUploader } from './avatar-uploader';
import { NameForm } from './name-form';
import { EmailPrefs } from './email-prefs';

export const metadata = { title: 'Your account' };

export default async function Account() {
  const { supabase, user } = await requireUser();
  const { data: p } = await supabase.from('profiles').select('full_name, email, avatar_url, email_notifications').eq('id', user.id).maybeSingle();
  const url = await signedUrl(supabase, 'avatars', p?.avatar_url);
  return (
    <main id="main" className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between"><Logo /><Link href="/" className="text-sm text-navy-500 hover:underline">← Back to projects</Link></div>
      <h1 className="text-2xl font-semibold">Your account</h1>
      <Card className="space-y-4"><AvatarUploader url={url} initial={(p?.full_name?.[0] ?? p?.email?.[0] ?? '?').toUpperCase()} /><NameForm name={p?.full_name ?? ''} /></Card>
      <Card><EmailPrefs enabled={p?.email_notifications ?? true} /></Card>
      <Card className="text-sm"><p className="text-navy-500">Email</p><p>{p?.email}</p>
        <p className="mt-3 text-xs text-navy-500">To change your password, sign out and use “Forgot password?” on the sign-in page.</p></Card>
    </main>
  );
}
