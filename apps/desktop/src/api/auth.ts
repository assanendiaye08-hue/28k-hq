import { start, cancel, onUrl } from '@fabianlars/tauri-plugin-oauth';
import { openUrl } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';
import { setAccessToken } from './client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  member: {
    id: string;
    displayName: string;
    discordId: string;
    avatar: string | null;
  };
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function loginWithDiscord(): Promise<AuthResult> {
  // 1. Start localhost server
  const port = await start({ ports: [28457, 28458, 28459] });
  const redirectUri = `http://127.0.0.1:${port}`;

  // 2. Set up URL listener before opening browser
  const unlisten = await onUrl(() => {});
  unlisten();

  const callbackPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('OAuth login timed out'));
    }, 120_000);

    onUrl((url) => {
      clearTimeout(timeout);
      resolve(url);
    });
  });

  // 3. Generate PKCE pair
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 4. Open Discord OAuth in system browser
  const authUrl = new URL('https://discord.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  await openUrl(authUrl.toString());

  // 5. Wait for redirect with authorization code
  let callbackUrl: string;
  try {
    callbackUrl = await callbackPromise;
  } catch (err) {
    try { await cancel(port); } catch { /* ignore */ }
    throw err;
  }
  try { await cancel(port); } catch { /* ignore */ }

  // 6. Extract code from callback URL
  const url = new URL(callbackUrl.startsWith('http') ? callbackUrl : `http://127.0.0.1:${port}${callbackUrl}`);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorization code received');

  // 7. Exchange code via our API
  const response = await fetch(`${API_BASE}/auth/discord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Token exchange failed' }));
    throw new Error(error.error || 'Token exchange failed');
  }

  const result: AuthResult = await response.json();

  // 8. Store refresh token persistently
  const store = await load('auth.json', { defaults: {}, autoSave: true });
  await store.set('refreshToken', result.refreshToken);
  await store.save();

  return result;
}

export async function tryRestoreSession(): Promise<AuthResult['member'] | null> {
  try {
    const store = await load('auth.json', { defaults: {} });
    const refreshToken = await store.get<string>('refreshToken');
    if (!refreshToken) return null;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      await store.delete('refreshToken');
      await store.save();
      return null;
    }

    const data = await res.json();

    await store.set('refreshToken', data.refreshToken);
    await store.save();

    setAccessToken(data.accessToken);

    return data.member ?? null;
  } catch {
    return null;
  }
}

export async function logoutSession(): Promise<void> {
  try {
    const store = await load('auth.json', { defaults: {} });
    const refreshToken = await store.get<string>('refreshToken');

    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }

    await store.delete('refreshToken');
    await store.save();
  } catch {
    // Best-effort cleanup
  }

  setAccessToken(null);
}
