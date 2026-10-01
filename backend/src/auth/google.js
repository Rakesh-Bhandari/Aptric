// Google sign-in (OAuth 2.0 authorization code flow, openid email profile).

import { config } from '../config.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleRedirectUri = () => `${config.apiUrl}/auth/google/callback`;

export function googleAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/** Exchanges the code and returns { sub, email, email_verified, name, picture }. */
export async function googleProfile(code) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
  const { access_token: accessToken } = await tokenRes.json();

  const userRes = await fetch(USERINFO_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) throw new Error(`Google userinfo failed (${userRes.status})`);
  const profile = await userRes.json();
  if (!profile.sub || !profile.email) throw new Error('Google did not return an email address');
  return profile;
}
