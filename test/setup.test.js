// Installer validation helpers (setup.js is never executed by the test suite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { validateEmail, validatePassword, createPromptReader } from '../setup.js';

test('email validation', () => {
  assert.equal(validateEmail('admin@example.com'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validateEmail(''), false);
});

test('password policy', () => {
  assert.equal(validatePassword('long-enough-pass'), true);
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('1234567890', 10), true);
  assert.equal(validatePassword('123456789', 10), false);
});

test('hidden prompts mask input and never echo the value', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk.toString()));
  const reader = createPromptReader({ input, output });
  try {
    const pending = reader.ask({ prompt: 'Password: ', hidden: true });
    input.write('secret-value\n');
    assert.equal(await pending, 'secret-value');
  } finally {
    reader.close();
  }
  const text = chunks.join('');
  assert.match(text, /Password: /);
  assert.ok(!text.includes('secret-value'), 'plaintext is never echoed');
});

test('piped stdin delivers multiple lines from one chunk', async () => {
  const input = Readable.from(['admin@example.com\ny\n']);
  const output = new PassThrough();
  const reader = createPromptReader({ input, output });
  try {
    assert.equal(await reader.ask({ prompt: 'Email: ' }), 'admin@example.com');
    assert.equal(await reader.ask({ prompt: 'HTTPS? ' }), 'y');
  } finally {
    reader.close();
  }
});

test('CRLF input and abort are handled', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createPromptReader({ input, output });
  try {
    const first = reader.ask({ prompt: 'one: ' });
    input.write('alpha\r\nbeta\r\n');
    assert.equal(await first, 'alpha');
    assert.equal(await reader.ask({ prompt: 'two: ' }), 'beta');

    const third = reader.ask({ prompt: 'three: ' });
    input.write('\u0003');
    await assert.rejects(third, /Aborted/);
  } finally {
    reader.close();
  }
});

test('reader close detaches and pauses stdin so the process can exit', () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createPromptReader({ input, output });
  reader.close();
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(input.isPaused(), true);
});
