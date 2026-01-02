<?php
// public/login.php
declare(strict_types=1);
session_start();
$storageDir = __DIR__ . '/../storage';
$dbPath = $storageDir . '/app.db';
$lockPath = $storageDir . '/install.lock';
if (!file_exists($lockPath)) {
    header('Location: install.php');
    exit;
}

require_once __DIR__ . '/includes/classes/Auth.php';
require_once __DIR__ . '/includes/security.php';
apply_security_headers();

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$auth = new Auth($pdo);

// Redirect if already logged in
if ($auth->check()) {
    header('Location: dashboard.php');
    exit;
}

$err = '';
// Session-based CAPTCHA for brute force protection
$showCaptcha = ($_SESSION['login_failures'] ?? 0) >= 3;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // IP-based rate limiting
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $isLocal = in_array($ip, ['127.0.0.1', '::1']);
    
    // CAPTCHA Check
    if ($showCaptcha) {
        $userCaptcha = (int)($_POST['captcha'] ?? 0);
        $sessCaptcha = (int)($_SESSION['captcha_answer'] ?? -1);
        if ($userCaptcha !== $sessCaptcha) {
            $err = 'Invalid Security-Check (CAPTCHA).';
            $_SESSION['login_failures'] = ($_SESSION['login_failures'] ?? 0) + 1;
        }
    }

    if (!$err) {
        $window = time() - 1800; // 30 mins window
        if (!$isLocal) {
            // Cleanup old attempts and count recent ones
            $pdo->prepare("DELETE FROM login_attempts WHERE ts < ?")->execute([$window]);
            $stmtCount = $pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip = ?");
            $stmtCount->execute([$ip]);
            
            if ($stmtCount->fetchColumn() >= 10) {
                $err = 'Too many attempts. Try again in 30 minutes.';
            }
        }
    }

    if (!$err) {
        $email = $_POST['email'] ?? '';
        $pass = $_POST['password'] ?? '';
        $remember = isset($_POST['remember']);
        
        if ($auth->login($email, $pass, $remember)) {
            unset($_SESSION['login_failures']);
            unset($_SESSION['captcha_answer']);
            header('Location: dashboard.php');
            exit;
        }
        
        // Failed login
        $_SESSION['login_failures'] = ($_SESSION['login_failures'] ?? 0) + 1;
        $showCaptcha = $_SESSION['login_failures'] >= 3;
        
        if (!$isLocal) {
            $pdo->prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)")->execute([$ip, time()]);
        }
        $err = 'Invalid credentials';
    }
}

// Generate new CAPTCHA if needed
$captchaLabel = '';
if ($showCaptcha) {
    $n1 = rand(1, 9);
    $n2 = rand(1, 9);
    $_SESSION['captcha_answer'] = $n1 + $n2;
    $captchaLabel = "SECURITY_CHECK: $n1 + $n2 = ?";
}
?><!doctype html>
<html class="h-full bg-slate-950 text-emerald-400 font-mono selection:bg-emerald-500/30 selection:text-emerald-200" style="background-color: #020617;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
  <title>LOGIN // SMOLORCHESTRATOR</title>
  <link rel="icon" type="image/png" href="smolorchestrator_logo.png">
</head>
<body class="h-full flex items-center justify-center p-6">
  <form method="post" class="w-full max-w-md glass cyber-corner p-8 space-y-6">
    <div class="text-center mb-8">
      <img src="smolorchestrator_logo.png" alt="SmolOrchestrator" class="h-16 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
      <div class="text-[10px] text-emerald-500/50 tracking-[0.3em]">AUTHENTICATION_REQUIRED</div>
    </div>
    
    <?php if ($err): ?>
      <div class="bg-rose-900/20 border border-rose-500/30 text-rose-400 p-3 rounded-sm text-xs font-bold tracking-wide">
        [ ERROR: <?php echo htmlentities($err); ?> ]
      </div>
    <?php endif; ?>
    
    <div class="space-y-2">
      <label class="block text-[10px] text-emerald-500/70 uppercase tracking-wider">Identity_Key (Email)</label>
      <input name="email" type="email" required class="w-full p-3 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" placeholder="user@system.local" />
    </div>
    
    <div class="space-y-2">
      <label class="block text-[10px] text-emerald-500/70 uppercase tracking-wider">Access_Code (Password)</label>
      <input name="password" type="password" required class="w-full p-3 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" placeholder="••••••••" />
    </div>

    <?php if (isset($showCaptcha) && $showCaptcha): ?>
    <div class="space-y-2 border-l-2 border-rose-500/50 pl-3">
      <label class="block text-[10px] text-rose-500/70 uppercase tracking-wider"><?php echo $captchaLabel; ?></label>
      <input name="captcha" type="number" required class="w-full p-3 bg-black/50 border border-rose-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-rose-400 focus:shadow-[0_0_10px_rgba(244,63,94,0.2)] transition-all font-mono text-sm" placeholder="?" />
    </div>
    <?php endif; ?>

    <div class="flex items-center gap-3 pt-2">
        <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" name="remember" class="sr-only peer">
            <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none border border-emerald-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-emerald-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-900/50"></div>
            <span class="ml-3 text-[10px] font-mono text-emerald-500/70 uppercase tracking-wider">Remember_Session</span>
        </label>
    </div>
    
    <button class="w-full bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 py-3 rounded-sm text-xs font-bold tracking-[0.2em] uppercase transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] mt-4">
      [ Initialize_Session ]
    </button>
    
    <div class="flex justify-between items-center pt-4 border-t border-emerald-500/10">
      <div class="text-[10px] text-emerald-500/30">SECURE_CONNECTION</div>
      <div class="text-[10px] text-emerald-500/30">V1.0.0</div>
    </div>
  </form>
</body>
</html>
