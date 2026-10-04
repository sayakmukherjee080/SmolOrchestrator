// Retention maintenance and flush-failure resilience.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('retention prunes telemetry and usage but never audit rows', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'pruned' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const old = Date.now() - 10 * 86400000;
  app.db.prepare(`INSERT INTO telemetry (ts, status, latency_ms) VALUES (?, 200, 1)`).run(old);
  app.db.prepare(`INSERT INTO usage (entity, entity_id, window_start, requests) VALUES ('model', ?, ?, 1)`)
    .run(model.id, old);
  app.db.prepare(`INSERT INTO audit (ts, action, outcome) VALUES (?, 'login', 'success')`).run(old);
  app.app.registry.setSetting('telemetry_retention_days', 1);
  app.app.registry.setSetting('usage_retention_days', 1);

  const result = app.app.maintenance.run();
  assert.equal(result.deletedTelemetry, 1);
  assert.equal(result.deletedUsage, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM telemetry').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM usage').get().c, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM audit').get().c, 1, 'audit rows are append-only');
  assert.ok(route.id > 0);
});

test('failed telemetry flush restores dirty route state', async (t) => {
  const app = await createTestApp();
  const provider = app.addProvider('stub', 'http://127.0.0.1:1/v1');
  const model = app.app.registry.createModel({ name: 'dirty' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  await t.after(() => app.close());

  route.consecutiveFailures = 3;
  app.app.registry.markRouteDirty(route);
  app.app.telemetry.queue({ type: 'event', ts: Date.now(), status: 200, latencyMs: 1 });
  const original = app.app.telemetry.insertEvent;
  app.app.telemetry.insertEvent = { run() { throw new Error('forced flush failure'); } };
  await app.app.telemetry.flush();
  assert.ok(app.app.registry.dirtyRoutes.has(route.id), 'dirty state retained after failure');

  app.app.telemetry.insertEvent = original;
  await app.app.telemetry.flush();
  const row = app.db.prepare('SELECT consecutive_failures FROM routes WHERE id = ?').get(route.id);
  assert.equal(row.consecutive_failures, 3, 'state persisted on the next flush');
});
