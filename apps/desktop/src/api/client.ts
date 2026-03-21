import { load } from '@tauri-apps/plugin-store';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const store = await load('auth.json', { defaults: {} });
  const refreshToken = await store.get<string>('refreshToken');
  if (!refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // Refresh token expired or invalid -- user must re-login
    await store.delete('refreshToken');
    await store.save();
    return null;
  }

  const data = await res.json();

  // Store rotated refresh token
  await store.set('refreshToken', data.refreshToken);
  await store.save();

  accessToken = data.accessToken;
  return data.accessToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
