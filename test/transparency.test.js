// Byte transparency: status, headers, and body pass through; no content is persisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream } from './helpers/upstream.js';

const CANNED = JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'EXACT-BYTES' } }] });

test('response bytes and status pass through unchanged', async (t) => {
  const upstream = await startStubUpstream((req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-custom-header', 'kept');
    res.end(CANNED);
  });
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'pass' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'pass', messages: [{ role: 'user', content: 'PROMPT-SECRET' }] }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-custom-header'), 'kept');
  assert.equal(await response.text(), CANNED, 'body is byte-identical');

  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes('PROMPT-SECRET'), 'prompt text never persisted');
  assert.ok(!serialized.includes('EXACT-BYTES'), 'completion text never persisted');
});

test('non-stream request body is unchanged except the model rewrite', async (t) => {
  const upstream = await startStubUpstream((req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(CANNED);
  });
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'pass' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'upstream-id' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'pass', messages: [], temperature: 0.5, stream_options: { foo: 1 } }),
  });
  const sent = upstream.state.requests[0].body;
  assert.equal(sent.model, 'upstream-id');
  assert.equal(sent.temperature, 0.5, 'unrelated fields preserved');
  assert.deepEqual(sent.stream_options, { foo: 1 }, 'stream_options untouched for non-stream requests');
});
