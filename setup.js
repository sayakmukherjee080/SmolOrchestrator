#!/usr/bin/env node
// First-run installer: npm install, admin account creation, schema, .env, and install lock.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomTokenHex, hashPassword } from './src/util/crypto.js';
import { openDatabase, runMigrations } from './src/store/db.js';
import { loadEnvFile } from './src/util/config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIN_NODE = { major: 22, minor: 13 };

// Validates an admin email address.
export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

// Validates an admin password against the minimum length policy.
export function validatePassword(value, minLength = 10) {
  return typeof value === 'string' && value.length >= minLength;
}

// Returns true when the running Node version can provide node:sqlite.
function nodeSupported(version) {
  const [major, minor] = String(version).split('.').map(Number);
  return major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor);
}

// Creates a line-oriented prompt reader that works on TTYs and piped stdin.
export function createPromptReader({ input = process.stdin, output = process.stdout } = {}) {
  const isTTY = Boolean(input.isTTY);
  if (isTTY && typeof input.setRawMode === 'function') input.setRawMode(true);
  input.resume?.();
  const queued = [];
  const waiters = [];
  let lineBuffer = '';
  let lastWasCR = false;
  let aborted = false;

  // Delivers a completed line to the active waiter or queues it.
  function deliver(line) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else queued.push(line);
  }

  // Handles raw keystrokes, echoing visible characters on interactive terminals.
  function onData(chunk) {
    for (const char of chunk.toString('utf8')) {
      if (char === '\u0003') {
        aborted = true;
        const waiter = waiters.shift();
        if (waiter) waiter.reject(new Error('Aborted'));
        return;
      }
      if (char === '\n' && lastWasCR) {
        lastWasCR = false;
        continue;
      }
      lastWasCR = char === '\r';
      if (char === '\r' || char === '\n') {
        const line = lineBuffer;
        lineBuffer = '';
        const active = waiters[0];
        if (active) output.write('\n');
        deliver(line);
        continue;
      }
      if (char === '\u007f' || char === '\b') {
        if (lineBuffer.length > 0) {
          lineBuffer = lineBuffer.slice(0, -1);
          if (isTTY && waiters[0] && !waiters[0].hidden) output.write('\b \b');
        }
        continue;
      }
      lineBuffer += char;
      if (isTTY && waiters[0]) output.write(waiters[0].hidden ? '*' : char);
    }
  }
  input.on('data', onData);

  // Asks one question and resolves with the next line.
  function ask({ prompt, hidden = false }) {
    output.write(prompt);
    if (queued.length > 0) {
      output.write('\n');
      return Promise.resolve(queued.shift());
    }
    if (aborted) return Promise.reject(new Error('Aborted'));
    return new Promise((resolve, reject) => waiters.push({ resolve, reject, hidden }));
  }

  // Restores terminal state and releases stdin so the process can exit.
  function close() {
    input.removeListener('data', onData);
    if (isTTY && typeof input.setRawMode === 'function') input.setRawMode(false);
    input.pause?.();
    input.unref?.();
  }

  return { ask, close };
}

// Runs the interactive setup flow: npm install, prompts, schema, admin, lock.
export async function main() {
  loadEnvFile(path.join(ROOT, '.env'));
  const storagePath = path.resolve(process.env.STORAGE_PATH || path.join(ROOT, 'storage'));
  const dbPath = path.resolve(process.env.DB_PATH || path.join(storagePath, 'gateway.db'));
  const lockPath = path.join(storagePath, 'install.lock');

  console.log('SmolOrchestrator setup');
  console.log('=======================');
  if (fs.existsSync(lockPath)) {
    console.log(`Already installed (${lockPath} exists).`);
    console.log('To reinstall, remove the lock file and database manually.');
    return;
  }
  if (!nodeSupported(process.versions.node)) {
    throw new Error(`Node.js >= ${MIN_NODE.major}.${MIN_NODE.minor} is required (found ${process.versions.node})`);
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  console.log('\nRunning npm install...');
  const install = spawnSync(npmCommand, ['install', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: ROOT,
  });
  if (install.status !== 0) throw new Error('npm install failed');

  const prompts = createPromptReader();
  let email = '';
  let password = '';
  let httpsAnswer = '';
  try {
    for (;;) {
      email = (await prompts.ask({ prompt: '\nAdmin email: ' })).trim();
      if (validateEmail(email)) break;
      console.log('Enter a valid email address.');
    }
    const minLength = Number(process.env.MIN_PASSWORD_LENGTH || 10);
    for (;;) {
      password = await prompts.ask({ prompt: 'Admin password (input hidden): ', hidden: true });
      if (!validatePassword(password, minLength)) {
        console.log(`Password must be at least ${minLength} characters.`);
        continue;
      }
      const confirmation = await prompts.ask({ prompt: 'Confirm password: ', hidden: true });
      if (confirmation === password) break;
      console.log('Passwords do not match.');
    }
    httpsAnswer = (await prompts.ask({ prompt: 'Serve this instance over HTTPS? [Y/n]: ' })).trim().toLowerCase();
  } finally {
    prompts.close();
  }
  const secureCookie = httpsAnswer === '' || httpsAnswer.startsWith('y');

  fs.mkdirSync(storagePath, { recursive: true });
  const envPath = path.join(ROOT, '.env');
  const envBody = [
    `# Generated by setup.js on ${new Date().toISOString()}.`,
    '# See .env.example for all supported variables.',
    'HOST=127.0.0.1',
    'PORT=8787',
    `STORAGE_PATH=${storagePath.replace(/\\/g, '/')}`,
    `APP_SECRET=${randomTokenHex(32)}`,
    `COOKIE_SECURE=${secureCookie ? 'true' : 'false'}`,
    '',
  ].join('\n');
  fs.writeFileSync(envPath, envBody, { mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Windows may not support POSIX modes; the file remains user-scoped.
  }
  console.log(`Environment written to ${envPath}`);

  console.log('Creating database and applying migrations...');
  const db = openDatabase(dbPath);
  try {
    const applied = runMigrations(db, path.join(ROOT, 'migrations'), null);
    db.prepare('INSERT INTO admin (email, password_hash, created_at) VALUES (?, ?, ?)')
      .run(email, hashPassword(password), Date.now());
    fs.writeFileSync(lockPath, new Date().toISOString(), { mode: 0o600 });
    console.log(`\nSetup complete. ${applied} migration(s) applied.`);
    console.log(`Admin account: ${email}`);
    console.log('Start the gateway with: npm start');
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error.message === 'Aborted') {
      console.error('\nSetup cancelled. Nothing was written.');
      process.exit(130);
    }
    console.error(`\nSetup failed: ${error.message}`);
    process.exit(1);
  });
}
