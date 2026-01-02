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
    
    // We need to scan keys. 
    // APCu supports iterator, File cache we can glob.
    // Since Cache class doesn't expose scan, we'll add a simple way to get keys or just iterate known IDs?
    // Iterating known IDs is inefficient. 
    // Let's rely on the fact that we can't easily scan APCu without an iterator.
    // But for file cache we can glob.
    // For this implementation, let's assume we can't easily scan APCu keys in a generic way without `apcu_key_info` or similar which might be heavy.
    // However, we can just iterate over all keys if we had a list.
    // A better approach for "Buffered Usage" is to maintain a "dirty set" in cache, but that adds complexity.
    // For now, let's just try to implement a `scan` method in Cache class or just handle File driver here since that's what we likely use locally.
    // Actually, let's add `scan` to Cache class first? No, let's just do it here for now if possible.
    
    // If driver is file, we can glob.
    $keys = $cache->scan('usage:*');
    echo "[Worker] Found " . count($keys) . " usage keys.\n";

    if ($keys) {
        $pdo->beginTransaction();
        foreach ($keys as $key) {
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
                    'endpoints' => "UPDATE endpoints SET used = used + ? WHERE id = ?",
                    'endpoint_providers' => "UPDATE endpoint_providers SET used = used + ? WHERE id = ?"
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
