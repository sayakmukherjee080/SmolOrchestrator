// Usage extraction: streaming SSE, non-stream JSON, estimation fallback, and cost math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion, sseCompletion } from './helpers/upstream.js';

// Seeds one provider/model/route with explicit prices and returns the raw token.
function seed(app, upstreamBase, { inputCostPerM = 1, outputCostPerM = 2 } = {}) {
  const provider = app.addProvider('stub', upstreamBase);
  const model = app.app.registry.createModel({ name: 'metered' });
  const route = app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'u', inputCostPerM, outputCostPerM,
  });
  const { raw } = app.addToken('client', [model.id]);
  return { model, route, raw };
}

test('streaming usage is captured and stream_options injected', async (t) => {
  const upstream = await startStubUpstream((req, res) => sseCompletion(res, { splitChunks: true }));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'metered', messages: [], stream: true }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const text = await response.text();
  assert.match(text, /data: \[DONE\]/, 'transparent stream passthrough');
  assert.equal(upstream.state.requests[0].body.stream_options.include_usage, true, 'usage injection');

  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.input_tokens, 10);
  assert.equal(row.output_tokens, 5);
  assert.equal(row.estimated, 0);
  assert.ok(Math.abs(row.est_cost - (10 * 1 + 5 * 2) / 1000000) < 1e-12, 'cost from separate prices');
  const usage = app.db.prepare("SELECT * FROM usage WHERE entity = 'model'").get();
  assert.equal(usage.requests, 1);
  assert.equal(usage.tokens_in, 10);
});

test('non-streaming usage is captured', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 7, completion_tokens: 3 } }));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'metered', messages: [] }),
  });
  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.input_tokens, 7);
  assert.equal(row.output_tokens, 3);
  assert.equal(row.estimated, 0);
});

test('missing usage falls back to byte estimates', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, { usage: null }));
  const app = await createTestApp();
  const { raw } = seed(app, upstream.baseUrl);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'metered', messages: [{ role: 'user', content: 'estimate me' }] }),
  });
  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.estimated, 1);
  assert.ok(row.input_tokens > 0 && row.output_tokens > 0, 'estimates populated');
});
