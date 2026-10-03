// Loads and validates runtime configuration from environment variables.
import fs from 'node:fs';
import path from 'node:path';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

// Parses a KEY=VALUE file into process.env without overriding existing variables.
export function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// Reads a numeric variable, enforcing a documented default and optional bounds.
function readNumber(env, key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid numeric configuration ${key}=${raw}`);
  }
  return value;
}

// Reads a boolean variable accepting 1/true/yes/on.
function readBoolean(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return TRUTHY.has(String(raw).toLowerCase());
}

// Builds the immutable configuration object used across the process.
export function loadConfig(env = process.env) {
  const storagePath = path.resolve(env.STORAGE_PATH || 'storage');
  const config = {
    host: env.HOST || '127.0.0.1',
    port: readNumber(env, 'PORT', 8787, { min: 1, max: 65535 }),
    trustProxy: readBoolean(env, 'TRUST_PROXY', false),

    storagePath,
    dbPath: path.resolve(env.DB_PATH || path.join(storagePath, 'gateway.db')),
    logPath: path.resolve(env.LOG_PATH || path.join(storagePath, 'logs')),

    appSecret: env.APP_SECRET || '',
    cookieSecure: readBoolean(env, 'COOKIE_SECURE', true),
    sessionTtlMs: readNumber(env, 'SESSION_TTL_MS', 28800000, { min: 60000 }),
    loginMaxAttempts: readNumber(env, 'LOGIN_MAX_ATTEMPTS', 5, { min: 1 }),
    loginLockoutMs: readNumber(env, 'LOGIN_LOCKOUT_MS', 900000, { min: 1000 }),
    ipRateLimit: readNumber(env, 'IP_RATE_LIMIT', 120, { min: 1 }),
    ipRateWindowMs: readNumber(env, 'IP_RATE_WINDOW_MS', 60000, { min: 1000 }),
    maxBodyBytes: readNumber(env, 'MAX_BODY_BYTES', 33554432, { min: 1024 }),

    idleTimeoutMs: readNumber(env, 'IDLE_TIMEOUT_MS', 90000, { min: 1000 }),
    maxAttempts: readNumber(env, 'MAX_ATTEMPTS', 8, { min: 1, max: 64 }),
    keyDisableMs: readNumber(env, 'KEY_DISABLE_MS', 3600000, { min: 1000 }),
    backoffBaseMs: readNumber(env, 'BACKOFF_BASE_MS', 60000, { min: 1000 }),
    backoffCapMs: readNumber(env, 'BACKOFF_CAP_MS', 900000, { min: 1000 }),
    probeEnabled: readBoolean(env, 'PROBE_ENABLED', true),
    probeBudgetPerHour: readNumber(env, 'PROBE_BUDGET_PER_HOUR', 12, { min: 0 }),
    probePrompt: env.PROBE_PROMPT || 'ping',
    probeMaxTokens: readNumber(env, 'PROBE_MAX_TOKENS', 5, { min: 1 }),
    healthCheckEnabled: readBoolean(env, 'HEALTH_CHECK_ENABLED', true),
    healthCheckIntervalMs: readNumber(env, 'HEALTH_CHECK_INTERVAL_MS', 900000, { min: 1000 }),
    metricsToken: env.METRICS_TOKEN || '',
    responseCacheEnabled: readBoolean(env, 'RESPONSE_CACHE_ENABLED', true),
    responseCacheTtlMs: readNumber(env, 'RESPONSE_CACHE_TTL_MS', 300000, { min: 1000 }),
    responseCacheMaxEntries: readNumber(env, 'RESPONSE_CACHE_MAX_ENTRIES', 500, { min: 1 }),
    responseCacheMaxBodyBytes: readNumber(env, 'RESPONSE_CACHE_MAX_BODY_BYTES', 1048576, { min: 1024 }),
    cachedInputDiscount: readNumber(env, 'CACHED_INPUT_DISCOUNT', 0.1, { min: 0, max: 1 }),
    budgetWarnRatio: readNumber(env, 'BUDGET_WARN_RATIO', 0.8, { min: 0.1, max: 0.99 }),
    backupEnabled: readBoolean(env, 'BACKUP_ENABLED', true),
    backupIntervalMs: readNumber(env, 'BACKUP_INTERVAL_MS', 86400000, { min: 3600000 }),
    backupKeep: readNumber(env, 'BACKUP_KEEP', 7, { min: 1 }),
    backupPath: path.resolve(env.BACKUP_PATH || path.join(storagePath, 'backups')),

    telemetryFlushMs: readNumber(env, 'TELEMETRY_FLUSH_MS', 500, { min: 50 }),
    telemetryBufferMax: readNumber(env, 'TELEMETRY_BUFFER_MAX', 10000, { min: 100 }),
    usageParseMaxBytes: readNumber(env, 'USAGE_PARSE_MAX_BYTES', 4194304, { min: 1024 }),
    logMaxBytes: readNumber(env, 'LOG_MAX_BYTES', 10485760, { min: 1024 }),
    logKeep: readNumber(env, 'LOG_KEEP', 5, { min: 1 }),
    logLevel: env.LOG_LEVEL || 'info',
    shutdownDrainMs: readNumber(env, 'SHUTDOWN_DRAIN_MS', 30000, { min: 1000 }),
  };
  if (!config.appSecret) {
    throw new Error('APP_SECRET missing. Run `npm run setup` to initialize the instance.');
  }
  return Object.freeze(config);
}
