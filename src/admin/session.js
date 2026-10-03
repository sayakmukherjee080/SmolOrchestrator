// Admin session management: scrypt login, signed cookies, CSRF tokens, lockout.
import { hashPassword, randomTokenHex, signValue, verifyPassword, verifySignedValue } from '../util/crypto.js';
import { envelopeError } from '../util/body.js';

const COOKIE_NAME = 'so_session';

// Parses a Cookie header into a plain object.
function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return cookies;
}

export function createSessionManager({ registry, config, logger }) {
  const failures = new Map();
  const dummyHash = hashPassword(randomTokenHex(16));

  // Returns true while the IP is locked out from login attempts.
  function locked(ip, now) {
    const hits = (failures.get(ip) || []).filter((ts) => ts > now - config.loginLockoutMs);
    failures.set(ip, hits);
    return hits.length >= config.loginMaxAttempts;
  }

  // Records a failed login attempt for an IP.
  function recordFailure(ip, now) {
    const hits = failures.get(ip) || [];
    hits.push(now);
    failures.set(ip, hits);
  }

  // Returns the single admin account row.
  function adminUser() {
    return registry.db.prepare('SELECT id, email, password_hash FROM admin ORDER BY id LIMIT 1').get();
  }

  // Builds the Set-Cookie value for a signed session token.
  function cookieValue(signed, maxAgeSeconds) {
    const secure = config.cookieSecure ? '; Secure' : '';
    return `${COOKIE_NAME}=${signed}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  }

  // Verifies credentials and returns a signed session cookie on success.
  function login(email, password, ip) {
    const now = Date.now();
    if (locked(ip, now)) {
      registry.queueAudit({ action: 'login', outcome: 'failure', ip, actor: String(email ?? '').slice(0, 200), details: { reason: 'locked' } });
      return { ok: false, status: 429, message: 'Too many attempts. Try again later.' };
    }
    const user = adminUser();
    const emailMatches = user && String(email || '').trim().toLowerCase() === user.email.toLowerCase();
    const passwordOk = typeof password === 'string' && password.length > 0
      && verifyPassword(password, emailMatches ? user.password_hash : dummyHash);
    if (!emailMatches || !passwordOk) {
      recordFailure(ip, now);
      registry.queueAudit({ action: 'login', outcome: 'failure', ip, actor: String(email ?? '').slice(0, 200) });
      return { ok: false, status: 401, message: 'Invalid credentials' };
    }
    const csrf = randomTokenHex(16);
    const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: now + config.sessionTtlMs, csrf })).toString('base64url');
    const signed = signValue(payload, config.appSecret);
    registry.queueAudit({ action: 'login', outcome: 'success', ip, actor: user.email });
    return { ok: true, cookie: cookieValue(signed, Math.floor(config.sessionTtlMs / 1000)), email: user.email, csrf };
  }

  // Returns the verified session payload, or null.
  function getSession(request) {
    const signed = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
    if (!signed) return null;
    const payload = verifySignedValue(signed, config.appSecret);
    if (!payload) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
      return data;
    } catch {
      return null;
    }
  }

  // Requires a valid session, returning an error response otherwise.
  function requireSession(request) {
    const session = getSession(request);
    if (!session) return { error: envelopeError('Authentication required', 'unauthorized', 401) };
    return { session };
  }

  // Requires the CSRF header to match the session token on state-changing requests.
  function requireCsrf(request, session) {
    if (request.method === 'GET' || request.method === 'HEAD') return null;
    const token = request.headers.get('x-csrf-token');
    if (!token || token !== session.csrf) return envelopeError('Invalid CSRF token', 'csrf_failed', 403);
    return null;
  }

  // Returns the cookie value that clears the session.
  function clearingCookie() {
    const secure = config.cookieSecure ? '; Secure' : '';
    return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }

  return { login, getSession, requireSession, requireCsrf, clearingCookie, logger };
}
