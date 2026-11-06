import { Cloud, CloudOff, Download, Menu, Save, Smartphone } from 'lucide-react';
import type { CloudStatus } from '../types';

interface TopBarProps {
  documentName?: string;
  cloudStatus: CloudStatus;
  email?: string;
  saving: boolean;
  hasDocument: boolean;
  onToggleSidebar: () => void;
  onConnectClick: () => void;
  onOpenFile: () => void;
  onSaveToDrive: () => void;
  onDownload: () => void;
  onSignOnPhone: () => void;
}

export default function TopBar({
  documentName,
  cloudStatus,
  email,
  saving,
  hasDocument,
  onToggleSidebar,
  onConnectClick,
  onOpenFile,
  onSaveToDrive,
  onDownload,
  onSignOnPhone,
}: TopBarProps) {
  const connected = cloudStatus === 'connected';
  return (
    <header className="topbar">
      <button className="icon-btn sidebar-toggle" type="button" onClick={onToggleSidebar} aria-label="Open tools">
        <Menu size={19} />
      </button>

      <div className="brand">
        <span className="brand-mark">
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path
              d="M6 3.75h7.2L18 8.55v11.7H6V3.75Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M13 3.9v5h4.8M9.1 15.2c2.6-1.9 4.2.8 5.9-.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="brand-name">Signfold</span>
      </div>

      <div className="doc-title">
        {documentName ? (
          <>
            <span className="doc-dot" />
            <span title={documentName}>{documentName}</span>
          </>
        ) : (
          <span className="muted">Fill, sign, and send PDFs</span>
        )}
      </div>

      <div className="top-actions">
        <button className="btn btn-ghost hide-sm" type="button" onClick={onOpenFile}>
          Open PDF
        </button>

        <button className="btn btn-ghost hide-sm sign-phone-btn" type="button" onClick={onSignOnPhone}>
          <Smartphone size={16} />
          Sign on phone
        </button>

        <button
          className="btn btn-ghost"
          type="button"
          onClick={onDownload}
          disabled={!hasDocument}
          title="Download signed PDF"
          aria-label="Download signed PDF"
        >
          <Download size={16} />
          <span className="hide-sm">Download</span>
        </button>

        <button
          className="btn btn-primary"
          type="button"
          onClick={onSaveToDrive}
          disabled={!hasDocument || saving}
          title={connected ? 'Save signed PDF to Google Drive' : 'Connect Drive to save'}
        >
          <Save size={16} />
          <span className="hide-sm">{saving ? 'Saving…' : 'Save to Drive'}</span>
        </button>

        <button
          className={`cloud-pill ${connected ? 'connected' : ''}`}
          type="button"
          onClick={onConnectClick}
          title={connected ? `Connected as ${email || 'Google user'}` : 'Connect Google Drive'}
        >
          {connected ? <Cloud size={16} /> : <CloudOff size={16} />}
          <span className="hide-md">{connected ? email || 'Drive' : 'Connect Drive'}</span>
          {cloudStatus === 'expired' && <span className="pill-alert">Reconnect</span>}
        </button>
      </div>
    </header>
  );
}
