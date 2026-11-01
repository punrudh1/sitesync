import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptGoogleToken } from '@/lib/google-drive-crypto';

type TokenRow = { refresh_token_encrypted: string };
let cachedToken: { value: string; expiresAt: number } | null = null;

async function refreshAccessToken() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('site_integrations').select('refresh_token_encrypted').eq('id', 'primary').maybeSingle();
  if (error || !data) throw new Error('Google Drive is not connected. Ask the SiteSync administrator to connect it.');
  const refreshToken = decryptGoogleToken((data as TokenRow).refresh_token_encrypted);
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('Google Drive authorization expired. Reconnect the central account.');
  cachedToken = { value: result.access_token, expiresAt: Date.now() + Math.max(60, result.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export async function googleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return refreshAccessToken();
}

export async function googleDriveFetch(path: string, init: RequestInit = {}) {
  const token = await googleAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers, cache: 'no-store' });
  if (response.status === 401) {
    cachedToken = null;
    const retryToken = await refreshAccessToken();
    headers.set('authorization', `Bearer ${retryToken}`);
    return fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers, cache: 'no-store' });
  }
  return response;
}

export async function getGoogleDriveConnection() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('site_integrations').select('drive_email, connected_at').eq('id', 'primary').maybeSingle();
  if (error) throw new Error('Could not read Google Drive connection status');
  return data;
}
