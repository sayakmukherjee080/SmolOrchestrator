// Isolated test application: temp SQLite, seeded admin, and an ephemeral HTTP server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/util/config.js';
import { openDatabase, runMigrations } from '../../src/store/db.js';
import { createLogger } from '../../src/util/log.js';
import { createApp, createHttpServer } from '../../src/server.js';
import { hashPassword, sha256Hex } from '../../src/util/crypto.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
export const TEST_EMAIL = 'admin@test.local';
export const TEST_PASSWORD = 'test-password-123';

// Creates a fully composed app on a temp database with a live HTTP server.
export async function createTestApp({ env = {} } = {}) {
  process.env.NODE_ENV = 'test';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smolorchestrator-test-'));
  const config = loadConfig({
    APP_SECRET: 'test-secret-'.padEnd(64, 'x'),
    STORAGE_PATH: path.join(dir, 'storage'),
    LOG_PATH: path.join(dir, 'logs'),
    DB_PATH: path.join(dir, 'storage', 'test.db'),
    COOKIE_SECURE: 'false',
    IP_RATE_LIMIT: '100000',
    LOG_LEVEL: 'error',
    TELEMETRY_FLUSH_MS: '50',
    ...env,
  });
  const logger = createLogger(config);
  const db = openDatabase(config.dbPath);
  runMigrations(db, MIGRATIONS_DIR, logger);
  const app = createApp({ config, db, logger });
  db.prepare('INSERT INTO admin (email, password_hash, created_at) VALUES (?, ?, ?)')
    .run(TEST_EMAIL, hashPassword(TEST_PASSWORD), Date.now());
  const server = createHttpServer(app, config, logger);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    app,
    db,
    config,
    baseUrl,
    logger,
    // Seeds a provider with one key and returns both.
    addProvider(name, baseUrlValue, apiKey = 'upstream-key') {
      const provider = app.registry.createProvider({ name, baseUrl: baseUrlValue });
      app.registry.addProviderKey(provider.id, { label: 'default', key: apiKey });
      return provider;
    },
    // Seeds a scoped gateway token and returns the raw key.
    addToken(label, modelIds) {
      const { token, raw } = app.registry.createToken({ label });
      app.registry.setTokenModels(token.id, modelIds);
      return { token, raw };
    },
    // Flushes telemetry buffers so tests can assert persisted state.
    async flush() {
      await app.telemetry.flush();
    },
    async close() {
      app.probe.stop();
      await app.telemetry.stop();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Logs in through the admin API and returns the session cookie and CSRF token.
export async function adminLogin(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`login failed: ${payload.error}`);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, csrf: payload.data.csrf };
}

// Polls a predicate until it returns true or the timeout elapses.
export async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Returns the SHA-256 hash of a gateway key for direct registry lookups.
export function hashKey(raw) {
  return sha256Hex(raw);
}
