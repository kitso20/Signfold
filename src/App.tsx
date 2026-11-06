import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import EmptyState from './components/EmptyState';
import PdfViewer from './components/PdfViewer';
import { ASSET_DRAG_TYPE } from './components/PdfPage';
import CloudModal from './components/CloudModal';
import SignatureModal from './components/SignatureModal';
import QrModal from './components/QrModal';
import Toasts, { type ToastMessage, type ToastTone } from './components/Toasts';
import { DriveAuthError, DriveClient, DriveError, type DriveFile } from './lib/drive';
import {
  getStoredClientId,
  getStoredFolderPath,
  rememberClientId,
  rememberFolderPath,
  requestGoogleToken,
} from './lib/google';
import { loadPdf } from './lib/pdfjs';
import { exportSignedPdf } from './lib/pdfExport';
import {
  clamp,
  createId,
  downloadBlob,
  isPdfFile,
  sanitizePdfName,
} from './lib/utils';
import {
  createDefaultSettings,
  type AnnotationItem,
  type AppSettings,
  type AuthSession,
  type CloudStatus,
  type EmailAsset,
  type PdfDocumentState,
  type RecentDocument,
  type SignatureAsset,
  type SignatureKind,
  type StampAnnotation,
  type TextAnnotation,
} from './types';
import type { ReceivedPhoneSignature } from './hooks/usePeerSign';

function mergeRecent(existing: RecentDocument[], files: DriveFile[]): RecentDocument[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  return files
    .map<RecentDocument>((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      openedAt:
        existingById.get(file.id)?.openedAt || file.modifiedTime || new Date().toISOString(),
    }))
    .sort(
      (a, b) =>
        new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .slice(0, 30);
}

function touchRecent(existing: RecentDocument[], entry: RecentDocument): RecentDocument[] {
  return [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, 30);
}

function markRecentOpened(
  existing: RecentDocument[],
  id: string,
  name: string,
): RecentDocument[] {
  const current = existing.find((item) => item.id === id);
  return touchRecent(existing, {
    id,
    name,
    modifiedTime: current?.modifiedTime,
    openedAt: new Date().toISOString(),
  });
}

interface ConnectOptions {
  silent?: boolean;
  quiet?: boolean;
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoConnectTriedRef = useRef(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('disconnected');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [drive, setDrive] = useState<DriveClient | null>(null);
  const [rootFolderId, setRootFolderId] = useState('');
  const [documentsFolderId, setDocumentsFolderId] = useState('');
  const [folderPath, setFolderPath] = useState(getStoredFolderPath);
  const [settingsFileId, setSettingsFileId] = useState<string | undefined>();
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureKind, setSignatureKind] = useState<SignatureKind>('signature');
  const [qrOpen, setQrOpen] = useState(false);

