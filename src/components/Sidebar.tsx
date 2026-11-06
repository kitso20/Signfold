import { useState } from 'react';
import {
  Cloud,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { ASSET_DRAG_TYPE } from './PdfPage';
import { formatDate } from '../lib/utils';
import type {
  CloudStatus,
  EmailAsset,
  RecentDocument,
  SignatureAsset,
  SignatureKind,
} from '../types';

interface SidebarProps {
  open: boolean;
  onCloseMobile: () => void;
  cloudStatus: CloudStatus;
  email?: string;
  recent: RecentDocument[];
  currentDocId?: string;
  loadingRecentId: string;
  signatures: SignatureAsset[];
  emails: EmailAsset[];
  onConnectClick: () => void;
  onOpenFile: () => void;
  onOpenRecent: (document: RecentDocument) => void;
  onRefreshRecent: () => void;
  onUseSignature: (asset: SignatureAsset) => void;
  onUseEmail: (asset: EmailAsset) => void;
  onDrawSignature: (kind: SignatureKind) => void;
  onSignOnPhone: () => void;
  onDeleteSignature: (asset: SignatureAsset) => void;
  onDeleteEmail: (asset: EmailAsset) => void;
  onAddEmail: (value: string) => void;
}

export default function Sidebar({
  open,
  onCloseMobile,
  cloudStatus,
  email,
  recent,
  currentDocId,
  loadingRecentId,
  signatures,
  emails,
  onConnectClick,
  onOpenFile,
  onOpenRecent,
  onRefreshRecent,
  onUseSignature,
  onUseEmail,
  onDrawSignature,
  onSignOnPhone,
  onDeleteSignature,
  onDeleteEmail,
  onAddEmail,
}: SidebarProps) {
  const [addingEmail, setAddingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const connected = cloudStatus === 'connected';
  const signatureAssets = signatures.filter((asset) => asset.kind === 'signature');
  const initialAssets = signatures.filter((asset) => asset.kind === 'initials');

  const saveEmail = () => {
    const value = emailValue.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    onAddEmail(value);
    setEmailValue('');
    setAddingEmail(false);
  };

  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-mobile-head">
        <strong>Tools</strong>
        <button className="icon-btn" type="button" onClick={onCloseMobile} aria-label="Close tools">
          <X size={18} />
        </button>
      </div>

      <section className="side-section">
        <div className="side-heading">
          <span>Documents</span>
          {connected && (
            <button
              className="icon-btn tiny"
              type="button"
              onClick={onRefreshRecent}
              title="Refresh Drive documents"
              aria-label="Refresh Drive documents"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>

        <div className={`cloud-strip ${connected ? 'connected' : ''}`}>
          <span className="cloud-strip-icon">
            <Cloud size={16} />
          </span>
          <div className="cloud-strip-text">
            <strong>{connected ? email || 'Google Drive' : 'Drive not connected'}</strong>
            <span>{connected ? 'Synced to your account' : 'Signatures sync across devices'}</span>
          </div>
          <button className="link-btn" type="button" onClick={onConnectClick}>
            {connected ? 'Manage' : 'Connect'}
          </button>
        </div>

        <button className="btn btn-secondary btn-full open-file-btn" type="button" onClick={onOpenFile}>
          <FolderOpen size={16} /> Open PDF
        </button>

        {connected ? (
          <div className="recent-list">
            {recent.length === 0 ? (
              <div className="side-empty">
                <UploadCloud size={19} />
                <span>Saved documents appear here.</span>
              </div>
            ) : (
              recent.slice(0, 8).map((document) => (
                <button
                  key={document.id}
                  type="button"
                  className={`recent-item ${currentDocId === document.id ? 'active' : ''}`}
                  onClick={() => onOpenRecent(document)}
                  disabled={Boolean(loadingRecentId)}
                >
                  <FileText size={16} />
                  <span className="recent-meta">
                    <strong>{document.name}</strong>
                    <span>{formatDate(document.openedAt || document.modifiedTime)}</span>
                  </span>
                  {loadingRecentId === document.id && <Loader2 className="spin" size={15} />}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="side-empty connect-empty">
            <Cloud size={20} />
            <span>Connect Drive to see recent documents and sync signatures.</span>
          </div>
        )}
      </section>

      <section className="side-section">
        <div className="side-heading">
          <span>Signature & initials</span>
          <span className="count-chip">{signatures.length}</span>
        </div>

        <div className="draw-row">
          <button className="btn btn-ghost compact" type="button" onClick={() => onDrawSignature('signature')}>
            <PenLine size={15} /> Signature
          </button>
          <button className="btn btn-ghost compact" type="button" onClick={() => onDrawSignature('initials')}>
            <PenLine size={15} /> Initials
          </button>
        </div>

        <button className="phone-cta" type="button" onClick={onSignOnPhone}>
          <span className="phone-cta-icon">
            <Smartphone size={19} />
          </span>
          <span>
            <strong>Sign on phone</strong>
            <small>Scan a QR code and draw</small>
          </span>
        </button>

        {signatures.length === 0 ? (
          <div className="side-empty">
            <PenLine size={19} />
            <span>Draw a mark once, then stamp it anywhere.</span>
          </div>
        ) : (
          <div className="asset-groups">
            {signatureAssets.length > 0 && (
              <div>
                <span className="asset-label">Signatures</span>
                <div className="asset-grid">
                  {signatureAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onUse={() => onUseSignature(asset)}
                      onDelete={() => onDeleteSignature(asset)}
                    />
                  ))}
                </div>
              </div>
            )}
            {initialAssets.length > 0 && (
              <div>
                <span className="asset-label">Initials</span>
                <div className="asset-grid">
                  {initialAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onUse={() => onUseSignature(asset)}
                      onDelete={() => onDeleteSignature(asset)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="side-section">
        <div className="side-heading">
          <span>Email addresses</span>
          <button
            className="icon-btn tiny"
            type="button"
            onClick={() => setAddingEmail((value) => !value)}
            aria-label="Add email address"
          >
            <Plus size={15} />
          </button>
        </div>

        {addingEmail && (
          <div className="inline-email">
            <input
              type="email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveEmail();
                if (event.key === 'Escape') setAddingEmail(false);
              }}
              placeholder="name@company.com"
              autoFocus
            />
            <button className="btn btn-primary compact" type="button" onClick={saveEmail}>
              Add
            </button>
          </div>
        )}

        {emails.length === 0 ? (
          <div className="side-empty">
            <Mail size={19} />
            <span>Save email stamps for quick filling.</span>
          </div>
        ) : (
          <div className="email-list">
            {emails.map((asset) => (
              <div
                key={asset.id}
                className="email-item"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    ASSET_DRAG_TYPE,
                    JSON.stringify({ type: 'email', id: asset.id }),
                  );
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <button type="button" className="email-use" onClick={() => onUseEmail(asset)}>
                  <Mail size={14} />
                  <span>{asset.value}</span>
                </button>
                <button
                  type="button"
                  className="item-delete"
                  onClick={() => onDeleteEmail(asset)}
                  aria-label={`Delete ${asset.value}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function AssetCard({
  asset,
  onUse,
  onDelete,
}: {
  asset: SignatureAsset;
  onUse: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="asset-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(
          ASSET_DRAG_TYPE,
          JSON.stringify({ type: 'signature', id: asset.id }),
        );
        event.dataTransfer.effectAllowed = 'copy';
      }}
      title={`${asset.name} — click to place or drag onto the page`}
    >
      <button type="button" className="asset-use" onClick={onUse}>
        <img src={asset.dataUrl} alt={asset.name} draggable={false} />
      </button>
      <button
        type="button"
        className="item-delete"
        onClick={onDelete}
        aria-label={`Delete ${asset.name}`}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
