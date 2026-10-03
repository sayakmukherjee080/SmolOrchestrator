// Capability-aware routing and preflight validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends a chat completion with an optional extra payload.
async function chat(baseUrl, raw, body) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('tools requests route only to tool-capable routes', async (t) => {
  const plain = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'plain' }));
  const capable = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'capable' }));
  const app = await createTestApp();
  const providerPlain = app.addProvider('plain', plain.baseUrl);
  const providerCapable = app.addProvider('capable', capable.baseUrl);
  const model = app.app.registry.createModel({ name: 'tools-model' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerPlain.id, upstreamModel: 'u', capabilities: [] });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerCapable.id, upstreamModel: 'u', capabilities: ['tools'] });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await plain.close();
    await capable.close();
  });

  const result = await chat(app.baseUrl, raw, {
    model: 'tools-model',
    messages: [{ role: 'user', content: 'weather?' }],
    tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
  });
  assert.equal(result.status, 200);
  assert.equal(plain.state.requests.length, 0, 'non-capable route skipped');
  assert.equal(capable.state.requests.length, 1, 'capable route served');
});

test('unsupported capabilities fail fast with 400', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('plain', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'text-only' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u', capabilities: [] });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const result = await chat(app.baseUrl, raw, {
    model: 'text-only',
    messages: [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxxx' } }],
    }],
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'unsupported_feature');
  assert.equal(upstream.state.requests.length, 0, 'no upstream spend');
});

test('context limits skip routes that cannot fit the request', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('small', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'small-ctx' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u', maxContext: 100 });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const result = await chat(app.baseUrl, raw, {
    model: 'small-ctx',
    messages: [{ role: 'user', content: 'x'.repeat(4000) }],
    max_tokens: 100,
  });
  assert.equal(result.status, 502, 'route unavailable for oversized context');
  assert.equal(upstream.state.requests.length, 0);
});

test('preflight rejects malformed payloads before upstream spend', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'validated' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const badTools = await chat(app.baseUrl, raw, { model: 'validated', messages: [], tools: 'nope' });
  assert.equal(badTools.status, 400);
  const badMax = await chat(app.baseUrl, raw, { model: 'validated', messages: [], max_tokens: 0 });
  assert.equal(badMax.status, 400);
  const badToolShape = await chat(app.baseUrl, raw, { model: 'validated', messages: [], tools: [{ type: 'function' }] });
  assert.equal(badToolShape.status, 400);
  assert.equal(upstream.state.requests.length, 0);
});