  const [document, setDocument] = useState<PdfDocumentState | null>(null);
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'text' | 'select'>('text');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [loadingRecentId, setLoadingRecentId] = useState('');
  const [savingPdf, setSavingPdf] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = createId('toast');
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const connectDrive = useCallback(
    async (clientId: string, path: string, options: ConnectOptions = {}): Promise<void> => {
      setConnecting(true);
      if (!options.silent) setCloudError('');
      setCloudStatus((current) => (current === 'connected' ? 'connected' : 'connecting'));

      try {
        const auth = await requestGoogleToken(clientId, {
          silent: options.silent,
          loginHint: session?.email,
        });
        const client = new DriveClient(auth.token);
        const folders = await client.resolveFolderPath(path);
        const loaded = await client.loadSettings(folders.rootFolderId);

        let recent = loaded.settings.recent;
        try {
          const files = await client.listDocuments(folders.documentsFolderId);
          recent = mergeRecent(loaded.settings.recent, files);
        } catch {
        }

        const nextSettings: AppSettings = { ...loaded.settings, recent };

        rememberClientId(clientId);
        rememberFolderPath(path);
        localStorage.setItem('signfold.hasConnected', '1');

        setSession(auth);
        setDrive(client);
        setRootFolderId(folders.rootFolderId);
        setDocumentsFolderId(folders.documentsFolderId);
        setSettingsFileId(loaded.fileId);
        setSettings(nextSettings);
        setFolderPath(path);
        setCloudStatus('connected');
        setCloudError('');

        if (!options.silent) {
          setCloudModalOpen(false);
          toast('Google Drive connected', 'success');
        }

        if (recent !== loaded.settings.recent) {
          try {
            const savedId = await client.saveSettings(
              folders.rootFolderId,
              nextSettings,
              loaded.fileId,
            );
            setSettingsFileId(savedId);
          } catch {
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not connect to Google Drive.';
        if (!options.quiet) setCloudError(message);
        setCloudStatus((current) => (current === 'connected' ? 'connected' : 'disconnected'));
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [session?.email, toast],
  );

  const withDrive = useCallback(
    async <T,>(operation: (client: DriveClient) => Promise<T>): Promise<T> => {
      if (!drive) throw new Error('Connect Google Drive first.');
      const client = drive;
      try {
        return await operation(client);
      } catch (error) {
        if (!(error instanceof DriveAuthError)) throw error;
        setCloudStatus('expired');
        const clientId = getStoredClientId();
        if (clientId) {
          try {
            const auth = await requestGoogleToken(clientId, {
              silent: true,
              loginHint: session?.email,
            });
            client.setToken(auth.token);
            setSession(auth);
            setCloudStatus('connected');
            return await operation(client);
          } catch {
          }
        }
        setCloudError('Your Google Drive session expired. Reconnect to keep syncing.');
        setCloudModalOpen(true);
        throw new Error('Reconnect Google Drive to continue.');
      }
    },
    [drive, session?.email],
  );

  useEffect(() => {
    if (autoConnectTriedRef.current) return;
    if (localStorage.getItem('signfold.hasConnected') !== '1') return;
    const clientId = getStoredClientId();
    if (!clientId) return;
    autoConnectTriedRef.current = true;
    void connectDrive(clientId, getStoredFolderPath(), { silent: true, quiet: true }).catch(
      () => undefined,
    );
  }, [connectDrive]);

  useEffect(() => {
    if (cloudStatus !== 'connected' || !drive || !rootFolderId) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const savedId = await drive.saveSettings(rootFolderId, settings, settingsFileId);
          if (savedId !== settingsFileId) setSettingsFileId(savedId);
        } catch (error) {
          if (!(error instanceof DriveAuthError)) return;
          const clientId = getStoredClientId();
          if (clientId) {
            try {
              const auth = await requestGoogleToken(clientId, {
                silent: true,
                loginHint: session?.email,
              });
              drive.setToken(auth.token);
              setSession(auth);
              setCloudStatus('connected');
              const savedId = await drive.saveSettings(rootFolderId, settings, settingsFileId);
              if (savedId !== settingsFileId) setSettingsFileId(savedId);
              return;
            } catch {
            }
          }
          setCloudStatus('expired');
        }
      })();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [settings, cloudStatus, drive, rootFolderId, session?.email, settingsFileId]);

  const openDocument = useCallback(
    async (name: string, bytes: Uint8Array, driveFileId?: string): Promise<boolean> => {
      setLoadingDocument(true);
      try {
        const loaded = await loadPdf(name, bytes, driveFileId);
        setDocument(loaded);
        setItems([]);
        setSelectedId(null);
        setEditingId(null);
        setCurrentPage(1);
        setMode('text');
        if (driveFileId) {
          setSettings((current) => ({
            ...current,
            recent: markRecentOpened(current.recent, driveFileId, name),
          }));
        }
        return true;
      } catch (error) {
        toast(
          error instanceof Error
            ? `Could not open the PDF: ${error.message}`
            : 'Could not open that PDF.',
          'error',
        );
        return false;
      } finally {
        setLoadingDocument(false);
      }
    },
    [toast],
  );

  const openLocalFile = useCallback(
    async (file: File) => {
      if (!isPdfFile(file)) {
        toast('Choose a PDF file to open.', 'error');
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const opened = await openDocument(file.name, new Uint8Array(buffer));
        if (opened && cloudStatus !== 'connected') {
          toast('Opened locally. Connect Drive to keep documents in the cloud.', 'info');
        }
      } catch {
        toast('Could not read that file.', 'error');
      }
      setSidebarOpen(false);
    },
    [cloudStatus, openDocument, toast],
  );

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void openLocalFile(file);
  };

  const openRecentDocument = useCallback(
    async (recent: RecentDocument) => {
      if (!drive) {
        setCloudModalOpen(true);
        return;
      }
      setLoadingRecentId(recent.id);
      try {
        const bytes = await withDrive((client) => client.downloadFile(recent.id));
        const opened = await openDocument(recent.name, bytes, recent.id);
        if (opened) setSidebarOpen(false);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not open that Drive document.', 'error');
      } finally {
        setLoadingRecentId('');
      }
    },
    [drive, openDocument, toast, withDrive],
  );

  const refreshRecent = useCallback(async () => {
    if (!drive || !documentsFolderId) {
      setCloudModalOpen(true);
      return;
    }
    try {
      const files = await withDrive((client) => client.listDocuments(documentsFolderId));
      setSettings((current) => ({ ...current, recent: mergeRecent(current.recent, files) }));
      toast('Drive documents refreshed', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not refresh Drive documents.', 'error');
    }
  }, [documentsFolderId, drive, toast, withDrive]);

  const handleUpdateItem = useCallback(
    (id: string, updater: (item: AnnotationItem) => AnnotationItem) => {
      setItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
    },
    [],
  );

  const placeSignature = useCallback(
    (
      asset: SignatureAsset,
      page = currentPage,
      point?: { x: number; y: number },
    ): boolean => {
      if (!document) {
        toast('Open a PDF first, then place your signature.', 'info');
        return false;
      }
      const pageNumber = clamp(page, 1, document.pageSizes.length);
      const pageSize = document.pageSizes[pageNumber - 1];
      const ratio = asset.height > 0 ? asset.width / asset.height : 3;
      const desiredWidth = asset.kind === 'initials' ? 120 : 190;
      const width = Math.min(desiredWidth, pageSize.width * 0.55);
      const height = Math.max(16, width / ratio);
      const x = clamp(
        point ? point.x - width / 2 : (pageSize.width - width) / 2,
        0,
        Math.max(0, pageSize.width - width),
      );
      const y = clamp(
        point ? point.y - height / 2 : pageSize.height * 0.55 - height / 2,
        0,
        Math.max(0, pageSize.height - height),
      );
      const stamp: StampAnnotation = {
        id: createId('stamp'),
        kind: 'stamp',
        page: pageNumber,
        x,
        y,
        width,
        height,
        dataUrl: asset.dataUrl,
        assetKind: asset.kind,
        assetId: asset.id,
      };
      setItems((current) => [...current, stamp]);
      setSelectedId(stamp.id);
      setEditingId(null);
      return true;
    },
    [currentPage, document, toast],
  );

  const placeEmail = useCallback(
    (asset: EmailAsset, page = currentPage, point?: { x: number; y: number }) => {
      if (!document) {
        toast('Open a PDF first, then add an email stamp.', 'info');
        return;
      }
      const pageNumber = clamp(page, 1, document.pageSizes.length);
      const pageSize = document.pageSizes[pageNumber - 1];
      const fontSize = 14;
      const estimatedWidth = Math.min(asset.value.length * fontSize * 0.52, pageSize.width * 0.9);
      const x = clamp(
        point ? point.x - estimatedWidth / 2 : (pageSize.width - estimatedWidth) / 2,
        0,
        Math.max(0, pageSize.width - estimatedWidth),
      );
      const y = clamp(
        point ? point.y - fontSize / 2 : pageSize.height * 0.5,
        0,
        Math.max(0, pageSize.height - fontSize),
      );
      const text: TextAnnotation = {
        id: createId('text'),
        kind: 'text',
        page: pageNumber,
        x,
        y,
        text: asset.value,
        fontSize,
        color: '#111827',
        fontFamily: 'Helvetica',
      };
      setItems((current) => [...current, text]);
      setSelectedId(text.id);
      setEditingId(null);
    },
    [currentPage, document, toast],
  );

  const handleDropAsset = useCallback(
    (page: number, x: number, y: number, payload: string) => {
      try {
        const parsed = JSON.parse(payload) as { type?: string; id?: string };
        if (!parsed.id) return;
        if (parsed.type === 'signature') {
          const asset = settings.signatures.find((item) => item.id === parsed.id);
          if (asset) placeSignature(asset, page, { x, y });
        } else if (parsed.type === 'email') {
          const asset = settings.emails.find((item) => item.id === parsed.id);
          if (asset) placeEmail(asset, page, { x, y });
        }
      } catch {
      }
    },
    [placeEmail, placeSignature, settings.emails, settings.signatures],
  );

  const createText = useCallback(
    (page: number, x: number, y: number) => {
      if (!document) return;
      const pageSize = document.pageSizes[page - 1];
      if (!pageSize) return;
      const text: TextAnnotation = {
        id: createId('text'),
        kind: 'text',
        page,
        x: clamp(x, 0, Math.max(0, pageSize.width - 12)),
        y: clamp(y, 0, Math.max(0, pageSize.height - 20)),
        text: '',
        fontSize: 14,
        color: '#111827',
        fontFamily: 'Helvetica',
      };
      setItems((current) => [...current, text]);
      setSelectedId(text.id);
      setEditingId(text.id);
    },
    [document],
  );

  const commitText = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (item?.kind === 'text' && !item.text.trim()) {
        setItems((current) => current.filter((candidate) => candidate.id !== id));
        setSelectedId((current) => (current === id ? null : current));
      }
      setEditingId((current) => (current === id ? null : current));
    },
    [items],
  );

