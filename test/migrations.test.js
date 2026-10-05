// Migration runner: schema creation and idempotency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, runMigrations } from '../src/store/db.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

test('checksum mismatches are detected without re-applying', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'so-migrations-checksum-'));
  const migrations = path.join(dir, 'migrations');
  fs.mkdirSync(migrations);
  const file = path.join(migrations, '001_test.sql');
  fs.writeFileSync(file, 'CREATE TABLE widget (id INTEGER PRIMARY KEY);\n');
  const db = openDatabase(path.join(dir, 'test.db'));
  const warnings = [];
  const logger = { info: () => {}, warn: (message, fields) => warnings.push({ message, fields }) };
  try {
    assert.equal(runMigrations(db, migrations, logger), 1, 'first run applies');
    fs.writeFileSync(file, 'CREATE TABLE widget (id INTEGER PRIMARY KEY);\n-- edited after the fact\n');
    assert.equal(runMigrations(db, migrations, logger), 0, 'second run applies nothing');
    assert.ok(warnings.some((entry) => entry.message === 'migration checksum mismatch'), 'tampered history is flagged');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
