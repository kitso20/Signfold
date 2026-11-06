import type { AppSettings } from '../types';
import { createDefaultSettings } from '../types';
import { randomToken } from './utils';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
}

export class DriveAuthError extends Error {
  constructor(message = 'Your Google Drive session expired. Reconnect to continue.') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function parseError(response: Response): Promise<never> {
  if (response.status === 401) throw new DriveAuthError();
  let message = `Google Drive request failed (${response.status}).`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) message = body.error.message;
  } catch {
  }
  throw new DriveError(message, response.status);
}

export class DriveClient {
  token: string;

  constructor(token: string) {
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (response.status === 401) {
      throw new DriveAuthError();
    }
    if (!response.ok) await parseError(response);
    return response;
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    return (await response.json()) as T;
  }

  async resolveFolderPath(path: string): Promise<{ rootFolderId: string; documentsFolderId: string }> {
    const segments = path
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments[0]?.toLowerCase() === 'my drive') segments.shift();
    if (segments.length === 0) segments.push('Signfold');

    let parentId = 'root';
    for (const segment of segments) {
      parentId = await this.findOrCreateFolder(segment, parentId);
    }

    const documentsFolderId = await this.findOrCreateFolder('Documents', parentId);
    return { rootFolderId: parentId, documentsFolderId };
  }

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const query = [
      `name = '${escapeQuery(name)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      `'${parentId}' in parents`,
      'trashed = false',
    ].join(' and ');
    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name)',
      pageSize: '10',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const result = await this.json<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`);
    const existing = result.files?.[0];
    if (existing) return existing.id;

    const created = await this.json<DriveFile>(`${DRIVE_API}/files?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return created.id;
  }

  async loadSettings(rootFolderId: string): Promise<{ settings: AppSettings; fileId?: string }> {
    const file = await this.findSettingsFile(rootFolderId);
    if (!file) return { settings: createDefaultSettings() };

    const bytes = await this.downloadFile(file.id);
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AppSettings>;
      return {
        settings: {
          ...createDefaultSettings(),
          ...parsed,
          version: 1,
          signatures: Array.isArray(parsed.signatures) ? parsed.signatures : [],
          emails: Array.isArray(parsed.emails) ? parsed.emails : [],
          recent: Array.isArray(parsed.recent) ? parsed.recent : [],
        },
        fileId: file.id,
      };
    } catch {
      return { settings: createDefaultSettings(), fileId: file.id };
    }
  }

  private async findSettingsFile(folderId: string): Promise<DriveFile | undefined> {
    const query = [
      "name = 'settings.json'",
      `'${folderId}' in parents`,
      'trashed = false',
    ].join(' and ');
    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name)',
      pageSize: '10',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const result = await this.json<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`);
    return result.files?.[0];
  }

  async saveSettings(folderId: string, settings: AppSettings, existingFileId?: string): Promise<string> {
    const payload = new TextEncoder().encode(JSON.stringify({ ...settings, updatedAt: new Date().toISOString() }));

    if (existingFileId) {
      await this.request(
        `${UPLOAD_API}/files/${encodeURIComponent(existingFileId)}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        },
      );
      return existingFileId;
    }

    const file = await this.uploadFile(folderId, 'settings.json', 'application/json', payload);
    return file.id;
  }

  async uploadPdf(folderId: string, name: string, bytes: Uint8Array): Promise<DriveFile> {
    return this.uploadFile(folderId, name, 'application/pdf', bytes);
  }

  private async uploadFile(
    folderId: string,
    name: string,
    mimeType: string,
    bytes: Uint8Array,
  ): Promise<DriveFile> {
    const boundary = `signfold_${randomToken(16)}`;
    const metadata = JSON.stringify({ name, mimeType, parents: [folderId] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      metadata,
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      bytes as unknown as BlobPart,
      `\r\n--${boundary}--`,
    ]);

    const params = new URLSearchParams({
      uploadType: 'multipart',
      fields: 'id,name,mimeType,modifiedTime,size',
      supportsAllDrives: 'true',
    });
    const response = await this.request(`${UPLOAD_API}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await response.json()) as DriveFile;
  }

  async updatePdf(fileId: string, bytes: Uint8Array): Promise<void> {
    await this.request(
      `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/pdf' },
        body: bytes as unknown as BodyInit,
      },
    );
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  async listDocuments(folderId: string): Promise<DriveFile[]> {
    const query = [
      `'${folderId}' in parents`,
      "mimeType = 'application/pdf'",
      'trashed = false',
    ].join(' and ');
    const params = new URLSearchParams({
      q: query,
      spaces: 'drive',
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const result = await this.json<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`);
    return result.files || [];
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
    });
  }
}
