// Validation failures and field validators shared by registry mutations.

// Validation failure raised by registry mutations; maps to HTTP 422.
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

// Validates an optional positive limit; null, undefined, or empty means unlimited.
export function optionalLimit(value, field, { integer = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new ValidationError(`${field} must be a positive number or null`);
  return integer ? Math.trunc(num) : num;
}

// Validates an optional cost: null means auto-priced, zero is explicitly free.
export function optionalCost(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new ValidationError(`${field} must be zero or positive, or null for auto pricing`);
  return num;
}

// Validates and normalises an HTTP(S) provider base URL.
export function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new ValidationError('base_url must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('base_url must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

// Validates a model/provider/token label-like string.
export function requireName(value, field) {
  const name = String(value ?? '').trim();
  if (!name) throw new ValidationError(`${field} is required`);
  if (name.length > 200) throw new ValidationError(`${field} is too long`);
  return name;
}

// Validates a non-negative finite number.
export function requireNumber(value, field, { min = 0, integer = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min) throw new ValidationError(`${field} must be a number >= ${min}`);
  return integer ? Math.trunc(num) : num;
}

const CAPABILITIES = new Set(['tools', 'vision', 'audio', 'json', 'reasoning']);

// Validates an optional capability list; null/undefined means unrestricted.
export function optionalCapabilities(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!Array.isArray(value)) throw new ValidationError('capabilities must be an array');
  const list = [...new Set(value.map((item) => String(item)))];
  for (const item of list) {
    if (!CAPABILITIES.has(item)) throw new ValidationError(`unknown capability: ${item}`);
  }
  return list;
}
