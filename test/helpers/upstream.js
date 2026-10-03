// Configurable OpenAI-compatible stub upstream used by gateway tests.
import http from 'node:http';
import { once } from 'node:events';

// Starts a stub upstream on an ephemeral port with request recording.
export async function startStubUpstream(handler) {
  const state = { requests: [], aborts: 0 };
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    state.requests.push({ method: req.method, url: req.url, headers: req.headers, body, raw });
    res.on('close', () => {
      if (!res.writableEnded) state.aborts += 1;
    });
    try {
      await handler(req, res, state.requests[state.requests.length - 1], state);
    } catch (error) {
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  server.listen(0, '127.0.0.1');
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await once(server, 'listening');
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    state,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

// Writes a non-streaming JSON completion response with optional usage.
export function jsonCompletion(res, { usage = null, status = 200, content = 'hello' } = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'upstream-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    ...(usage ? { usage } : {}),
  }));
}

// Writes an SSE completion with a final usage chunk, optionally split mid-line.
export function sseCompletion(res, { usage = { prompt_tokens: 10, completion_tokens: 5 }, splitChunks = false } = {}) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream');
  const frames = [
    `data: ${JSON.stringify({ id: 'chunk', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'he' } }] })}\n\n`,
    `data: ${JSON.stringify({ id: 'chunk', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'llo' } }] })}\n\n`,
    `data: ${JSON.stringify({ id: 'chunk', object: 'chat.completion.chunk', choices: [], usage })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  if (!splitChunks) {
    res.write(frames);
    res.end();
    return;
  }
  const buffer = Buffer.from(frames);
  const mid = Math.floor(buffer.length / 2);
  res.write(buffer.subarray(0, mid));
  setTimeout(() => {
    res.write(buffer.subarray(mid));
    res.end();
  }, 10);
}
