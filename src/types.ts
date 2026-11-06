import type { PDFDocumentProxy } from 'pdfjs-dist';

export type SignatureKind = 'signature' | 'initials';

export interface SignatureAsset {
  id: string;
  kind: SignatureKind;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface EmailAsset {
  id: string;
  value: string;
  label?: string;
  createdAt: string;
}

export interface RecentDocument {
  id: string;
  name: string;
  modifiedTime?: string;
  openedAt: string;
}

export interface AppSettings {
  version: 1;
  signatures: SignatureAsset[];
  emails: EmailAsset[];
  recent: RecentDocument[];
  updatedAt: string;
}

export const createDefaultSettings = (): AppSettings => ({
  version: 1,
  signatures: [],
  emails: [],
  recent: [],
  updatedAt: new Date().toISOString(),
});

export interface PageSize {
  width: number;
  height: number;
  rotation: number;
}

export interface PdfDocumentState {
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  pageSizes: PageSize[];
  driveFileId?: string;
}

interface BaseAnnotation {
  id: string;
  page: number;
  x: number;
  y: number;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text';
  text: string;
  fontSize: number;
  color: string;
  fontFamily: 'Helvetica' | 'TimesRoman' | 'Courier';
}

export interface StampAnnotation extends BaseAnnotation {
  kind: 'stamp';
  dataUrl: string;
  width: number;
  height: number;
  assetKind: SignatureKind;
  assetId?: string;
}

export type AnnotationItem = TextAnnotation | StampAnnotation;

export type ToolbarAsset =
  | { type: 'signature'; asset: SignatureAsset }
  | { type: 'email'; asset: EmailAsset };

export type CloudStatus = 'disconnected' | 'connecting' | 'connected' | 'expired';

export interface AuthSession {
  token: string;
  expiresAt: number;
  email?: string;
  name?: string;
}

export interface CloudConnection {
  session: AuthSession;
  folderPath: string;
  folderId: string;
  documentsFolderId: string;
}
