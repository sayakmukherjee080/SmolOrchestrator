<?php
// dev/test_routing.php
declare(strict_types=1);

function test_path($requestUri, $scriptName) {
    $path = parse_url($requestUri, PHP_URL_PATH) ?: '/';
    $baseDir = dirname($scriptName);
    
    if ($baseDir === DIRECTORY_SEPARATOR || $baseDir === '.') {
        $baseDir = '';
    }
    
    if ($baseDir !== '' && strpos($path, $baseDir) === 0) {
        $path = substr($path, strlen($baseDir));
    }

    $path = '/' . ltrim($path, '/');
    $normalizedPath = ($path !== '/') ? rtrim($path, '/') : $path;
    
    return $normalizedPath;
}

$tests = [
    // [Request URI, Script Name, Expected Normalized Path]
    ['/v1/models', '/index.php', '/v1/models'],
    ['/v1/models/', '/index.php', '/v1/models'],
    ['/smol/v1/models', '/smol/index.php', '/v1/models'],
    ['/smol/v1/models/', '/smol/index.php', '/v1/models'],
    ['/', '/index.php', '/'],
    ['/index.php', '/index.php', '/index.php'],
    ['/smol/', '/smol/index.php', '/'],
];

echo "Routing Logic Test Results:\n";
echo str_repeat("-", 80) . "\n";
echo sprintf("%-30s | %-20s | %-15s | %-10s\n", "Request URI", "Script Name", "Result", "Status");
echo str_repeat("-", 80) . "\n";

$failed = 0;
foreach ($tests as [$uri, $script, $expected]) {
    $result = test_path($uri, $script);
    $status = ($result === $expected) ? "PASS" : "FAIL (Expected: $expected)";
    if ($result !== $expected) $failed++;
    echo sprintf("%-30s | %-20s | %-15s | %-10s\n", $uri, $script, $result, $status);
}

echo str_repeat("-", 80) . "\n";
if ($failed === 0) {
    echo "SUCCESS: All tests passed!\n";
} else {
    echo "FAILURE: $failed tests failed.\n";
    exit(1);
}
