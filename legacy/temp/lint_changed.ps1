$php = 'C:\php\php.exe'
$files = @(
    'public\includes\constants.php',
    'public\includes\helpers.php',
    'public\includes\security.php',
    'public\includes\config.php',
    'public\includes\classes\Auth.php',
    'public\includes\classes\RateLimiter.php',
    'public\includes\classes\AdminController.php',
    'public\includes\classes\Gateway.php',
    'public\worker.php',
    'public\install.php',
    'public\includes\views\admin\mappings.php',
    'public\includes\views\admin\playground.php',
    'public\includes\views\admin\dashboard.php',
    'public\includes\views\layout\header.php'
)

$failed = 0
foreach ($f in $files) {
    & $php -l $f
    if ($LASTEXITCODE -ne 0) { $failed++ }
}

Write-Output '--- Routing test ---'
& $php 'dev\test_routing.php'
if ($LASTEXITCODE -ne 0) { $failed++ }

if ($failed -gt 0) {
    Write-Output "CHECK FAILURES: $failed"
    exit 1
}
Write-Output 'ALL CHECKS PASSED'
