// SQLite snapshot backups via VACUUM INTO with retention pruning.
import fs from 'node:fs';
import path from 'node:path';

export function createBackupManager({ db, config, logger }) {
  let timer = null;

  // Ensures the backup directory exists.
  function ensureDir() {
    fs.mkdirSync(config.backupPath, { recursive: true });
  }

  // Builds a UTC timestamped snapshot filename.
  function fileName(now = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `gateway-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
      + `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}.db`;
  }

  // Lists backups newest first with size and creation time.
  function list() {
    ensureDir();
    return fs.readdirSync(config.backupPath)
      .filter((name) => name.endsWith('.db'))
      .map((name) => {
        const stat = fs.statSync(path.join(config.backupPath, name));
        return { name, sizeBytes: stat.size, createdAt: Math.round(stat.mtimeMs) };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Deletes backups beyond the retention count.
  function prune() {
    const files = list();
    for (const stale of files.slice(config.backupKeep)) {
      fs.unlinkSync(path.join(config.backupPath, stale.name));
    }
  }

  // Creates a snapshot immediately and prunes old ones.
  function createNow() {
    ensureDir();
    let target = path.join(config.backupPath, fileName());
    let counter = 1;
    while (fs.existsSync(target)) {
      target = path.join(config.backupPath, fileName().replace(/\.db$/, `-${counter}.db`));
      counter += 1;
    }
    const escaped = target.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    prune();
    logger?.info('backup created', { file: path.basename(target) });
    return list()[0];
  }

  // Starts the periodic backup timer.
  function start() {
    if (!config.backupEnabled || timer) return;
    timer = setInterval(() => {
      try {
        createNow();
      } catch (error) {
        logger?.error('scheduled backup failed', { error: error.message });
      }
    }, config.backupIntervalMs);
    timer.unref?.();
  }

  // Stops the backup timer.
  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return { createNow, list, start, stop };
}
