// Hot-path routing budget: selection must stay well under one millisecond.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { pickRoute } from '../src/gateway/balance.js';

test('route selection averages under 1ms per call', async (t) => {
  const app = await createTestApp();
  await t.after(() => app.close());

  const model = app.app.registry.createModel({ name: 'hot' });
  for (let i = 0; i < 5; i += 1) {
    const provider = app.addProvider(`p${i}`, `http://127.0.0.1:${9000 + i}/v1`);
    app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: `u${i}` });
  }

  const iterations = 2000;
  const excluded = new Set();
  const now = Date.now();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    const route = pickRoute({ registry: app.app.registry, model, excluded, now });
    assert.ok(route, 'a route is always selected');
  }
  const avgMs = Number(process.hrtime.bigint() - start) / 1e6 / iterations;
  assert.ok(avgMs < 1, `average selection time ${avgMs.toFixed(4)}ms exceeds budget`);
});
