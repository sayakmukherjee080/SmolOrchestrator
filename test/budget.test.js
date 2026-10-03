// Per-token budgets: daily/monthly request and spend limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one chat completion and returns the status plus parsed error code.
async function chat(baseUrl, raw, model = 'metered') {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

test('daily request budget blocks after the limit', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'metered' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { token, raw } = app.app.registry.createToken({ label: 'limited', dailyRequestLimit: 1 });
  app.app.registry.setTokenModels(token.id, [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await chat(app.baseUrl, raw)).status, 200);
  const blocked = await chat(app.baseUrl, raw);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'budget_exceeded');
  assert.match(blocked.body.error.message, /daily_requests/);
});

test('daily spend budget blocks after estimated cost crosses the limit', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'metered' });
  app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'u',
    inputCostPerM: 1, outputCostPerM: 1,
  });
  const { token, raw } = app.app.registry.createToken({ label: 'spender', dailySpendLimit: 0.00001 });
  app.app.registry.setTokenModels(token.id, [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await chat(app.baseUrl, raw)).status, 200);
  const blocked = await chat(app.baseUrl, raw);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'budget_exceeded');
  assert.match(blocked.body.error.message, /daily_spend/);
});

test('monthly request budget applies without a daily limit', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'metered' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { token, raw } = app.app.registry.createToken({ label: 'monthly', monthlyRequestLimit: 1 });
  app.app.registry.setTokenModels(token.id, [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await chat(app.baseUrl, raw)).status, 200);
  const blocked = await chat(app.baseUrl, raw);
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error.message, /monthly_requests/);
});

test('unlimited tokens pass through', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'metered' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('open', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await chat(app.baseUrl, raw)).status, 200);
  assert.equal((await chat(app.baseUrl, raw)).status, 200);
  assert.equal((await chat(app.baseUrl, raw)).status, 200);
});
