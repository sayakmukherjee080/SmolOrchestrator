<?php
declare(strict_types=1);

// public/includes/helpers.php

/**
 * Get the application secret from env or file.
 */
function app_secret(): string {
    static $secret = null;
    if ($secret !== null) return $secret;

    $secretPath = __DIR__ . '/../../storage/app_secret';
    if (getenv('APP_SECRET')) {
        $secret = getenv('APP_SECRET');
        return $secret;
    }
    
    if (file_exists($secretPath)) {
        $secret = trim(file_get_contents($secretPath));
        return $secret;
    }
    
    throw new RuntimeException("App secret missing");
}

/**
 * Encrypt a string using AES-256-GCM.
 */
function enc(string $plaintext): string {
    $srcKey = app_secret();
    $key = strlen($srcKey) === 64 ? hex2bin($srcKey) : $srcKey; // Handle legacy vs new hex keys
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return base64_encode($iv) . ':' . base64_encode($ciphertext) . ':' . base64_encode($tag);
}

/**
 * Decrypt a string using AES-256-GCM.
 */
function dec(string $blob): string {
    $parts = explode(':', $blob);
    if (count($parts) !== 3) return '';
    $iv = base64_decode($parts[0]);
    $cipher = base64_decode($parts[1]);
    $tag = base64_decode($parts[2]);
    $srcKey = app_secret();
    $key = strlen($srcKey) === 64 ? hex2bin($srcKey) : $srcKey;
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return $plain === false ? '' : $plain;
}

/**
 * Alias for consistency.
 */
function dec_key(string $blob): string {
    return dec($blob);
}

/**
 * CSRF token generation.
 */
function csrf_token(): string {
    if (session_status() === PHP_SESSION_NONE) session_start();
    $_SESSION['csrf_token'] = $_SESSION['csrf_token'] ?? bin2hex(random_bytes(32));
    return $_SESSION['csrf_token'];
}

/**
 * CSRF token check.
 */
function csrf_check(?string $token): bool {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['csrf_token']) || empty($token)) return false;
    return hash_equals($_SESSION['csrf_token'], $token);
}

/**
 * HTML Escaping shorthand.
 */
function h(?string $s): string { 
    return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); 
}

/**
 * Send JSON response and exit.
 */
function respond_json(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

/**
 * Calculate percentage.
 */
function pct(int $used, int $quota): float {
    if ($quota === 0) return 0.0;
    return (float)min(100, round(($used / $quota) * 100, 1));
}