  const deleteItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setEditingId((current) => (current === id ? null : current));
  }, []);

  const startEditing = useCallback((id: string) => {
    setSelectedId(id);
    setEditingId(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        setSidebarOpen(false);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        deleteItem(selectedId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteItem, selectedId]);

  const handleSaveSignature = useCallback(
    async (payload: {
      kind: SignatureKind;
      name: string;
      dataUrl: string;
      width: number;
      height: number;
    }) => {
      const asset: SignatureAsset = {
        id: createId('sig'),
        kind: payload.kind,
        name: payload.name,
        dataUrl: payload.dataUrl,
        width: payload.width,
        height: payload.height,
        createdAt: new Date().toISOString(),
      };
      setSettings((current) => ({
        ...current,
        signatures: [asset, ...current.signatures],
        updatedAt: new Date().toISOString(),
      }));
      setSignatureModalOpen(false);
      toast(
        cloudStatus === 'connected'
          ? 'Signature saved to your Drive'
          : 'Signature added for this session. Connect Drive to keep it.',
        cloudStatus === 'connected' ? 'success' : 'info',
      );
    },
    [cloudStatus, toast],
  );

  const handleAddEmail = useCallback(
    (value: string) => {
      const asset: EmailAsset = {
        id: createId('email'),
        value,
        createdAt: new Date().toISOString(),
      };
      setSettings((current) => ({
        ...current,
        emails: [asset, ...current.emails.filter((item) => item.value !== value)],
        updatedAt: new Date().toISOString(),
      }));
      toast(
        cloudStatus === 'connected'
          ? 'Email stamp saved'
          : 'Email stamp added for this session. Connect Drive to keep it.',
        cloudStatus === 'connected' ? 'success' : 'info',
      );
    },
    [cloudStatus, toast],
  );

  const deleteSignature = useCallback((asset: SignatureAsset) => {
    setSettings((current) => ({
      ...current,
      signatures: current.signatures.filter((item) => item.id !== asset.id),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const deleteEmail = useCallback((asset: EmailAsset) => {
    setSettings((current) => ({
      ...current,
      emails: current.emails.filter((item) => item.id !== asset.id),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handlePhoneSignature = useCallback(
    (signature: ReceivedPhoneSignature) => {
      const asset: SignatureAsset = {
        id: createId('sig'),
        kind: signature.kind,
        name: signature.kind === 'signature' ? 'Phone signature' : 'Phone initials',
        dataUrl: signature.dataUrl,
        width: signature.width,
        height: signature.height,
        createdAt: new Date().toISOString(),
      };
      setSettings((current) => ({
        ...current,
        signatures: [asset, ...current.signatures],
        updatedAt: new Date().toISOString(),
      }));

      const placed = document ? placeSignature(asset) : false;
      if (cloudStatus === 'connected') {
        toast(
          placed ? 'Phone signature received and placed on the page' : 'Phone signature saved',
          'success',
        );
      } else {
        toast('Phone signature received for this session. Connect Drive to keep it.', 'info');
      }
    },
    [cloudStatus, document, placeSignature, toast],
  );

  const drawSignature = useCallback((kind: SignatureKind) => {
    setSignatureKind(kind);
    setSignatureModalOpen(true);
  }, []);

  const useSignature = useCallback(
    (asset: SignatureAsset) => {
      placeSignature(asset);
      setSidebarOpen(false);
    },
    [placeSignature],
  );

  const useEmail = useCallback(
    (asset: EmailAsset) => {
      placeEmail(asset);
      setSidebarOpen(false);
    },
    [placeEmail],
  );

  const handleDownload = useCallback(async () => {
    if (!document) return;
    try {
      const bytes = await exportSignedPdf(document, items);
      downloadBlob(
        new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
        sanitizePdfName(document.name),
      );
      toast('Signed PDF downloaded', 'success');
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Could not create the signed PDF.',
        'error',
      );
    }
  }, [document, items, toast]);

  const handleSaveToDrive = useCallback(async () => {
    if (!document) return;
    if (cloudStatus !== 'connected' || !drive || !documentsFolderId) {
      setCloudModalOpen(true);
      return;
    }

    setSavingPdf(true);
    try {
      const bytes = await exportSignedPdf(document, items);
      const saved = await withDrive(async (client) => {
        if (document.driveFileId) {
          try {
            await client.updatePdf(document.driveFileId, bytes);
            return { id: document.driveFileId, name: document.name };
          } catch (error) {
            if (!(error instanceof DriveError) || error.status !== 404) throw error;
          }
        }
        const uploaded = await client.uploadPdf(
          documentsFolderId,
          sanitizePdfName(document.name),
          bytes,
        );
        return { id: uploaded.id, name: uploaded.name };
      });

      setDocument((current) => (current ? { ...current, driveFileId: saved.id } : current));
      setSettings((current) => ({
        ...current,
        recent: touchRecent(current.recent, {
          id: saved.id,
          name: saved.name,
          modifiedTime: new Date().toISOString(),
          openedAt: new Date().toISOString(),
        }),
        updatedAt: new Date().toISOString(),
      }));
      toast('Saved to Google Drive', 'success');
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Could not save the PDF to Google Drive.',
        'error',
      );
    } finally {
      setSavingPdf(false);
    }
  }, [cloudStatus, document, documentsFolderId, drive, items, toast, withDrive]);

  const disconnectDrive = useCallback(() => {
    localStorage.setItem('signfold.hasConnected', '0');
    setCloudStatus('disconnected');
    setSession(null);
    setDrive(null);
    setRootFolderId('');
    setDocumentsFolderId('');
    setSettingsFileId(undefined);
    setSettings(createDefaultSettings());
    setCloudModalOpen(false);
    setCloudError('');
    toast('Google Drive disconnected', 'info');
  }, [toast]);

  const handleWorkspaceDrop = (event: React.DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (!isPdfFile(file)) {
      toast('Drop a PDF file to open it.', 'error');
      return;
    }
    void openLocalFile(file);
  };

  return (
    <div className="app-shell">
      <TopBar
        documentName={document?.name}
        cloudStatus={cloudStatus}
        email={session?.email}
        saving={savingPdf}
        hasDocument={Boolean(document)}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
        onConnectClick={() => setCloudModalOpen(true)}
        onOpenFile={() => fileInputRef.current?.click()}
        onSaveToDrive={() => void handleSaveToDrive()}
        onDownload={() => void handleDownload()}
        onSignOnPhone={() => setQrOpen(true)}
      />

      <div className="app-body">
        <Sidebar
          open={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          cloudStatus={cloudStatus}
          email={session?.email}
          recent={settings.recent}
          currentDocId={document?.driveFileId}
          loadingRecentId={loadingRecentId}
          signatures={settings.signatures}
          emails={settings.emails}
          onConnectClick={() => setCloudModalOpen(true)}
          onOpenFile={() => fileInputRef.current?.click()}
          onOpenRecent={(recent) => void openRecentDocument(recent)}
          onRefreshRecent={() => void refreshRecent()}
          onUseSignature={useSignature}
          onUseEmail={useEmail}
          onDrawSignature={drawSignature}
          onSignOnPhone={() => setQrOpen(true)}
          onDeleteSignature={deleteSignature}
          onDeleteEmail={deleteEmail}
          onAddEmail={handleAddEmail}
        />

        {sidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close tools"
          />
        )}

        <main
          className="workspace"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={handleWorkspaceDrop}
        >
          {document ? (
            <PdfViewer
              document={document}
              items={items}
              selectedId={selectedId}
              editingId={editingId}
              mode={mode}
              onModeChange={setMode}
              onCurrentPageChange={setCurrentPage}
              onTextCreate={createText}
              onSelect={setSelectedId}
              onEdit={startEditing}
              onUpdateItem={handleUpdateItem}
              onCommitText={commitText}
              onDeleteItem={deleteItem}
              onDropAsset={handleDropAsset}
            />
          ) : (
            <EmptyState
              connected={cloudStatus === 'connected'}
              loading={loadingDocument}
              onOpenFile={() => fileInputRef.current?.click()}
              onConnect={() => setCloudModalOpen(true)}
            />
          )}

          {loadingDocument && document && (
            <div className="workspace-loading">
              <span className="spinner dark" />
              <span>Opening PDF…</span>
            </div>
          )}
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        onChange={handleFileInput}
      />

      <CloudModal
        open={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        status={cloudStatus}
        email={session?.email}
        folderPath={folderPath}
        busy={connecting}
        error={cloudError}
        onConnect={connectDrive}
        onDisconnect={disconnectDrive}
      />

      <SignatureModal
        open={signatureModalOpen}
        initialKind={signatureKind}
        onClose={() => setSignatureModalOpen(false)}
        onSave={handleSaveSignature}
      />

      <QrModal open={qrOpen} onClose={() => setQrOpen(false)} onReceived={handlePhoneSignature} />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
