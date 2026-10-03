// Cryptographic helpers: hashing, password storage, secret encryption, and signed values.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;

// Returns the lowercase hex SHA-256 digest of a value.
export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Returns a cryptographically random hex token.
export function randomTokenHex(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

// Derives a stored password hash string using scrypt with a random salt.
export function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = scryptSync(password, salt, SCRYPT_KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('hex')}:${derived.toString('hex')}`;
}

// Verifies a password against a stored scrypt hash in constant time.
export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, 'hex');
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Derives a 32-byte AES key from the application secret.
function aesKey(secret) {
  return createHash('sha256').update(String(secret)).digest().subarray(0, AES_KEY_BYTES);
}

// Encrypts a string as base64 iv:tag:ciphertext using AES-256-GCM.
export function encryptSecret(plaintext, secret) {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', aesKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

// Decrypts a value produced by encryptSecret; returns empty string on tampering.
export function decryptSecret(blob, secret) {
  const parts = String(blob || '').split(':');
  if (parts.length !== 3) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', aesKey(secret), Buffer.from(parts[0], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Signs a value with HMAC-SHA256, returning `value.signature` in base64url.
export function signValue(value, secret) {
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

// Verifies a value produced by signValue and returns the raw value, or null.
export function verifySignedValue(signed, secret) {
  const idx = String(signed || '').lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  const provided = signed.slice(idx + 1);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}
