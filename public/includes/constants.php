<?php
declare(strict_types=1);

// Application Constants
define('APP_NAME', 'SmolOrchestrator');
define('APP_VERSION', '1.0.0');

// Paths
define('STORAGE_PATH', __DIR__ . '/../../storage');
define('LOG_PATH', STORAGE_PATH . '/logs');
define('DB_PATH', STORAGE_PATH . '/app.db');

// Cache Keys (Prefixes)
define('CACHE_KEY_USAGE', 'usage:');
define('CACHE_KEY_LIMIT', 'limit:');

// Security
define('MAX_LOGIN_ATTEMPTS', 10);
define('LOGIN_LOCKOUT_TIME', 1800);

// Gateway
define('GATEWAY_TIMEOUT', 30);
