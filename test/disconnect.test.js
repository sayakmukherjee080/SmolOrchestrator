// Client disconnect propagates to the upstream request, ending token spend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, waitFor } from './helpers/app.js';
import { startStubUpstream } from './helpers/upstream.js';

test('aborting the client aborts the upstream stream', async (t) => {
  let writes = 0;
  const upstream = await startStubUpstream((req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'start' } }] })}\n\n`);
    writes += 1;
    const interval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(interval);
        return;
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'more' } }] })}\n\n`);
      writes += 1;
    }, 20);
  });
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'streamer' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const controller = new AbortController();
  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'streamer', messages: [], stream: true }),
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => {});

  const aborted = await waitFor(() => upstream.state.aborts >= 1, { timeoutMs: 3000 });
  assert.ok(aborted, 'upstream socket closed after client abort');
  const writesAtAbort = writes;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(writes <= writesAtAbort + 1, 'upstream stopped writing after abort');
});
