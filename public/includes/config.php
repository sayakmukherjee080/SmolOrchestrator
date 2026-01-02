<?php
declare(strict_types=1);

// public/includes/config.php

// Secure Session Configuration
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_secure', '1');
    ini_set('session.cookie_samesite', 'Strict');
    ini_set('session.gc_maxlifetime', '3600'); // 1 hour
    ini_set('session.use_strict_mode', '1');
}

$storageDir = __DIR__ . '/../../storage';
$dbPath = $storageDir . '/app.db';
$secretPath = $storageDir . '/app_secret';

// Database Connection
try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    http_response_code(500);
    die("A database error occurred. Please contact the administrator.");
}

// Check for install lock
if (!file_exists($storageDir . '/install.lock')) {
    // If not installed, redirect to install.php
    // Prevent redirect loop if already on install.php (though config.php isn't usually included there)
    // But just in case this file gets included, we check the script name.
    $script = basename($_SERVER['SCRIPT_NAME']);
    if ($script !== 'install.php') {
        header('Location: install.php');
        exit;
    }
}
