// Proactive background health checks: failing routes cool down before user traffic arrives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, waitFor } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('health check cools a failing route without user traffic', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, { status: 500 }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'watched' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('health_check_interval_ms', 50);
  app.app.probe.start();
  const cooled = await waitFor(() => route.consecutiveFailures > 0, { timeoutMs: 3000 });
  assert.ok(cooled, 'route was cooled down by the background check');
  assert.ok(upstream.state.requests.length >= 1, 'a real probe request was sent');
  assert.ok(route.cooldownUntil > Date.now(), 'cooldown window set');
});

test('health checks can be disabled at runtime', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'unwatched' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  app.app.registry.setSetting('health_check_enabled', false);
  app.app.registry.setSetting('health_check_interval_ms', 50);
  app.app.probe.start();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(upstream.state.requests.length, 0, 'no background probes when disabled');
});
