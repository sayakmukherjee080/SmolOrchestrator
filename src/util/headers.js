// Request/response header utilities for the transparent proxy layer.

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const REQUEST_STRIP = new Set([
  ...HOP_BY_HOP,
  'host',
  'authorization',
  'content-length',
  'accept-encoding',
  'cookie',
  'x-csrf-token',
  'forwarded',
  'x-request-id',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'cf-ipcountry',
  'cdn-loop',
]);

// Extracts a Bearer token from the Authorization header, or null.
export function parseBearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

// Builds the upstream request headers from the incoming request.
export function buildUpstreamRequestHeaders(request, upstreamKey) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (REQUEST_STRIP.has(lower) || lower.startsWith('x-forwarded-') || lower.startsWith('x-real-')) continue;
    headers.set(name, value);
  }
  headers.set('authorization', `Bearer ${upstreamKey}`);
  headers.set('content-type', 'application/json');
  headers.set('accept', request.headers.get('accept')?.includes('text/event-stream')
    ? 'text/event-stream'
    : 'application/json');
  headers.set('user-agent', 'smolorchestrator/2.0');
  return headers;
}

// Filters upstream response headers for the client, dropping hop-by-hop and stale framing headers.
export function buildClientResponseHeaders(upstreamResponse) {
  const headers = new Headers();
  for (const [name, value] of upstreamResponse.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === 'content-length' || lower === 'content-encoding') continue;
    headers.set(name, value);
  }
  headers.set('x-accel-buffering', 'no');
  return headers;
}

// Symbol used by the HTTP adapter to expose the peer socket address.
export const PEER_IP = Symbol('peerIp');

// Resolves the client IP, honouring trusted proxy headers when enabled.
export function clientIp(request, trustProxy) {
  if (trustProxy) {
    const cloudflare = request.headers.get('cf-connecting-ip');
    if (cloudflare) return cloudflare.trim();
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return request[PEER_IP] || 'unknown';
}
