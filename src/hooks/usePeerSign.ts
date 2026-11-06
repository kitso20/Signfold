import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { createId } from '../lib/utils';
import type { SignatureKind } from '../types';

export type PeerSessionStatus = 'starting' | 'waiting' | 'connecting' | 'connected' | 'received' | 'error';

export interface ReceivedPhoneSignature {
  kind: SignatureKind;
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_SIGNATURE_LENGTH = 6_000_000;

function buildPeerOptions() {
  const host = import.meta.env.VITE_PEER_HOST?.trim();
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };
  if (!host) return { config, debug: 0 };
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT || 443),
    path: import.meta.env.VITE_PEER_PATH || '/',
    secure: import.meta.env.VITE_PEER_SECURE !== 'false',
    config,
    debug: 0,
  };
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

    const id = `signfold-${createId('').replace('_', '')}`.toLowerCase();
    setSessionId(id);

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = `${baseUrl}#/sign?session=${encodeURIComponent(id)}`;
    setMobileUrl(url);

    try {
      setQrDataUrl(
        await QRCode.toDataURL(url, {
          width: 360,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#151827', light: '#ffffff' },
        }),
      );
    } catch {
      setError('Could not create the QR code.');
      setStatus('error');
      return;
    }

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
