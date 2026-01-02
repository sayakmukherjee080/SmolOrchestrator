<?php
declare(strict_types=1);

/**
 * Applies security headers to the current response.
 * Includes a whitelist for localhost/development environments.
 */
function apply_security_headers(): void {
    if (headers_sent()) return;

    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("X-XSS-Protection: 1; mode=block");
    header("Referrer-Policy: strict-origin-when-cross-origin");
    
    // Generate Nonce
    $nonce = csp_nonce();
    
    // Allow localhost/127.0.0.1 for development (still use nonces)
    $host = $_SERVER['HTTP_HOST'] ?? '';
    // $isLocal = str_contains($host, 'localhost') || str_contains($host, '127.0.0.1'); 
    // Actually, strict CSP is best everywhere.

    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$nonce'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:;");
}

function csp_nonce(): string {
    static $nonce = null;
    if ($nonce === null) {
        $nonce = base64_encode(random_bytes(16));
    }
    return $nonce;
}
