import type { AuthSession } from '../types';

export const GOOGLE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export const CLIENT_ID_STORAGE_KEY = 'signfold.googleClientId';
export const FOLDER_PATH_STORAGE_KEY = 'signfold.folderPath';
export const DEFAULT_FOLDER_PATH = 'Signfold';

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
let gisPromise: Promise<void> | null = null;

export function getConfiguredClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

export function getStoredClientId(): string {
  return getConfiguredClientId() || localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
}

export function rememberClientId(clientId: string): void {
  if (clientId.trim()) localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
}

export function getStoredFolderPath(): string {
  return localStorage.getItem(FOLDER_PATH_STORAGE_KEY) || DEFAULT_FOLDER_PATH;
}

export function rememberFolderPath(path: string): void {
  localStorage.setItem(FOLDER_PATH_STORAGE_KEY, path.trim() || DEFAULT_FOLDER_PATH);
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in. Check your network connection.'));
    };
    document.head.appendChild(script);
  });

  return gisPromise;
}

export interface RequestTokenOptions {
  silent?: boolean;
  loginHint?: string;
}

export async function requestGoogleToken(
  clientId: string,
  options: RequestTokenOptions = {},
): Promise<AuthSession> {
  if (!clientId.trim()) throw new Error('A Google OAuth client ID is required.');
  await loadGis();

  return new Promise<AuthSession>((resolve, reject) => {
    let settled = false;
    const finish = (session: AuthSession) => {
      if (settled) return;
      settled = true;
      resolve(session);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: GOOGLE_SCOPE,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          fail(response.error_description || response.error || 'Google sign-in was cancelled.');
          return;
        }
        const expiresIn = Number(response.expires_in || 3600);
        const session: AuthSession = {
          token: response.access_token,
          expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
        };
        void fetchProfile(session.token).then((profile) => {
          finish({ ...session, ...profile });
        });
      },
      error_callback: (error) => {
        const type = error?.type || '';
        if (type === 'popup_closed') fail('Google sign-in was closed.');
        else if (type === 'popup_failed_to_open')
          fail('The Google sign-in popup was blocked. Allow popups and try again.');
        else fail(error?.message || 'Google sign-in could not be completed.');
      },
    });

    try {
      client.requestAccessToken({
        prompt: options.silent ? 'none' : '',
        login_hint: options.loginHint,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Google sign-in failed to start.');
    }
  });
}

async function fetchProfile(token: string): Promise<{ email?: string; name?: string }> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return {};
    const profile = (await response.json()) as { email?: string; name?: string };
    return { email: profile.email, name: profile.name };
  } catch {
    return {};
  }
}
