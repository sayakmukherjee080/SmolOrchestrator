// Admin API client with CSRF handling and envelope unwrapping.
let csrfToken = '';

// Stores the CSRF token returned by the session endpoint.
export function setCsrf(token) {
  csrfToken = token || '';
}

// Calls the admin API and returns the unwrapped data payload.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { success: false, error: `HTTP ${response.status}`, code: 'http_error' };
  }
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.code = payload.code;
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload.data;
}
