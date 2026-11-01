import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptGoogleToken } from '@/lib/google-drive-crypto';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/account?drive_error=${encodeURIComponent(reason)}`, origin));
    response.cookies.delete('sitesync_google_oauth_state');
    return response;
  };

  const expectedState = request.cookies.get('sitesync_google_oauth_state')?.value;
  const state = searchParams.get('state');
  if (!state || !expectedState || state !== expectedState) return fail('state');
  if (searchParams.get('error')) return fail('denied');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('session');

  const adminEmail = process.env.GOOGLE_DRIVE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user.email?.toLowerCase() !== adminEmail) return fail('admin_only');

  const code = searchParams.get('code');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!code || !clientId || !clientSecret || !siteUrl || !process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return fail('configuration');

  const redirectUri = new URL('/api/google/callback', siteUrl).toString();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    cache: 'no-store',
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.refresh_token) return fail('token');

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store' });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.email) return fail('profile');
  if (String(profile.email).toLowerCase() !== adminEmail) return fail('wrong_google_account');

  const admin = createAdminClient();
  const { error } = await admin.from('site_integrations').upsert({
    id: 'primary',
    drive_email: profile.email,
    refresh_token_encrypted: encryptGoogleToken(tokens.refresh_token),
    connected_by: user.id,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) return fail('save');

  const response = NextResponse.redirect(new URL('/account?drive_connected=1', origin));
  response.cookies.delete('sitesync_google_oauth_state');
  return response;
}
