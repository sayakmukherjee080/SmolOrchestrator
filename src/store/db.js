// SQLite connection management and the ordered migration runner.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sha256Hex } from '../util/crypto.js';

// Opens the SQLite database with WAL journaling, foreign keys, and a busy timeout.
export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

// Applies pending .sql migrations in filename order, recording each in schema_migrations.
// Applied files are checksum-verified on every boot so edits to history are detected.
export function runMigrations(db, migrationsDir, logger) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL,
    checksum TEXT
  )`);
  const columns = db.prepare('PRAGMA table_info(schema_migrations)').all().map((row) => row.name);
  if (!columns.includes('checksum')) {
    db.exec('ALTER TABLE schema_migrations ADD COLUMN checksum TEXT');
  }
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
  const verify = db.prepare('SELECT checksum FROM schema_migrations WHERE name = ?');
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  const setChecksum = db.prepare('UPDATE schema_migrations SET checksum = ? WHERE name = ?');
  let count = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    if (applied.has(file)) {
      const row = verify.get(file);
      if (row && row.checksum) {
        const actual = sha256Hex(sql);
        if (row.checksum !== actual) {
          logger?.warn('migration checksum mismatch', { file });
        }
      }
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      record.run(file, Date.now());
      setChecksum.run(sha256Hex(sql), file);
      db.exec('COMMIT');
      count += 1;
      logger?.info('migration applied', { file });
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return count;
}
