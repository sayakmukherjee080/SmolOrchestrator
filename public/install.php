<?php
// public/install.php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/includes/security.php';
apply_security_headers();

$storageDir = __DIR__ . '/../storage';
$dbPath = $storageDir . '/app.db';
$lockPath = $storageDir . '/install.lock';
$secretPath = $storageDir . '/app_secret';

// preflight check results
$checks = [
    'extensions' => [
        'pdo_sqlite' => ['name' => 'PDO SQLite', 'required' => true, 'loaded' => extension_loaded('pdo_sqlite')],
        'openssl'    => ['name' => 'OpenSSL', 'required' => true, 'loaded' => extension_loaded('openssl')],
        'curl'       => ['name' => 'cURL', 'required' => true, 'loaded' => extension_loaded('curl')],
        'json'       => ['name' => 'JSON', 'required' => true, 'loaded' => extension_loaded('json')],
        'mbstring'   => ['name' => 'mbstring', 'required' => true, 'loaded' => extension_loaded('mbstring')],
        'apcu'       => ['name' => 'APCu (Optional)', 'required' => false, 'loaded' => extension_loaded('apcu')],
    ],
    'folders' => [
        'storage' => ['name' => 'Storage Write Permissions', 'required' => true, 'writable' => is_writable($storageDir) || (!file_exists($storageDir) && is_writable(dirname($storageDir)))]
    ],
    'php_info' => [
        'version' => PHP_VERSION,
        'ini_file' => php_ini_loaded_file(),
        'sapi' => php_sapi_name()
    ]
];


// Auto-migration / Repair (for existing installations)
if (file_exists($lockPath) && file_exists($dbPath)) {
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Run embedded schema updates if needed
        $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY,
            ip TEXT NOT NULL,
            ts INTEGER NOT NULL
        )");
        
        // Add indexes if missing
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_endpoints_name ON endpoints(name)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_ep_provider ON endpoint_providers(endpoint_id, priority)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_logs_ts ON request_logs(ts)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_selector ON auth_tokens(selector)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_providers_enabled ON providers(enabled)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip)");
    } catch (Exception $e) {}
    
    // FIXED: Proper installed check with clean exit
    ?><!DOCTYPE html>
<html lang="en" style="background-color: #020617;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMOLORCHESTRATOR // Already Installed</title>
    <link rel="icon" type="image/png" href="smolorchestrator_logo.png">
    <script src="/vendor/tailwindcss/dist/lib.min.js"></script>
    <script nonce="<?php echo csp_nonce(); ?>">
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              terminal: {
                black: '#020617',
                green: '#10b981',
                dim: 'rgba(16, 185, 129, 0.1)'
              }
            }
          }
        }
      }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body { background-color: #020617; color: #10b981; font-family: 'JetBrains Mono', monospace; }
        .text-glow { text-shadow: 0 0 5px rgba(16,185,129,0.5), 0 0 10px rgba(16,185,129,0.3); }
        .glass { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.2); }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen">
    <div class="glass p-8 max-w-md text-center">
        <h1 class="text-2xl font-bold text-emerald-500 mb-4 text-glow">System Already Installed</h1>
        <p class="text-emerald-400/70 mb-6">Installation has already been completed.</p>
        <p class="text-xs text-emerald-500/50 mb-4">To reinstall, remove: <?php echo htmlspecialchars($lockPath); ?></p>
        <a href="login.php" class="inline-block px-6 py-2 bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/20 transition">Go to Login</a>
    </div>
