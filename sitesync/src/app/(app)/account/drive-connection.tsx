'use client';

import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

export function DriveConnection({ email, connectedAt }: { email: string | null; connectedAt: string | null }) {
  const params = useSearchParams();
  const error = params.get('drive_error');
  const connected = params.get('drive_connected') === '1';
  const messages: Record<string, string> = {
    configuration: 'Google Drive setup is incomplete. Check the server environment variables.',
    wrong_google_account: 'You signed in with a different Google account. Choose the central storage account.',
    state: 'Google authorization could not be verified. Please try connecting again.',
    denied: 'Google Drive access was cancelled.',
    session: 'Your SiteSync session expired. Sign in and try again.',
    token: 'Google did not return a refresh token. Reconnect and approve access.',
    profile: 'Could not read the Google account email.',
    save: 'Could not securely save the Google Drive connection.',
  };
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-medium">Central Google Drive</h2>
        <p className="mt-1 text-sm text-navy-500">Connect the Google account that will own SiteSync project files.</p>
      </div>
      {email ? (
        <p className="text-sm">Connected account: <strong>{email}</strong>{connectedAt ? <span className="block text-xs text-navy-500">Connected {new Date(connectedAt).toLocaleString()}</span> : null}</p>
      ) : <p className="text-sm text-amber-700">Not connected yet.</p>}
      {connected && <p role="status" className="text-sm text-green-700">Google Drive account connected.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{messages[error] ?? 'Google Drive connection failed.'}</p>}
      <a href="/api/google/connect" className="inline-flex rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        {email ? 'Reconnect Google Drive' : 'Connect Google Drive'}
      </a>
      <p className="text-xs text-navy-500">Only the SiteSync server handles Google credentials. Do not share OAuth secrets or refresh tokens.</p>
    </Card>
  );
}
