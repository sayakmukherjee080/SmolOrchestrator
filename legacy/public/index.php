<?php
// public/index.php
declare(strict_types=1);

require_once __DIR__ . '/includes/constants.php';
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/security.php';
// Apply global security headers
apply_security_headers();

require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/classes/Gateway.php';

$gateway = new Gateway($pdo);
$gateway->handleRequest();
