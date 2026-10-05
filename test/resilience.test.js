// Crash handlers: verified in a subprocess because node:test intercepts real crash events.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SERVER_URL = pathToFileURL(path.resolve('src/server.js')).href;

test('crash handlers log stray failures and invoke the fatal callback', () => {
  const script = `
    import { installCrashHandlers } from ${JSON.stringify(SERVER_URL)};
    const logger = { error: (message, fields) => console.log('LOGGED', message, fields.error) };
    installCrashHandlers(logger, () => process.exit(7));
    process.emit('unhandledRejection', new Error('boom-rejection'));
    process.emit('uncaughtException', new Error('boom-exception'));
    setTimeout(() => process.exit(9), 500);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 7, `fatal callback exits (got ${result.status})`);
  assert.match(result.stdout, /LOGGED unhandled rejection boom-rejection/);
  assert.match(result.stdout, /LOGGED uncaught exception boom-exception/);
});
