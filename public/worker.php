<?php
declare(strict_types=1);

// Worker script to process async logs and usage stats
// Run via cron every minute: * * * * * php /path/to/worker.php

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/classes/Cache.php';

// Initialize
$pdo = new PDO('sqlite:' . __DIR__ . '/../storage/app.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$settingsPath = __DIR__ . '/../storage/settings.json';
$settings = file_exists($settingsPath) 
    ? json_decode(file_get_contents($settingsPath) ?: '{}', true) ?? []
    : [];
$cache = new Cache($settings['cache_enabled'] ?? false, $settings['cache_driver'] ?? 'file');

echo "[Worker] Starting at " . date('Y-m-d H:i:s') . "\n";

// 1. Process Request Logs
$logFile = __DIR__ . '/../storage/logs/requests.log';
if (file_exists($logFile)) {
    // Rename to process safely
    $processingFile = $logFile . '.processing';
    if (rename($logFile, $processingFile)) {
        $lines = file($processingFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            echo "[Worker] Processing " . count($lines) . " log entries...\n";
            $stmt = $pdo->prepare("INSERT INTO request_logs (ts,endpoint,provider,status,latency_ms,response_snippet) VALUES(?,?,?,?,?,?)");
            
            $pdo->beginTransaction();
            foreach ($lines as $line) {
                $data = json_decode($line, true);
                if (!$data) continue;
                $stmt->execute([
                    $data['ts'],
                    $data['endpoint'],
                    $data['provider'],
                    $data['status'],
                    $data['latency_ms'],
                    base64_decode($data['response_snippet'])
                ]);
            }
            $pdo->commit();
            echo "[Worker] Logs imported.\n";
        }
        unlink($processingFile);
    }
}

// 1.5 Process DB Update Queue (Async Writes)
$queueFile = __DIR__ . '/../storage/logs/db_queue.log';
if (file_exists($queueFile)) {
    $procQueue = $queueFile . '.processing';
    if (rename($queueFile, $procQueue)) {
        $lines = file($procQueue, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            echo "[Worker] Processing " . count($lines) . " DB updates...\n";
            $pdo->beginTransaction();
            foreach ($lines as $line) {
                $item = json_decode($line, true);
                if (!$item || !isset($item['table'], $item['id'], $item['updates'])) continue;

                $table = $item['table'];
                $id = (int)$item['id'];
                $updates = $item['updates'];
                
                // Allowlist tables
                if (!in_array($table, ['api_keys', 'endpoints', 'endpoint_providers'])) continue;

                if (isset($updates['__increment'])) {
                    $col = $updates['__increment'];
                    // Sanitary check
                    if (preg_match('/^[a-zA-Z0-9_]+$/', $col)) {
                        $pdo->prepare("UPDATE $table SET $col = $col + 1 WHERE id = ?")->execute([$id]);
                    }
                } else {
                    $sets = [];
                    $vals = [];
                    foreach ($updates as $k => $v) {
                        if (!preg_match('/^[a-zA-Z0-9_]+$/', $k)) continue;
                        $sets[] = "$k = ?";
                        $vals[] = $v;
                    }
                    if ($sets) {
                        $sql = "UPDATE $table SET " . implode(', ', $sets) . " WHERE id = ?";
                        $vals[] = $id;
                        $pdo->prepare($sql)->execute($vals);
                    }
                }
            }
            $pdo->commit();
        }
        unlink($procQueue);
    }
}

// 2. Process Usage Stats from Cache
if ($cache->isEnabled()) {
    echo "[Worker] Syncing usage stats...\n";
    
    // Sync usage:table:id keys (api_keys, endpoints - these still use old format)
    $usageKeys = $cache->scan('usage:*');
    echo "[Worker] Found " . count($usageKeys) . " usage keys.\n";

    if ($usageKeys) {
        $pdo->beginTransaction();
        foreach ($usageKeys as $key) {
            // Key format: usage:table:id
            $parts = explode(':', $key);
            if (count($parts) !== 3) continue;
            
            $table = $parts[1];
            $id = (int)$parts[2];
            $val = (int)$cache->get($key);
            
            if ($val > 0) {
                // Update DB with fixed query mapping to prevent SQL injection
                $updateQueries = [
                    'api_keys' => "UPDATE api_keys SET used = used + ? WHERE id = ?",
                    'endpoints' => "UPDATE endpoints SET used = used + ? WHERE id = ?"
                ];

                if (isset($updateQueries[$table])) {
                    $pdo->prepare($updateQueries[$table])->execute([$val, $id]);
                }
                // Delete cache key (reset to 0 effectively)
                $cache->delete($key);
            }
        }
        $pdo->commit();
        echo "[Worker] Usage synced.\n";
    }

    // Sync res:ep:id keys (endpoint_providers reservations - new format)
    // These are the SOURCE OF TRUTH, so we SET (not increment) and do NOT delete
    $resKeys = $cache->scan('res:ep:*');
    echo "[Worker] Found " . count($resKeys) . " reservation keys.\n";

    if ($resKeys) {
        $pdo->beginTransaction();
        foreach ($resKeys as $key) {
            // Key format: res:ep:id
            $parts = explode(':', $key);
            if (count($parts) !== 3 || $parts[0] !== 'res' || $parts[1] !== 'ep') continue;
            
            $id = (int)$parts[2];
            $val = (int)$cache->get($key);
            
            if ($val > 0) {
                // SET used to cache value (cache is source of truth)
                $pdo->prepare("UPDATE endpoint_providers SET used = ? WHERE id = ?")->execute([$val, $id]);
                // Do NOT delete - reservation key is the live counter
            }
        }
        $pdo->commit();
        echo "[Worker] Reservations synced.\n";
    }
}

// 3. Log Rotation
$rotationLogFile = __DIR__ . '/../storage/logs/requests.log';
if (file_exists($rotationLogFile) && filesize($rotationLogFile) > 20 * 1024 * 1024) { // 20MB
    echo "[Worker] Rotating log file...\n";
    rename($rotationLogFile, $rotationLogFile . '.' . date('YmdHis') . '.bak');
    // Keep last 5 logs
    $logs = glob(__DIR__ . '/../storage/logs/requests.log.*.bak');
    if (count($logs) > 5) {
        usort($logs, function($a, $b) { return filemtime($a) - filemtime($b); });
        unlink($logs[0]); // Delete oldest
    }
}

echo "[Worker] Done.\n";
