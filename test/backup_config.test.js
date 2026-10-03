// Backups and configuration export/import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestApp, adminLogin } from './helpers/app.js';

// Performs an admin JSON request with session credentials.
function request(baseUrl, path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  return fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('backups can be created and listed', async (t) => {
  const app = await createTestApp();
  const session = await adminLogin(app.baseUrl);
  await t.after(() => app.close());

  const created = await request(app.baseUrl, '/backups', {
    method: 'POST', cookie: session.cookie, csrf: session.csrf,
  });
  assert.equal(created.status, 201);
  const backup = (await created.json()).data.backup;
  assert.ok(fs.existsSync(path.join(app.config.backupPath, backup.name)), 'snapshot file exists');

  const listed = await request(app.baseUrl, '/backups', { cookie: session.cookie });
  const backups = (await listed.json()).data.backups;
  assert.ok(backups.length >= 1);
});

test('config bundles export and merge-import into a fresh instance', async (t) => {
  const source = await createTestApp();
  const sourceSession = await adminLogin(source.baseUrl);
  const provider = source.addProvider('openrouter', 'https://openrouter.ai/api/v1');
  const model = source.app.registry.createModel({ name: 'ds-flash', balanceStrategy: 'cache_aware' });
  source.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'deepseek/v4-flash',
    inputCostPerM: 0.2, outputCostPerM: 0.8, capabilities: ['tools'], maxContext: 64000,
  });
  source.addToken('opencode', [model.id]);

  const exported = await request(source.baseUrl, '/config/export', { cookie: sourceSession.cookie });
  const bundle = (await exported.json()).data.bundle;
  assert.equal(bundle.models.length, 1);
  assert.equal(bundle.models[0].routes[0].capabilities[0], 'tools');
  assert.equal(bundle.tokens.length, 1);

  const target = await createTestApp();
  const targetSession = await adminLogin(target.baseUrl);
  await t.after(async () => {
    await source.close();
    await target.close();
  });

  const imported = await request(target.baseUrl, '/config/import', {
    method: 'POST', cookie: targetSession.cookie, csrf: targetSession.csrf, body: { bundle },
  });
  assert.equal(imported.status, 200);
  const report = (await imported.json()).data;
  assert.deepEqual(report.created, { providers: 1, keys: 0, models: 1, routes: 1, tokens: 1 });

  const models = await request(target.baseUrl, '/models', { cookie: targetSession.cookie });
  const importedModel = (await models.json()).data.models[0];
  assert.equal(importedModel.name, 'ds-flash');
  assert.equal(importedModel.routes[0].maxContext, 64000);

  const again = await request(target.baseUrl, '/config/import', {
    method: 'POST', cookie: targetSession.cookie, csrf: targetSession.csrf, body: { bundle },
  });
  const second = (await again.json()).data;
  assert.equal(second.created.models, 0, 'duplicate import is a no-op');
  assert.equal(second.skipped.models, 1);
});
