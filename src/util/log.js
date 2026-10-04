// Structured JSON logging with size-based rotation and no content capture.
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// Creates a logger writing app.log and error.log under the configured directory.
export function createLogger(config) {
  fs.mkdirSync(config.logPath, { recursive: true });
  const state = { level: LEVELS[config.logLevel] ?? LEVELS.info };
  const sizes = new Map();

  // Appends one JSON line to a file, rotating when the size cap is reached.
  function writeLine(fileName, record) {
    const file = path.join(config.logPath, fileName);
    try {
      let size = sizes.get(file);
      if (size === undefined) {
        size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      }
      if (size + record.length > config.logMaxBytes) {
        rotate(file, config.logKeep);
        size = 0;
      }
      sizes.set(file, size + record.length + 1);
      fs.appendFile(file, `${record}\n`, () => {});
    } catch {
      // Logging must never break request handling.
    }
  }

  // Renames the active log to a timestamped archive and trims old archives.
  function rotate(file, keep) {
    const archive = `${file}.${Date.now()}.bak`;
    fs.renameSync(file, archive);
    const dir = path.dirname(file);
    const base = path.basename(file);
    const archives = fs.readdirSync(dir)
      .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.bak'))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
    while (archives.length > keep) {
      fs.unlinkSync(archives.shift());
    }
  }

  // Writes a structured record when the level is enabled.
  function log(level, message, fields = {}) {
    if ((LEVELS[level] ?? LEVELS.info) < state.level) return;
    const record = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
    writeLine('app.log', record);
    if (level === 'error') writeLine('error.log', record);
    if (process.env.NODE_ENV !== 'test') {
      const stream = level === 'error' ? process.stderr : process.stdout;
      stream.write(`${record}\n`);
    }
  }

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
  };
}
