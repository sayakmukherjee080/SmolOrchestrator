// Process entry point: composition root, HTTP adapter, security headers, graceful shutdown.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, loadEnvFile } from './util/config.js';
import { createLogger } from './util/log.js';
import { openDatabase, runMigrations } from './store/db.js';
import { Registry } from './store/load.js';
import { createBackupManager } from './store/backup.js';
import { createMaintenanceManager } from './store/maintenance.js';
import { Telemetry } from './gateway/telemetry.js';
import { createGateway } from './gateway/forward.js';
import { createProbeScheduler } from './gateway/probe.js';
import { createMetrics } from './gateway/metrics.js';
import { createSessionManager } from './admin/session.js';
import { createAdminApi } from './admin/api.js';
import { createStaticServer } from './admin/static.js';
import { createRouter } from './router.js';
import { PEER_IP } from './util/headers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Composes database, registry, telemetry, gateway, probes, admin, and router.
export function createApp({ config, db, logger }) {
  const registry = new Registry({ db, config, writer: null, logger });
  const telemetry = new Telemetry({ db, config, registry, logger });
  registry.writer = telemetry;
  registry.load();
  const metrics = createMetrics();
  let probe = null;
  const gateway = createGateway({
    registry, config, telemetry, logger, metrics, onRouteStateChange: () => probe?.schedule(),
  });
  probe = createProbeScheduler({ registry, config, logger, runProbe: gateway.runProbe });
  const session = createSessionManager({ registry, config, logger });
  const backups = createBackupManager({ db, registry, config, logger });
  const maintenance = createMaintenanceManager({ db, registry, config, logger });
  const adminApi = createAdminApi({ registry, session, config, logger, backups, gateway });
  const staticServer = createStaticServer({ webRoot: path.join(ROOT, 'web') });
  const handle = createRouter({ gateway, adminApi, staticServer, db, metrics, registry, config });
  return { handle, registry, telemetry, probe, gateway, session, metrics, backups, maintenance, db };
}

// Applies baseline security headers, adding a CSP for admin UI responses.
export function applySecurityHeaders(response, pathname) {
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    response.headers.set(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'",
    );
  }
  return response;
}

// Converts a Node IncomingMessage into a Web Request with peer IP and abort wiring.
export function toWebRequest(req, res, config) {
  const host = req.headers.host || `${config.host}:${config.port}`;
  const url = new URL(req.url || '/', `http://${host}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const controller = new AbortController();
  const method = (req.method || 'GET').toUpperCase();
  const withBody = method !== 'GET' && method !== 'HEAD';
  const request = new Request(url, {
    method,
    headers,
    body: withBody ? Readable.toWeb(req) : undefined,
    ...(withBody ? { duplex: 'half' } : {}),
    signal: controller.signal,
  });
  request[PEER_IP] = req.socket.remoteAddress;
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(new Error('client_closed'));
  });
  return request;
}

// Streams a Web Response to the Node response, preserving headers and backpressure.
async function writeResponse(res, response) {
  res.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== 'connection') res.setHeader(name, value);
  }
  if (response.headers.get('connection') === 'close') res.shouldKeepAlive = false;
  res.flushHeaders();
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), res);
}

// Builds the HTTP server with request IDs, access logs, and a generic error handler.
export function createHttpServer(app, config, logger) {
  return http.createServer(async (req, res) => {
    const id = randomUUID();
    const started = Date.now();
    try {
      const request = toWebRequest(req, res, config);
      const url = new URL(request.url);
      const response = applySecurityHeaders(await app.handle(request, url), url.pathname);
      response.headers.set('x-request-id', id);
      await writeResponse(res, response);
      logger.info('request', { id, method: req.method, path: url.pathname, status: response.status, ms: Date.now() - started });
    } catch (error) {
      if (res.writableEnded || res.destroyed) return;
      logger.error('request failed', { id, error: error.message });
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Internal server error', code: 'internal_error' }));
      } else {
        res.destroy();
      }
    }
  });
}

// Boots the gateway, wiring teardown to SIGTERM/SIGINT.
async function main() {
  loadEnvFile(path.join(ROOT, '.env'));
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`[smolorchestrator] ${error.message}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(config.storagePath, 'install.lock'))) {
    console.error('[smolorchestrator] Instance is not initialized. Run: npm run setup');
    process.exit(1);
  }
  if (!fs.existsSync(config.dbPath)) {
    console.error(`[smolorchestrator] Database missing at ${config.dbPath}. Re-run: npm run setup`);
    process.exit(1);
  }
  const logger = createLogger(config);
  const db = openDatabase(config.dbPath);
  try {
    const applied = runMigrations(db, path.join(ROOT, 'migrations'), logger);
    if (applied > 0) logger.info('migrations applied', { count: applied });
  } catch (error) {
    logger.error('migration failed', { error: error.message });
    db.close();
    process.exit(1);
  }
  let app;
  try {
    app = createApp({ config, db, logger });
  } catch (error) {
    logger.error('startup failed', { error: error.message });
    db.close();
    process.exit(1);
  }
  app.telemetry.start();
  app.probe.start();
  app.backups.start();
  app.maintenance.start();
  const server = createHttpServer(app, config, logger);
  server.listen(config.port, config.host, () => {
    logger.info('server listening', { host: config.host, port: config.port });
  });

  let shuttingDown = false;
  // Drains in-flight requests, flushes telemetry, and closes SQLite.
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    server.close(() => void finish(0));
    server.closeIdleConnections();
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      void finish(1);
    }, config.shutdownDrainMs);
    deadline.unref();
    // Finalizes subsystem teardown exactly once.
    let finished = false;
    async function finish(code) {
      if (finished) return;
      finished = true;
      app.probe.stop();
      app.backups.stop();
      app.maintenance.stop();
      await app.telemetry.stop();
      try { db.close(); } catch { /* already closed */ }
      logger.info('shutdown complete', { code });
      process.exit(code);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[smolorchestrator] fatal: ${error.message}`);
    process.exit(1);
  });
}
