// Admin API: authentication, CSRF, CRUD, and endpoint verification cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, adminLogin, TEST_EMAIL, TEST_PASSWORD } from './helpers/app.js';
import { sha256Hex } from '../src/util/crypto.js';

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
    assert.equal((await settings.json()).data.settings.backoff_base_ms, 30000);

    const deleted = await request(app.baseUrl, `/routes/${(await route.json()).data.id}`, {
      method: 'DELETE', cookie: session.cookie, csrf: session.csrf,
    });
    assert.equal(deleted.status, 200);
    const after = await request(app.baseUrl, '/models', { cookie: session.cookie });
    assert.equal((await after.json()).data.models[0].routes.length, 0);
  });

  await t.test('soft-deleted names and hashes can be reused', async () => {
    const providerName = 'reuse-provider';
    const created = await request(app.baseUrl, '/providers', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { name: providerName, baseUrl: 'http://127.0.0.1:9999/v1' },
    });
    assert.equal(created.status, 201);
    const providerId = (await created.json()).data.id;
    await request(app.baseUrl, `/providers/${providerId}`, { method: 'DELETE', cookie: session.cookie, csrf: session.csrf });
    const recreated = await request(app.baseUrl, '/providers', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf,
      body: { name: providerName, baseUrl: 'http://127.0.0.1:9999/v1' },
    });
    assert.equal(recreated.status, 201, 'provider name is reusable after delete');

    const modelName = 'reuse-model';
    const model = await request(app.baseUrl, '/models', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { name: modelName },
    });
    assert.equal(model.status, 201);
    const modelId = (await model.json()).data.id;
    await request(app.baseUrl, `/models/${modelId}`, { method: 'DELETE', cookie: session.cookie, csrf: session.csrf });
    const recreatedModel = await request(app.baseUrl, '/models', {
      method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { name: modelName },
    });
    assert.equal(recreatedModel.status, 201, 'model name is reusable after delete');

    const { token, raw } = app.app.registry.createToken({ label: 'reuse-token' });
    const hash = sha256Hex(raw);
    app.app.registry.softDeleteToken(token.id);
    const imported = app.app.registry.importToken({ keyHash: hash, label: 'reuse-token-2' });
    assert.equal(imported.keyHash, hash, 'token hash is reusable after delete');
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

test('login body parse errors map to 400 instead of 401', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  const response = await fetch(`${app.baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'invalid_json');
});

test('password change verifies current, applies, and invalidates sessions', async (t) => {
  const app = await createTestApp();
  const first = await adminLogin(app.baseUrl);
  await t.after(() => app.close());

  const wrong = await request(app.baseUrl, '/session/password', {
    method: 'PUT', cookie: first.cookie, csrf: first.csrf,
    body: { currentPassword: 'wrong-password', newPassword: 'new-password-123' },
  });
  assert.equal(wrong.status, 401, 'wrong current password rejected');

  const short = await request(app.baseUrl, '/session/password', {
    method: 'PUT', cookie: first.cookie, csrf: first.csrf,
    body: { currentPassword: TEST_PASSWORD, newPassword: 'short' },
  });
  assert.equal(short.status, 422, 'short new password rejected');

  const changed = await request(app.baseUrl, '/session/password', {
    method: 'PUT', cookie: first.cookie, csrf: first.csrf,
    body: { currentPassword: TEST_PASSWORD, newPassword: 'new-password-123' },
  });
  assert.equal(changed.status, 200);

  const stale = await request(app.baseUrl, '/session', { cookie: first.cookie });
  assert.equal(stale.status, 401, 'old session invalidated immediately');

  const oldLogin = await fetch(`${app.baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert.equal(oldLogin.status, 401, 'old password no longer works');

  const newLogin = await fetch(`${app.baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: 'new-password-123' }),
  });
  assert.equal(newLogin.status, 200, 'new password works');
});
