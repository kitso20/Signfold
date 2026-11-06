import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, ExternalLink, HardDrive, LogOut, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import type { CloudStatus } from '../types';
import { DEFAULT_FOLDER_PATH, getConfiguredClientId } from '../lib/google';

interface CloudModalProps {
  open: boolean;
  onClose: () => void;
  status: CloudStatus;
  email?: string;
  folderPath: string;
  busy: boolean;
  error: string;
  onConnect: (clientId: string, folderPath: string) => Promise<void>;
  onDisconnect: () => void;
}

export default function CloudModal({
  open,
  onClose,
  status,
  email,
  folderPath,
  busy,
  error,
  onConnect,
  onDisconnect,
}: CloudModalProps) {
  const configuredClientId = getConfiguredClientId();
  const [clientId, setClientId] = useState(configuredClientId);
  const [path, setPath] = useState(folderPath || DEFAULT_FOLDER_PATH);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setClientId(configuredClientId || localStorage.getItem('signfold.googleClientId') || '');
    setPath(folderPath || DEFAULT_FOLDER_PATH);
    setLocalError('');
  }, [open, configuredClientId, folderPath]);

  const handleConnect = async () => {
    setLocalError('');
    if (!clientId.trim()) {
      setLocalError('Enter a Google OAuth client ID to connect Drive.');
      return;
    }
    if (!path.trim()) {
      setLocalError('Choose a folder name for your Signfold data.');
      return;
    }
    try {
      await onConnect(clientId.trim(), path.trim());
    } catch (connectError) {
      setLocalError(connectError instanceof Error ? connectError.message : 'Could not connect Drive.');
    }
  };

  const connected = status === 'connected';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={connected ? 'Google Drive connected' : 'Connect your cloud storage'}
      subtitle={
        connected
          ? 'Your signatures, saved emails, and documents live in your own Drive.'
          : 'Signfold uses your own Google Drive. No application server ever sees your files.'
      }
    >
      {connected ? (
        <div className="cloud-connected">
          <div className="account-card">
            <div className="account-avatar">{(email || 'G').slice(0, 1).toUpperCase()}</div>
            <div className="account-meta">
              <strong>{email || 'Google account'}</strong>
              <span className="status-pill ok">
                <CheckCircle2 size={13} /> Connected
              </span>
            </div>
          </div>

          <div className="cloud-folder-card">
            <HardDrive size={18} />
            <div>
              <span className="label">Storage folder</span>
              <strong>My Drive / {folderPath}</strong>
              <p>Everything Signfold saves is stored in this folder.</p>
            </div>
          </div>

          <div className="cloud-note">
            <ShieldCheck size={17} />
            <p>
              Access is limited to files and folders Signfold creates. Revoke access any time from
              your Google Account permissions page.
            </p>
          </div>

          <button
            className="btn btn-danger-ghost btn-full"
            type="button"
            onClick={onDisconnect}
            disabled={busy}
          >
            <LogOut size={16} /> Disconnect Google Drive
          </button>
        </div>
      ) : (
        <div className="cloud-setup">
          <div className="cloud-hero">
            <span className="cloud-hero-icon">
              <Cloud size={24} />
            </span>
            <div>
              <strong>Private by design</strong>
              <p>
                Signatures and documents sync between devices through your Drive account. The app
                runs entirely in your browser.
              </p>
            </div>
          </div>

          {!configuredClientId && (
            <div className="setup-steps">
              <h3>One-time Google setup</h3>

              <div className="setup-part">
                <h4>Enable the Google Drive API</h4>
                <ol>
                  <li>
                    Select the correct project in the{' '}
                    <a
                      href="https://console.cloud.google.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Cloud Console <ExternalLink size={12} />
                    </a>
                    .
                  </li>
                  <li>
                    Go to{' '}
                    <a
                      href="https://console.cloud.google.com/apis/library"
                      target="_blank"
                      rel="noreferrer"
                    >
                      APIs &amp; Services → Library <ExternalLink size={12} />
                    </a>
                    .
                  </li>
                  <li>
                    Search for{' '}
                    <a
                      href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Drive API <ExternalLink size={12} />
                    </a>
                    , open it, and click <strong>Enable</strong>.
                  </li>
                  <li>
                    Verify it appears under{' '}
                    <a
                      href="https://console.cloud.google.com/apis/dashboard"
                      target="_blank"
                      rel="noreferrer"
                    >
                      APIs &amp; Services → Enabled APIs &amp; services{' '}
                      <ExternalLink size={12} />
                    </a>
                    .
                  </li>
                </ol>
                <p>Use the same project as your OAuth client. Enabling can take a minute.</p>
              </div>

              <div className="setup-part">
                <h4>Create the OAuth client</h4>
                <ol>
                  <li>
                    Configure the{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials/consent"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OAuth consent screen <ExternalLink size={12} />
                    </a>{' '}
                    and add your account as a test user if the app is in testing.
                  </li>
                  <li>
                    Create an{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OAuth 2.0 Web application client <ExternalLink size={12} />
                    </a>
                    .
                  </li>
                  <li>
                    Add <code>{window.location.origin}</code> as an authorized JavaScript origin.
                  </li>
                  <li>Paste the client ID below. It is public configuration, not a secret.</li>
                </ol>
              </div>
            </div>
          )}

          <label className="field">
            <span>Google OAuth client ID</span>
            <input
              type="text"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="1234567890-abcdef.apps.googleusercontent.com"
              spellCheck={false}
              disabled={busy}
            />
            {configuredClientId && (
              <small>Preconfigured for this deployment. You can leave it as is.</small>
            )}
          </label>

          <label className="field">
            <span>Drive folder</span>
            <div className="input-prefix">
              <span>My Drive /</span>
              <input
                type="text"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="Signfold"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <small>
              Use the same folder on another device to restore your signatures and documents.
            </small>
          </label>

          {(localError || error) && <div className="form-error">{localError || error}</div>}

          <button
            className="btn btn-primary btn-full"
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy}
          >
            {busy ? <span className="spinner" /> : <Cloud size={17} />}
            {busy ? 'Connecting…' : status === 'expired' ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </button>

          <p className="fine-print">
            Signfold requests access only to files it creates in your Drive. It never requests
            access to your entire Drive.
          </p>
        </div>
      )}
    </Modal>
  );
}
