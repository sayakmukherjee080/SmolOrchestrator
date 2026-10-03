// Gateway authentication and token model scoping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Seeds one provider, one model with a route, and returns the model.
function seed(app, upstreamBase) {
  const provider = app.addProvider('stub', upstreamBase);
  const model = app.app.registry.createModel({ name: 'ds-flash' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'upstream-flash' });
  return model;
}

test('gateway auth and scoping', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const model = seed(app, upstream.baseUrl);
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await t.test('rejects missing key', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'ds-flash', messages: [] }),
    });
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_api_key');
  });

  await t.test('rejects invalid key', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
      body: JSON.stringify({ model: 'ds-flash', messages: [] }),
    });
    assert.equal(response.status, 401);
  });

  await t.test('rejects models outside the token scope', async () => {
    app.app.registry.createModel({ name: 'other-model' });
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ model: 'other-model', messages: [] }),
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error.code, 'model_not_found');
  });

  await t.test('allows a scoped request through', async () => {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ model: 'ds-flash', messages: [{ role: 'user', content: 'hi' }] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.choices[0].message.content, 'hello');
    assert.equal(upstream.state.requests[0].body.model, 'upstream-flash', 'model rewritten upstream');
  });

  await t.test('lists only scoped models', async () => {
    const response = await fetch(`${app.baseUrl}/v1/models`, {
      headers: { authorization: `Bearer ${raw}` },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.data.map((entry) => entry.id), ['ds-flash']);
  });
});
