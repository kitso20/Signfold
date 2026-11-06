import { Cloud, FileUp, PenLine, Smartphone, Stamp, Type } from 'lucide-react';

interface EmptyStateProps {
  connected: boolean;
  loading: boolean;
  onOpenFile: () => void;
  onConnect: () => void;
}

export default function EmptyState({ connected, loading, onOpenFile, onConnect }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-hero">
        <span className="empty-illustration">
          <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
            <rect x="19" y="12" width="68" height="90" rx="8" fill="#ffffff" stroke="#d9dce5" strokeWidth="2" />
            <path d="M39 34h28M39 46h34M39 58h18" stroke="#c9ceda" strokeWidth="3" strokeLinecap="round" />
            <path
              d="M45 78c8-9 14 3 24-7"
              fill="none"
              stroke="#4f46e5"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="85" cy="82" r="19" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="2" />
            <path
              d="m77.5 82 4.7 4.7 9-9.4"
              fill="none"
              stroke="#4f46e5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="empty-copy">
          <span className="eyebrow">No document open</span>
          <h1>Fill and sign any PDF, right in your browser.</h1>
          <p>
            Open a file to type anywhere, stamp saved signatures, and send a QR code to your phone
            for a real touch signature.
          </p>
          <div className="empty-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={onOpenFile} disabled={loading}>
              <FileUp size={18} />
              {loading ? 'Opening…' : 'Open a PDF'}
            </button>
            {!connected && (
              <button className="btn btn-ghost btn-lg" type="button" onClick={onConnect}>
                <Cloud size={18} /> Connect Drive
              </button>
            )}
          </div>
          <span className="drop-hint">or drop a PDF anywhere on this page</span>
        </div>
      </div>

      <div className="feature-row">
        <div className="feature-card">
          <span className="feature-icon">
            <Type size={20} />
          </span>
          <strong>Click to type</strong>
          <p>Drop a cursor anywhere and start writing. Styles stay editable.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">
            <Stamp size={20} />
          </span>
          <strong>Saved marks</strong>
          <p>Draw or import signatures and initials, then click or drag them onto the page.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">
            <Smartphone size={20} />
          </span>
          <strong>Sign on phone</strong>
          <p>Scan a QR code, draw on your phone, and watch the mark appear here.</p>
        </div>
      </div>

      <div className="empty-foot">
        <PenLine size={14} />
        <span>Private by design — files and signatures stay in your own Google Drive.</span>
      </div>
    </div>
  );
}
