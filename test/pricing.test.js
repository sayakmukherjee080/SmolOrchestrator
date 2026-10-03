// Auto pricing: reference map lookup, manual override precedence, and telemetry cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupPricing, resolveRouteCost } from '../src/gateway/pricing.js';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('reference map lookup handles prefixes and tags', () => {
  assert.deepEqual(lookupPricing('gpt-4o-mini'), { input: 0.15, output: 0.6 });
  assert.deepEqual(lookupPricing('openrouter/deepseek/deepseek-chat-v3:free'), { input: 0.27, output: 1.1 });
  assert.deepEqual(lookupPricing('gemini-2.5-flash'), { input: 0.3, output: 2.5 });
  assert.equal(lookupPricing('totally-unknown-model'), null);
});

test('manual route costs override the map per direction', () => {
  const mixed = resolveRouteCost({ inputCostPerM: 5, outputCostPerM: null, upstreamModel: 'gpt-4o-mini' });
  assert.equal(mixed.input, 5);
  assert.equal(mixed.output, 0.6);
  assert.equal(mixed.source, 'mixed');

  const manual = resolveRouteCost({ inputCostPerM: 0, outputCostPerM: 0, upstreamModel: 'gpt-4o-mini' });
  assert.equal(manual.input, 0);
  assert.equal(manual.source, 'manual');

  const unknown = resolveRouteCost({ inputCostPerM: null, outputCostPerM: null, upstreamModel: 'nope' });
  assert.equal(unknown.input, 0);
  assert.equal(unknown.source, 'unknown');
});

test('auto pricing feeds estimated telemetry cost', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 100, completion_tokens: 50 } }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'auto-priced' });
  app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'gpt-4o-mini',
    inputCostPerM: null, outputCostPerM: null,
  });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'auto-priced', messages: [] }),
  });
  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  assert.ok(Math.abs(row.est_cost - (100 * 0.15 + 50 * 0.6) / 1000000) < 1e-12, 'auto cost applied');
});

test('admin model listing annotates resolved costs', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'annotated' });
  app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'claude-3-5-sonnet',
    inputCostPerM: null, outputCostPerM: null,
  });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const models = app.app.registry.listModels();
  const route = models[0].routes[0];
  const resolved = resolveRouteCost(route);
  assert.equal(resolved.input, 3);
  assert.equal(resolved.output, 15);
  assert.equal(resolved.source, 'auto');
});
