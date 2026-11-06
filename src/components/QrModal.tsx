import { useEffect, useState } from 'react';
import { Check, Link2, Loader2, RefreshCcw, Smartphone, Wifi } from 'lucide-react';
import Modal from './Modal';
import { usePeerSign, type ReceivedPhoneSignature } from '../hooks/usePeerSign';

interface QrModalProps {
  open: boolean;
  onClose: () => void;
  onReceived: (signature: ReceivedPhoneSignature) => void;
}

const STATUS_COPY: Record<string, string> = {
  starting: 'Creating a secure pairing session…',
  waiting: 'Waiting for your phone to connect',
  connecting: 'Phone found — establishing a direct link…',
  connected: 'Connected. Draw and submit on your phone.',
  received: 'Signature received',
  error: 'Pairing session failed',
};

export default function QrModal({ open, onClose, onReceived }: QrModalProps) {
  const [lastReceived, setLastReceived] = useState<ReceivedPhoneSignature | null>(null);
  const [copied, setCopied] = useState(false);
  const { status, qrDataUrl, mobileUrl, error, start, stop } = usePeerSign((signature) => {
    setLastReceived(signature);
    onReceived(signature);
  });

  useEffect(() => {
    if (open) {
      setLastReceived(null);
      setCopied(false);
      void start();
    } else {
      stop();
    }
    return () => {
      if (!open) stop();
    };
  }, [open, start, stop]);

  useEffect(() => {
    if (!open) return;
    return () => stop();
  }, [open, stop]);

  const copyLink = async () => {
    if (!mobileUrl) return;
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(mobileUrl);
        success = true;
      }
    } catch {
      success = false;
    }
    if (!success) {
      const textarea = document.createElement('textarea');
      textarea.value = mobileUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      success = document.execCommand('copy');
      textarea.remove();
    }
    setCopied(success);
    if (success) window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign on your phone"
      subtitle="Scan this code with your phone camera. The drawing comes back instantly."
      width="sm"
    >
      <div className="qr-layout">
        <div className={`qr-frame ${status === 'error' ? 'qr-error' : ''}`}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code linking to the phone signature page" />
          ) : (
            <div className="qr-loading">
              <Loader2 className="spin" size={28} />
            </div>
          )}
          <span className="qr-phone-icon">
            <Smartphone size={18} />
          </span>
        </div>

        <div className={`session-status status-${status}`}>
          <span className="status-dot" />
          <span>{STATUS_COPY[status]}</span>
          {status === 'received' && <Check size={15} />}
        </div>

        {lastReceived && (
          <div className="phone-preview">
            <span>Latest mark</span>
            <img src={lastReceived.dataUrl} alt={lastReceived.kind} />
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        {status === 'error' ? (
          <button className="btn btn-primary btn-full" type="button" onClick={() => void start()}>
            <RefreshCcw size={16} /> Start a new session
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-full"
            type="button"
            onClick={() => void copyLink()}
            disabled={!mobileUrl}
          >
            {copied ? <Check size={16} /> : <Link2 size={16} />}
            {copied ? 'Link copied' : 'Copy phone link'}
          </button>
        )}

        <div className="qr-note">
          <Wifi size={15} />
          <p>
            The phone connects directly to this browser over WebRTC. The pairing service only helps
            the two devices find each other; your drawing and documents never pass through it.
          </p>
        </div>
      </div>
    </Modal>
  );
}