</body>
</html>
<?php
    exit; // CRITICAL: Must exit here!
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if (!$email || !$password) {
        $error = "Email and password required.";
    } else {
        try {
            // Check/create storage directory with proper permissions
            if (!is_dir($storageDir)) {
                if (!mkdir($storageDir, 0755, true)) {
                    throw new Exception("Failed to create storage directory: $storageDir");
                }
            }
            
            // Verify directory is writable
            if (!is_writable($storageDir)) {
                throw new Exception("Storage directory not writable: $storageDir - Please run: chmod 755 " . $storageDir);
            }
            
            // If database exists, check if it's writable
            if (file_exists($dbPath) && !is_writable($dbPath)) {
                throw new Exception("Database file not writable: $dbPath - Please run: chmod 644 " . $dbPath);
            }
            
            // Check secret file permissions
            if (file_exists($secretPath) && !is_writable($secretPath)) {
                throw new Exception("Secret file not writable: $secretPath");
            }

            $secret = bin2hex(random_bytes(32));
            if (file_put_contents($secretPath, $secret) === false) {
                throw new Exception("Failed to write secret file");
            }
            if (!chmod($secretPath, 0600)) {
                throw new Exception("Failed to set secret file permissions");
            }

            // Create/open database
            $pdo = new PDO('sqlite:' . $dbPath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            // Set proper permissions on database file immediately after creation
            if (file_exists($dbPath)) {
                @chmod($dbPath, 0644);
            }
            
            // SQLite also creates -wal and -shm files, ensure directory allows this
            // by checking if we can create a test file
            $testFile = $storageDir . '/.write_test_' . uniqid();
            if (@file_put_contents($testFile, 'test') === false) {
                throw new Exception("Cannot create files in storage directory. Check permissions.");
            }
            @unlink($testFile);
            
            // Execute embedded schema (production-ready, no external dependencies)
            $pdo->exec("PRAGMA journal_mode = WAL");
            
            // Create core tables
            $pdo->exec("CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS endpoints (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                quota INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                reset_at INTEGER NOT NULL
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS providers (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key_enc TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS endpoint_providers (
                id INTEGER PRIMARY KEY,
                endpoint_id INTEGER NOT NULL,
                provider_id INTEGER NOT NULL,
                model TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 1,
                quota INTEGER NOT NULL DEFAULT 90,
                used INTEGER NOT NULL DEFAULT 0,
                reset_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                suspended_until INTEGER DEFAULT 0,
                rate_limit_hits INTEGER DEFAULT 0,
                FOREIGN KEY(endpoint_id) REFERENCES endpoints(id),
                FOREIGN KEY(provider_id) REFERENCES providers(id)
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY,
                key_hash TEXT UNIQUE NOT NULL,
                label TEXT,
                endpoint TEXT NOT NULL,
                quota INTEGER DEFAULT 0,
                used INTEGER NOT NULL DEFAULT 0,
                reset_at INTEGER DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS request_logs (
                id INTEGER PRIMARY KEY,
                ts INTEGER NOT NULL,
                endpoint TEXT NOT NULL,
                provider TEXT NOT NULL,
                status INTEGER NOT NULL,
                latency_ms INTEGER NOT NULL,
                response_snippet TEXT
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS auth_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                selector TEXT UNIQUE NOT NULL,
                hashed_validator TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )");
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY,
                ip TEXT NOT NULL,
                ts INTEGER NOT NULL
            )");
            
            // Create indexes
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_endpoints_name ON endpoints(name)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_ep_provider ON endpoint_providers(endpoint_id, priority)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_logs_ts ON request_logs(ts)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_selector ON auth_tokens(selector)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_providers_enabled ON providers(enabled)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip)");

            $now = time();
            $pdo->beginTransaction();
            // Default endpoints (skip if already exist)
            $stmt = $pdo->prepare("INSERT OR IGNORE INTO endpoints (name,quota,used,reset_at) VALUES (?,?,0,?)");
            $stmt->execute(['pro', 90, $now]);
            $stmt->execute(['flash', 90, $now]);
            
            // Admin user (replace if email exists)
            $passHash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("INSERT OR REPLACE INTO users (email,password,created_at) VALUES (?,?,?)");
            $stmt->execute([$email, $passHash, $now]);
            $pdo->commit();
            
            // FIXED: Create lock file BEFORE attempting rename
            $lockWriteResult = file_put_contents($lockPath, date('c'));
            if ($lockWriteResult === false) {
                throw new Exception("Failed to write lock file to: $lockPath");
            }
            
            if (!file_exists($lockPath)) {
                throw new Exception("Lock file was not created at: $lockPath");
            }
            
            @chmod($lockPath, 0600);
            
            // FIXED: Try to rename, but don't fail if it doesn't work
            // The lock file is the real protection mechanism
            $renamed = @rename(__FILE__, __FILE__ . '.bak');
            
            // Optional: Log if rename failed (for debugging)
            if (!$renamed) {
                $debugLog = $storageDir . '/install_debug.log';
                @file_put_contents($debugLog, "[".date('c')."] Warning: Could not rename install.php (permissions?)\n", FILE_APPEND);
            }
            
            // FIXED: Use absolute redirect and exit immediately
            header('Location: login.php', true, 303);
            exit;

        } catch (Exception $e) {
            $error = "Installation Failed: " . htmlspecialchars($e->getMessage());
            
            // Add helpful permission information
            $permInfo = [];
            if (is_dir($storageDir)) {
                $permInfo[] = "Storage dir permissions: " . substr(sprintf('%o', fileperms($storageDir)), -4);
            }
            if (file_exists($dbPath)) {
                $permInfo[] = "Database permissions: " . substr(sprintf('%o', fileperms($dbPath)), -4);
            }
            if (!empty($permInfo)) {
                $error .= " | " . implode(" | ", $permInfo);
            }
            
            if (isset($pdo) && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
        }
    }
}
?><!DOCTYPE html>
<html lang="en" style="background-color: #020617;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMOLORCHESTRATOR // INSTALL</title>
    <link rel="icon" type="image/png" href="smolorchestrator_logo.png">
    <script src="/vendor/tailwindcss/dist/lib.min.js"></script>
    <script nonce="<?php echo csp_nonce(); ?>">
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              terminal: {
                black: '#020617',
                green: '#10b981',
                dim: 'rgba(16, 185, 129, 0.1)'
              }
            }
          }
        }
      }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body { background-color: #020617; color: #10b981; font-family: 'JetBrains Mono', monospace; overflow-x: hidden; }
        .crt-container { min-height: 100vh; position: relative; background: radial-gradient(circle, rgba(16,185,129,0.05) 0%, rgba(0,0,0,1) 90%); }
        .text-glow { text-shadow: 0 0 5px rgba(16,185,129,0.5), 0 0 10px rgba(16,185,129,0.3); }
        .glass { background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.2); }
        .cyber-input { background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; transition: all 0.3s; }
        .cyber-input:focus { outline: none; border-color: #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.2); }
        .cyber-button { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.5); color: #10b981; transition: all 0.3s; text-transform: uppercase; letter-spacing: 0.1em; }
        .cyber-button:hover { background: rgba(16, 185, 129, 0.2); box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); text-shadow: 0 0 8px rgba(16, 185, 129, 0.8); }
        .terminal-text { font-size: 0.75rem; line-height: 1.25rem; font-family: 'JetBrains Mono', monospace; }
        .terminal-text::-webkit-scrollbar { display: none; }
        .terminal-text { -ms-overflow-style: none; scrollbar-width: none; }
        .redacted { background: #10b981; color: transparent; user-select: none; border-radius: 2px; }
        .cursor::after { content: '_'; animation: blink 1s step-end infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        #boot-screen { transition: opacity 1s ease-out; }
        .error-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }
    </style>
</head>
<body class="bg-black">
    <div class="crt-container flex items-center justify-center p-4">
        
        <div class="w-full max-w-3xl relative z-10">
            <?php if (isset($error)): ?>
            <div class="error-banner p-4 mb-4 rounded-sm text-sm">
                <span class="font-bold">ERROR:</span> <?php echo $error; ?>
            </div>
            <?php endif; ?>
            

            
            <!-- Boot Sequence Container -->
            <div id="boot-screen" class="glass p-8 min-h-[400px] flex flex-col justify-start">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></div>
                    <h1 class="text-sm font-bold tracking-widest text-emerald-500 uppercase">System_Boot_Sequence // PRE_FLIGHT_CHECK</h1>
                </div>

                <div id="terminal-log" class="space-y-1 terminal-text font-mono text-emerald-400 overflow-y-auto max-h-[300px]">
                    <p class="opacity-50">[   0.000000] Initializing kernel...</p>
                    <p class="opacity-50">[   0.124592] Mounting base filesystems...</p>
                </div>
                
                <div id="boot-conclusion" class="mt-auto hidden pt-6 border-t border-emerald-500/20">
                    <div id="halted-msg" class="hidden">
                        <p class="text-rose-500 font-bold uppercase tracking-[0.2em] animate-pulse">!! SYSTEM_HALTED // REQUIRED_COMPONENT_MISSING !!</p>
                        <p class="text-xs text-rose-500/70 mt-2 italic">Reason: Critical dependencies not found. Please install the missing PHP extensions listed above.</p>
                    </div>
                </div>
            </div>

            <!-- Install Form Container (Hidden by default) -->
            <div id="config-form" class="hidden opacity-0 translate-y-4 transition-all duration-1000">
                <div class="mb-8 text-center">
                    <h1 class="text-4xl font-bold tracking-tighter text-emerald-500 mb-2 flex justify-center items-center gap-2">
                        <img src="smolorchestrator_logo.png" alt="SmolOrchestrator" class="h-20 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                    </h1>
                    <div class="text-[10px] text-emerald-500/50 tracking-[0.5em] uppercase">Ready_to_Install</div>
                </div>

                <form method="post" class="glass p-8 rounded-sm relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500/50"></div>
                    <div class="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500/50"></div>

                    <h2 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-6 border-b border-emerald-500/20 pb-2">Admin_Configuration</h2>

                    <div class="space-y-6">
                        <div class="space-y-2">
                            <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Administrator_Email</label>
                            <input name="email" type="email" required placeholder="admin@system.local" class="w-full p-3 rounded-sm cyber-input font-mono text-sm placeholder-emerald-500/20">
                        </div>
                        <div class="space-y-2">
                            <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Secure_Passphrase</label>
                            <input name="password" type="password" required placeholder="••••••••••••" class="w-full p-3 rounded-sm cyber-input font-mono text-sm placeholder-emerald-500/20">
                        </div>
                        <div class="pt-4">
                            <button class="w-full py-3 cyber-button font-bold text-sm group relative overflow-hidden">
                                <span class="relative z-10">[ EXECUTE_INSTALL_SEQUENCE ]</span>
                                <div class="absolute inset-0 bg-emerald-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script nonce="<?php echo csp_nonce(); ?>">
        const checkData = <?php echo json_encode($checks); ?>;
        const log = document.getElementById('terminal-log');
        const bootScreen = document.getElementById('boot-screen');
        const configForm = document.getElementById('config-form');

        async function printLine(text, delay = 5, isError = false, isOptional = false, isSuccess = false) {
            const p = document.createElement('p');
            const ts = (performance.now() / 1000).toFixed(6);
            p.innerHTML = `<span class="opacity-30 mr-2">[ ${ts.padStart(10, ' ')}]</span> `;
            
            if (isError) p.classList.add('text-rose-500');
            else if (isOptional) p.classList.add('text-amber-500/70');
            else if (isSuccess) p.classList.add('text-emerald-400'); // Explicit green for success overrides
            
            log.appendChild(p);
            
            // Fast typing (near instant for 1.5s total)
            for (let i = 0; i < text.length; i+=3) {
                p.innerHTML += text.substring(i, i+3);
                log.scrollTop = log.scrollHeight;
                await new Promise(r => setTimeout(r, 1)); 
            }
            await new Promise(r => setTimeout(r, delay));
        }

        async function runBoot() {
            // Delays drastically reduced for 1.5s target
            await printLine("Initializing Key Orchestrator sequence...", 10);
            await printLine("Scanning hardware configuration...", 10);
            
            // Diagnostics
            await printLine(`PHP Version: ${checkData.php_info.version}`, 5);
            await printLine(`SAPI Mode:   ${checkData.php_info.sapi}`, 5);
            await printLine(`Config:      ${checkData.php_info.ini_file || 'NONE'}`, 5, false, !checkData.php_info.ini_file);
            await printLine("----------------------------------------", 10);

            let allMandatoryPassed = true;

            // 1. Storage Check
            const storageCheck = checkData.folders.storage;
            if (storageCheck.writable) {
                await printLine(`Storage Permissions [ ${storageCheck.name} ] ... [ OK ]`, 10);
            } else {
                allMandatoryPassed = false;
                await printLine(`Storage Permissions [ ${storageCheck.name} ] ... [ ACCESS_DENIED ]`, 20, true);
                await printLine("!!! FATAL: Cannot write to storage directory. Check permissions !!!", 20, true);
            }

            // 2. Extensions Check
            for (const [key, info] of Object.entries(checkData.extensions)) {
                let status = info.loaded ? "[ OK ]" : (info.required ? "[ FAILED ]" : "[ MISSING ]");
                // Shorten spacing for aesthetics
                let msg = `Check: ${info.name.padEnd(15)} ... ${status}`;
                
                // If it's a required failure, error color. If optional/missing, warning color.
                const isErr = !info.loaded && info.required;
                
                // Optional logic: 
                // if loaded = green (default/isSuccess). 
                // if not loaded & optional = amber (isOptional).
                const isWarn = !info.loaded && !info.required;
                const isGood = info.loaded && !info.required; // Explicitly mark optional-but-loaded as good? No, default is green.
                
                await printLine(msg, 5, isErr, isWarn);
                
                if (isErr) {
                    allMandatoryPassed = false;
                    
                    // Special hint for mbstring
                    if (key === 'mbstring') {
                        await printLine("TIP: Install php-mbstring functionality", 10, true);
                    }
                }
            }

            await new Promise(r => setTimeout(r, 100));

            if (allMandatoryPassed) {
                await printLine("Pre-flight checks passed. Launching interface...", 20);
                await new Promise(r => setTimeout(r, 100));
                
                // Transition
                bootScreen.style.opacity = '0';
                setTimeout(() => {
                    bootScreen.classList.add('hidden');
                    configForm.classList.remove('hidden');
                    setTimeout(() => {
                        configForm.classList.remove('opacity-0', 'translate-y-4');
                    }, 50);
                }, 300);
            } else {
                document.getElementById('boot-conclusion').classList.remove('hidden');
                document.getElementById('halted-msg').classList.remove('hidden');
                await printLine("!!! SYSTEM HALTED: REQUIREMENTS NOT MET !!!", 0, true);
            }
        }

        window.addEventListener('load', runBoot);
    </script>
</body>
</html>