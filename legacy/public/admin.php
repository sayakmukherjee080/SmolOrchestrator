<?php
// public/admin.php
declare(strict_types=1);
session_start();


require_once __DIR__ . '/includes/constants.php';
require_once __DIR__ . '/includes/config.php';

require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/classes/AdminController.php';
require_once __DIR__ . '/includes/classes/Auth.php';

$auth = new Auth($pdo);
if (!$auth->check()) {
    header('Location: login.php');
    exit;
}

$controller = new AdminController($pdo);
$controller->handleAjaxActions();
$flash = $controller->handlePostActions();

$page = $page ?? 'dashboard';
$validPages = ['dashboard','endpoints','providers','mappings','keys','usage','logs','playground','settings'];
if (!in_array($page, $validPages)) $page = 'dashboard';

$globalData = $controller->getGlobalData();
$data = $controller->getPageData($page);

require __DIR__ . '/includes/views/layout/header.php';
require __DIR__ . '/includes/views/layout/sidebar.php';
?>

<!-- Mobile Header -->
<div class="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-950 border-b border-emerald-500/20 flex items-center justify-between px-4 z-40 glass">
    <div class="font-bold text-lg tracking-wider text-glow">SmolOrchestrator</div>
    <button id="mobile-menu-btn" class="text-emerald-400 p-2 border border-emerald-500/30 rounded">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
    </button>
</div>

<!-- Main Content -->
<div class="flex-1 overflow-y-auto md:pt-0 pt-16">
    <div class="p-6 md:p-8">
        <div class="mb-8">
            <h1 class="text-3xl font-bold tracking-tight text-glow mb-2">
                <?php
                $titles = [
                    'dashboard' => 'SYSTEM_OVERVIEW',
                    'endpoints' => 'ENDPOINT_CONTROL',
                    'providers' => 'PROVIDER_NODES',
                    'mappings' => 'ROUTING_MAP',
                    'keys' => 'ACCESS_KEYS',
                    'usage' => 'METRICS_&_DATA',
                    'logs' => 'REQUEST_LOGS',
                    'playground' => 'TERMINAL_INTERFACE',
                    'settings' => 'SYSTEM_CONFIGURATION',
                ];
                echo $titles[$page] ?? 'UNKNOWN_MODULE';
                ?>
            </h1>
            <div class="h-0.5 w-24 bg-gradient-to-r from-emerald-500 to-transparent"></div>
        </div>

        <?php if (!empty($flash)): ?>
        <div class="p-4 mb-6 border-l-4 <?php echo $flash['type']==='success' ? 'border-emerald-500 bg-emerald-900/20 text-emerald-200' : 'border-rose-500 bg-rose-900/20 text-rose-200'; ?> font-mono text-sm shadow-[0_0_15px_rgba(0,0,0,0.5)]">
            <span class="font-bold mr-2">[<?php echo strtoupper($flash['type']); ?>]</span> <?php echo h($flash['msg']); ?>
        </div>
    <?php endif; ?>

    <?php
    $viewFile = __DIR__ . "/includes/views/admin/{$page}.php";
    if (file_exists($viewFile)) {
        require $viewFile;
    } else {
        echo "<div class='text-rose-500'>ERR_VIEW_NOT_FOUND: {$page}</div>";
    }
    ?>
</main>
</div>
</body>
</html>
