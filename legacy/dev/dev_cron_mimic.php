<?php
// dev/dev_cron_mimic.php
// Run this in a separate terminal to mimic a cron job running every 30 seconds.

echo "[Dev] Starting Cron Mimic...\n";
echo "[Dev] Will run worker.php every 30 seconds.\n";

$workerPath = __DIR__ . '/../public/worker.php';

while (true) {
    echo "\n[Dev] Running worker at " . date('H:i:s') . "...\n";
    // Execute worker
    passthru("php \"$workerPath\"");
    
    echo "[Dev] Sleeping for 30s...\n";
    sleep(30);
}
