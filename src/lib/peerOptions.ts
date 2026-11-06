export function buildPeerOptions() {
  const host = import.meta.env.VITE_PEER_HOST?.trim();
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL?.trim();
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  const config = { iceServers };
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
