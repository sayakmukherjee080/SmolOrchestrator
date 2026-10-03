// Migration runner: schema creation and idempotency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations } from '../src/store/db.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

test('migrations apply once and create the full schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'so-migrations-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  try {
    const first = runMigrations(db, MIGRATIONS_DIR, null);
    assert.ok(first >= 1, 'at least one migration applied');
    const second = runMigrations(db, MIGRATIONS_DIR, null);
    assert.equal(second, 0, 'second run applies nothing');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    for (const table of ['models', 'providers', 'provider_keys', 'routes', 'tokens', 'token_models',
      'telemetry', 'usage', 'settings', 'admin', 'audit', 'schema_migrations']) {
      assert.ok(tables.includes(table), `table ${table} exists`);
    }
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
