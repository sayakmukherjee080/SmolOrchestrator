// Runtime settings are hot: changes apply without restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one chat completion and drains the response.
async function chat(baseUrl, raw, model = 'hot') {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await response.text();
  return response;
}

// Seeds one provider/model/route and returns the pieces.
function seed(app, upstreamBase, options = {}) {
  const provider = app.addProvider(options.name ?? 'stub', upstreamBase);
  const model = app.app.registry.createModel({ name: options.model ?? 'hot' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  return { provider, model, route, raw };
}

test('max_attempts is read per request', async (t) => {
  const failing = await startStubUpstream((req, res) => jsonCompletion(res, { status: 500 }));
  const healthy = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const providerA = app.addProvider('a', failing.baseUrl);
  const providerB = app.addProvider('b', healthy.baseUrl);
  const model = app.app.registry.createModel({ name: 'attempts' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await failing.close();
    await healthy.close();
  });

  app.app.registry.setSetting('max_attempts', 1);
  assert.equal((await chat(app.baseUrl, raw, 'attempts')).status, 502, 'single attempt, no failover');
  assert.equal(failing.state.requests.length, 1);
  assert.equal(healthy.state.requests.length, 0);

  app.app.registry.setSetting('max_attempts', 8);
  routeA.consecutiveFailures = 0;
  routeA.cooldownUntil = 0;
  assert.equal((await chat(app.baseUrl, raw, 'attempts')).status, 200, 'failover restored');
  assert.equal(healthy.state.requests.length, 1);
});

test('max_body_bytes is read per request', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl, { model: 'body-limit' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('max_body_bytes', 2048);
  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'body-limit', messages: [{ role: 'user', content: 'x'.repeat(5000) }] }),
  });
  assert.equal(response.status, 413);
});

test('ip rate limit settings apply live', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl, { model: 'rate' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('ip_rate_limit', 1);
  app.app.registry.setSetting('ip_rate_window_ms', 60000);
  assert.equal((await chat(app.baseUrl, raw, 'rate')).status, 200);
  assert.equal((await chat(app.baseUrl, raw, 'rate')).status, 429);
});

test('login lockout thresholds apply live', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  app.app.registry.setSetting('login_max_attempts', 2);
  for (let i = 0; i < 2; i += 1) {
    const response = await fetch(`${app.baseUrl}/api/v1/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }),
    });
    assert.equal(response.status, 401);
  }
  const locked = await fetch(`${app.baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'test-password-123' }),
  });
  assert.equal(locked.status, 429);
});

test('metrics token setting applies live', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await fetch(`${app.baseUrl}/metrics`)).status, 200);
  app.app.registry.setSetting('metrics_token', 'scrape-me');
  assert.equal((await fetch(`${app.baseUrl}/metrics`)).status, 401);
  const authorized = await fetch(`${app.baseUrl}/metrics`, { headers: { authorization: 'Bearer scrape-me' } });
  assert.equal(authorized.status, 200);
});

test('response cache caps apply live', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'x'.repeat(700) }));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl, { model: 'caps' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('response_cache_max_total_bytes', 1024);
  async function ask(content) {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ model: 'caps', messages: [{ role: 'user', content }], temperature: 0 }),
    });
    await response.text();
    return response.headers.get('x-cache');
  }

  assert.equal(await ask('one'), 'miss');
  assert.equal(await ask('two'), 'miss');
  assert.equal(await ask('one'), 'miss', 'live byte cap evicted the oldest entry');
  assert.ok(app.app.gateway.responseCache.size <= 1);
});

test('probe prompt and token cap are read at probe time', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const { route } = seed(app, upstream.baseUrl, { model: 'probe-config' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('probe_prompt', 'custom-ping');
  app.app.registry.setSetting('probe_max_tokens', 7);
  await app.app.gateway.runProbe(route);
  const sent = upstream.state.requests.at(-1).body;
  assert.equal(sent.messages[0].content, 'custom-ping');
  assert.equal(sent.max_tokens, 7);
});
