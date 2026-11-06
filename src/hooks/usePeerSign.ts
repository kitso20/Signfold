import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { createId } from '../lib/utils';
import { buildPeerOptions } from '../lib/peerOptions';
import type { SignatureKind } from '../types';

export type PeerSessionStatus = 'starting' | 'waiting' | 'connecting' | 'connected' | 'received' | 'error';

export interface ReceivedPhoneSignature {
  kind: SignatureKind;
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_SIGNATURE_LENGTH = 6_000_000;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '[::]' ||
    host === '::' ||
    host === '::1' ||
    host === '[::1]' ||
    host.startsWith('127.')
  );
}

function getSigningBaseUrl(): { url?: string; error?: string } {
  const { protocol, origin, pathname, hostname } = window.location;
  if ((protocol !== 'http:' && protocol !== 'https:') || !origin || origin === 'null') {
    return {
      error:
        'Phone signing needs Signfold to be opened at a web address (http:// or https://), not as a local file. Use the deployed site or a local web server, then try again.',
    };
  }
  if (isLoopbackHost(hostname)) {
    return {
      error:
        'A phone cannot reach localhost. Open Signfold on this computer using its network address (for example http://192.168.1.20:5173) or the deployed HTTPS URL, then try again.',
    };
  }
  return { url: `${origin}${pathname}` };
}

export function usePeerSign(onSignature: (signature: ReceivedPhoneSignature) => void) {
  const [status, setStatus] = useState<PeerSessionStatus>('starting');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [mobileUrl, setMobileUrl] = useState('');
  const [error, setError] = useState('');
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const destroyedRef = useRef(false);
  const callbackRef = useRef(onSignature);

  useEffect(() => {
    callbackRef.current = onSignature;
  }, [onSignature]);

  const stop = useCallback(() => {
    destroyedRef.current = true;
    connectionRef.current?.close();
    connectionRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    destroyedRef.current = false;
    setStatus('starting');
    setError('');
    setQrDataUrl('');
    setSessionId('');
    setMobileUrl('');

    const base = getSigningBaseUrl();
    if (!base.url) {
      setError(base.error || 'Phone signing is not available from this address.');
      setStatus('error');
      return;
    }

    const id = `signfold-${createId('').replace('_', '')}`.toLowerCase();
    setSessionId(id);

    const url = `${base.url}#/sign?session=${encodeURIComponent(id)}`;
    setMobileUrl(url);

    try {
      const qr = await QRCode.toDataURL(url, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#151827', light: '#ffffff' },
      });
      if (destroyedRef.current) return;
      setQrDataUrl(qr);
    } catch {
      if (destroyedRef.current) return;
      setError('Could not create the QR code.');
      setStatus('error');
      return;
    }

    if (destroyedRef.current) return;
    const peer = new Peer(id, buildPeerOptions());
    peerRef.current = peer;

    peer.on('open', () => {
      if (!destroyedRef.current) setStatus('waiting');
    });

    peer.on('connection', (connection) => {
      if (destroyedRef.current) {
        connection.close();
        return;
      }
      connectionRef.current?.close();
      connectionRef.current = connection;
      setStatus('connecting');

      connection.on('open', () => {
        if (!destroyedRef.current) setStatus('connected');
      });

      connection.on('data', (raw) => {
        if (destroyedRef.current) return;
        if (!raw || typeof raw !== 'object') return;
        const payload = raw as Record<string, unknown>;
        if (payload.type !== 'signature') return;
        if (payload.kind !== 'signature' && payload.kind !== 'initials') return;
        if (typeof payload.dataUrl !== 'string' || !payload.dataUrl.startsWith('data:image/png;base64,')) return;
        if (payload.dataUrl.length > MAX_SIGNATURE_LENGTH) return;
        const width = Number(payload.width);
        const height = Number(payload.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

        callbackRef.current({
          kind: payload.kind,
          dataUrl: payload.dataUrl,
          width,
          height,
        });
        setStatus('received');
        window.setTimeout(() => {
          if (!destroyedRef.current) setStatus('connected');
        }, 2200);
      });

      connection.on('close', () => {
        if (!destroyedRef.current) setStatus('waiting');
      });

      connection.on('error', () => {
        if (!destroyedRef.current) {
          setError('The phone connection dropped. Ask the signer to reconnect.');
          setStatus('error');
        }
      });
    });

    peer.on('error', (peerError) => {
      if (destroyedRef.current) return;
      const type = (peerError as { type?: string }).type;
      if (type === 'peer-unavailable') {
        setError('That signing session no longer exists. Start a new session.');
      } else if (type === 'network' || type === 'server-error') {
        setError('Could not reach the pairing service. Check your network and try again.');
      } else {
        setError(peerError.message || 'The phone pairing session failed.');
      }
      setStatus('error');
    });
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { status, qrDataUrl, sessionId, mobileUrl, error, start, stop };
}
