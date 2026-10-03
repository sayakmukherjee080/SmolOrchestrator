// Cooldown backoff math and active probe recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFailure } from '../src/gateway/cooldown.js';
import { createTestApp, waitFor } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('backoff doubles and respects the cap', () => {
  const route = { consecutiveFailures: 0, cooldownUntil: 0 };
  const options = { now: 1000000, baseMs: 60000, capMs: 900000 };
  assert.equal(applyFailure(route, options), 60000);
  assert.equal(applyFailure(route, options), 120000);
  assert.equal(applyFailure(route, options), 240000);
  assert.equal(applyFailure(route, options), 480000);
  assert.equal(applyFailure(route, options), 900000, 'cap enforced');
  assert.equal(route.cooldownUntil, 1000000 + 900000);
});

test('probe recovers a cooling route with a real upstream request', async (t) => {
  let failing = true;
  const upstream = await startStubUpstream((req, res) => {
    if (failing) jsonCompletion(res, { status: 500 });
    else jsonCompletion(res, { usage: { prompt_tokens: 2, completion_tokens: 1 } });
  });
  const app = await createTestApp();
  const provider = app.addProvider('flaky', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'probe-me' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const failed = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'probe-me', messages: [] }),
  });
  assert.equal(failed.status, 502);
  await waitFor(() => route.consecutiveFailures === 1);
  assert.ok(route.cooldownUntil > Date.now());

  failing = false;
  route.cooldownUntil = Date.now() - 1;
  app.app.probe.start();
  const recovered = await waitFor(() => route.consecutiveFailures === 0);
  assert.ok(recovered, 'probe reset the route');
  const probeRequest = upstream.state.requests.at(-1);
  assert.equal(probeRequest.body.max_tokens, 5, 'probe used the minimal completion');
  assert.equal(probeRequest.body.stream, false);
});
