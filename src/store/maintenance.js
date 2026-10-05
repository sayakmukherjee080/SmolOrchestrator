// Scheduled retention maintenance for telemetry and usage tables.
import { dayWindow, monthWindow } from './windows.js';

const DAY_MS = 86400000;

export function createMaintenanceManager({ db, registry, config, logger }) {
  let timer = null;

  // Runs one prune pass and returns the deleted row counts.
  function run() {
    const now = Date.now();
    const telemetryDays = registry.setting('telemetry_retention_days', config.telemetryRetentionDays);
    const usageDays = registry.setting('usage_retention_days', config.usageRetentionDays);
    let deletedTelemetry = 0;
    let deletedUsage = 0;
    if (telemetryDays > 0) {
      deletedTelemetry = Number(db.prepare('DELETE FROM telemetry WHERE ts < ?')
        .run(now - telemetryDays * DAY_MS).changes);
    }
    if (usageDays > 0) {
      // Never prune the current month: token monthly budgets rebuild from these rows.
      const cutoff = Math.min(dayWindow(now - usageDays * DAY_MS), monthWindow(now));
      deletedUsage = Number(db.prepare('DELETE FROM usage WHERE window_start < ?')
        .run(cutoff).changes);
    }
    if (deletedTelemetry || deletedUsage) {
      logger?.info('retention prune', { deletedTelemetry, deletedUsage });
    }
    return { deletedTelemetry, deletedUsage };
  }

  // Starts the maintenance timer, honouring the stored interval override.
  function start() {
    if (!config.maintenanceEnabled || timer) return;
    const interval = registry.setting('maintenance_interval_ms', config.maintenanceIntervalMs);
    timer = setInterval(() => {
      try {
        run();
      } catch (error) {
        logger?.error('maintenance run failed', { error: error.message });
      }
    }, interval);
    timer.unref?.();
  }

  // Stops the maintenance timer.
  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return { run, start, stop };
}
