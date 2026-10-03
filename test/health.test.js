// Health endpoints and gateway error cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('health endpoints report liveness and readiness', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  const live = await fetch(`${app.baseUrl}/health`);
  assert.equal(live.status, 200);
  assert.equal((await live.json()).status, 'ok');

  const ready = await fetch(`${app.baseUrl}/health/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).status, 'ready');
});

test('gateway validation and unknown routes', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'm' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await t.test('malformed JSON is rejected with 400', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: '{bad',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_json');
  });

  await t.test('missing model field is rejected with 400', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(response.status, 400);
  });

  await t.test('oversized body is rejected with 413', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x'.repeat(40 * 1024 * 1024) }] }),
    });
    assert.equal(response.status, 413);
  });

  await t.test('unknown v1 POST fails model validation', async () => {
    const response = await fetch(`${app.baseUrl}/v1/unknown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ input: 'x' }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_request_error');
  });

  await t.test('unknown v1 GET returns 404', async () => {
    const response = await fetch(`${app.baseUrl}/v1/unknown`);
    assert.equal(response.status, 404);
  });
});
