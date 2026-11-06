import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { Check, Eraser, Loader2, PenLine, RefreshCcw, Send, WifiOff } from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas';
import { buildPeerOptions } from '../lib/peerOptions';
import type { SignatureKind } from '../types';

type PhoneStatus = 'connecting' | 'connected' | 'error' | 'sent';

function getSessionId(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('session') || '';
}

export default function MobileSignPage() {
  const sessionId = getSessionId();
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const sentRef = useRef(false);
  const [kind, setKind] = useState<SignatureKind>('signature');
  const [hasInk, setHasInk] = useState(false);
  const [status, setStatus] = useState<PhoneStatus>('connecting');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setStatus('connecting');
    setError('');

    const peer = new Peer(buildPeerOptions());

    peer.on('open', () => {
      if (cancelled) return;
      const connection = peer.connect(sessionId, { reliable: true });
      connectionRef.current = connection;

      connection.on('open', () => {
        if (!cancelled) setStatus('connected');
      });

      connection.on('error', () => {
        if (!cancelled) {
          setStatus('error');
          setError('The link to the desktop app dropped. Ask for a new QR code.');
        }
      });

      connection.on('close', () => {
        if (!cancelled && !sentRef.current) {
          setStatus('error');
          setError('The desktop session closed. Ask for a new QR code.');
        }
      });
    });

    peer.on('error', (peerError) => {
      if (cancelled) return;
      const type = (peerError as { type?: string }).type;
      setStatus('error');
      if (type === 'peer-unavailable') {
        setError('This signing session has ended. Ask the desktop app for a new QR code.');
      } else if (type === 'network' || type === 'server-error') {
        setError('Could not reach the pairing service. Check your connection and try again.');
      } else {
        setError(peerError.message || 'Could not connect to the desktop app.');
      }
    });

    return () => {
      cancelled = true;
      connectionRef.current?.close();
      peer.destroy();
    };
  }, [sessionId, retryKey]);

  const reset = useCallback(() => {
    canvasRef.current?.clear();
    sentRef.current = false;
    setHasInk(false);
    setError('');
  }, []);

  const handleKindChange = (next: SignatureKind) => {
    setKind(next);
    reset();
  };

  const handleSend = () => {
    const connection = connectionRef.current;
    const image = canvasRef.current?.exportTrimmed();
    if (!image) {
      setError('Draw your signature or initials first.');
      return;
    }
    if (!connection || !connection.open) {
      setError('The desktop app is not connected. Ask for a new QR code.');
      return;
    }
    setSending(true);
    try {
      connection.send({
        type: 'signature',
        kind,
        dataUrl: image.dataUrl,
        width: image.width,
        height: image.height,
      });
      sentRef.current = true;
      setStatus('sent');
      setError('');
    } catch {
      setError('Could not send the mark. Ask for a new QR code.');
    } finally {
      setSending(false);
    }
  };

  if (!sessionId) {
    return (
      <main className="phone-page">
        <div className="phone-card phone-message">
          <span className="phone-icon-bad">
            <WifiOff size={26} />
          </span>
          <h1>Signing link is incomplete</h1>
          <p>Open the QR code shown on your computer, or ask for a fresh signing link.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="phone-page">
      <header className="phone-header">
        <span className="brand-mark small">
          <PenLine size={18} />
        </span>
        <div>
          <strong>Signfold</strong>
          <span>Remote signature</span>
        </div>
        <span className={`phone-status status-${status}`}>
          {status === 'connected' ? <Check size={13} /> : status === 'connecting' ? <Loader2 className="spin" size={13} /> : null}
          {status === 'connected' ? 'Linked' : status === 'connecting' ? 'Linking' : status === 'sent' ? 'Sent' : 'Offline'}
        </span>
      </header>

      <section className="phone-card">
        {status === 'sent' ? (
          <div className="phone-success">
            <span className="phone-success-icon">
              <Check size={32} strokeWidth={2.5} />
            </span>
            <h1>Sent to your desktop</h1>
            <p>Your mark is ready in Signfold. Place it anywhere on the document.</p>
            <button
              className="btn btn-primary btn-full"
              type="button"
              onClick={() => {
                reset();
                setStatus(connectionRef.current?.open ? 'connected' : 'error');
              }}
            >
              <RefreshCcw size={16} /> Draw another
            </button>
          </div>
        ) : (
          <>
            <div className="phone-intro">
              <h1>{kind === 'signature' ? 'Draw your signature' : 'Draw your initials'}</h1>
              <p>Use your finger. The mark lands instantly on the desktop document.</p>
            </div>

            <div className="segmented phone-segmented">
              <button
                type="button"
                className={kind === 'signature' ? 'active' : ''}
                onClick={() => handleKindChange('signature')}
                disabled={status === 'error'}
              >
                Signature
              </button>
              <button
                type="button"
                className={kind === 'initials' ? 'active' : ''}
                onClick={() => handleKindChange('initials')}
                disabled={status === 'error'}
              >
                Initials
              </button>
            </div>

            <div className="phone-pad-wrap">
              <div className="sig-baseline" />
              <SignatureCanvas
                ref={canvasRef}
                className={kind === 'initials' ? 'initials-pad' : ''}
                lineWidth={3}
                onInkChange={setHasInk}
              />
              {!hasInk && (
                <div className="sig-placeholder">
                  <PenLine size={22} />
                  <span>Sign above the line</span>
                </div>
              )}
            </div>

            {error && <div className="form-error">{error}</div>}

            {status === 'error' ? (
              <button
                className="btn btn-primary btn-full"
                type="button"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                <RefreshCcw size={16} /> Retry connection
              </button>
            ) : (
              <div className="phone-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={reset}
                  disabled={!hasInk || sending}
                >
                  <Eraser size={16} /> Clear
                </button>
                <button
                  className="btn btn-primary grow"
                  type="button"
                  onClick={handleSend}
                  disabled={!hasInk || sending || status !== 'connected'}
                >
                  {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  {status === 'connecting' ? 'Connecting…' : 'Send to desktop'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <p className="phone-privacy">Direct, encrypted browser-to-browser connection. Nothing is uploaded.</p>
    </main>
  );
}
