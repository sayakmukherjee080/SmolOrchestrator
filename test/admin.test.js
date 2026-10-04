// Admin API: authentication, CSRF, CRUD, and endpoint verification cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, adminLogin, TEST_EMAIL, TEST_PASSWORD } from './helpers/app.js';

// Performs a JSON admin request with optional session credentials.
function request(baseUrl, path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('admin API security and CRUD', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  await t.test('unauthenticated requests are rejected', async () => {
    const response = await request(app.baseUrl, '/models');
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.code, 'unauthorized');
  });

  await t.test('wrong credentials are rejected', async () => {
    const response = await request(app.baseUrl, '/session', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: 'wrong-password' },
    });
    assert.equal(response.status, 401);
  });

  const session = await adminLogin(app.baseUrl);

  await t.test('missing CSRF is rejected on mutations', async () => {
    const response = await request(app.baseUrl, '/models', {
      method: 'POST',
      cookie: session.cookie,
      body: { name: 'no-csrf' },
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'csrf_failed');
  });

  await t.test('malformed JSON is rejected', async () => {
    const response = await fetch(`${app.baseUrl}/api/v1/models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf },
      body: '{not json',
    });
    assert.equal(response.status, 400);
  });

  await t.test('full CRUD happy path', async () => {
    const provider = await request(app.baseUrl, '/providers', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
    });
    assert.equal(provider.status, 201);
    const providerId = (await provider.json()).data.id;

    const key = await request(app.baseUrl, `/providers/${providerId}/keys`, {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { label: 'main', key: 'sk-test-123' },
    });
    assert.equal(key.status, 201);

    const model = await request(app.baseUrl, '/models', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { name: 'deepseek-flash', balanceStrategy: 'round_robin' },
    });
    assert.equal(model.status, 201);
    const modelId = (await model.json()).data.id;

    const route = await request(app.baseUrl, `/models/${modelId}/routes`, {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { providerId, upstreamModel: 'deepseek/v4-flash', priority: 1, inputCostPerM: 0.2, outputCostPerM: 0.8 },
    });
    assert.equal(route.status, 201);

    const token = await request(app.baseUrl, '/tokens', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { label: 'opencode' },
    });
    assert.equal(token.status, 201);
    const tokenId = (await token.json()).data.id;
    const rawKey = (await request(app.baseUrl, '/tokens', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { label: 'second' },
    }).then((response) => response.json())).data.raw;
    assert.ok(rawKey && rawKey.length === 48, 'raw key is returned once');

    const scope = await request(app.baseUrl, `/tokens/${tokenId}/models`, {
      method: 'PUT', cookie: session.cookie, csrf: session.csrf, body: { modelIds: [modelId] },
    });
    assert.equal(scope.status, 200);
    assert.deepEqual((await scope.json()).data.modelIds, [modelId]);

    const models = await request(app.baseUrl, '/models', { cookie: session.cookie });
    const payload = await models.json();
    assert.equal(payload.data.models.length, 1);
    assert.equal(payload.data.models[0].routes.length, 1);

    const providers = await request(app.baseUrl, '/providers', { cookie: session.cookie });
    const providerList = (await providers.json()).data.providers;
    assert.equal(providerList.length, 1);
    assert.equal(providerList[0].keys.length, 1, 'key listed without plaintext');

    const settings = await request(app.baseUrl, '/settings', {
      method: 'PUT', cookie: session.cookie, csrf: session.csrf,
      body: { backoff_base_ms: 30000, probe_enabled: false },
    });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json()).data.backoff_base_ms, 30000);

    const deleted = await request(app.baseUrl, `/routes/${(await route.json()).data.id}`, {
      method: 'DELETE', cookie: session.cookie, csrf: session.csrf,
    });
    assert.equal(deleted.status, 200);
    const after = await request(app.baseUrl, '/models', { cookie: session.cookie });
    assert.equal((await after.json()).data.models[0].routes.length, 0);
  });

  await t.test('oversized body is rejected', async () => {
    const small = await createTestApp({ env: { MAX_BODY_BYTES: '4096' } });
    try {
      const smallSession = await adminLogin(small.baseUrl);
      const response = await request(small.baseUrl, '/models', {
        method: 'POST', cookie: smallSession.cookie, csrf: smallSession.csrf,
        body: { name: 'x'.repeat(10000) },
      });
      assert.equal(response.status, 413);
    } finally {
      await small.close();
    }
  });
});

test('login lockout ignores spoofed proxy headers when TRUST_PROXY is off', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(`${app.baseUrl}/api/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i + 1}` },
      body: JSON.stringify({ email: TEST_EMAIL, password: 'wrong' }),
    });
    assert.equal(response.status, 401);
  }
  const locked = await fetch(`${app.baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.99' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert.equal(locked.status, 429, 'lockout keyed to the real peer, not the header');
});
