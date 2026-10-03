<?php
// public/404.php
require_once __DIR__ . '/includes/security.php';
http_response_code(404);

// Referrer logic
$ref = $_SERVER['HTTP_REFERER'] ?? 'dashboard.php';
// Open Redirect Fix: Only allow local URLs
if (!preg_match('#^(https?://)?[^/]*' . preg_quote($_SERVER['HTTP_HOST'] ?? 'localhost', '#') . '/#i', $ref)) {
    $ref = 'dashboard.php';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 // ACCESS_DENIED</title>
    <script src="/vendor/tailwindcss/dist/lib.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
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
    <style>
        body { background-color: #020617; color: #f43f5e; font-family: 'JetBrains Mono', monospace; overflow: hidden; }
        .crt-container { min-height: 100vh; position: relative; background: radial-gradient(circle, rgba(244,63,94,0.05) 0%, rgba(0,0,0,1) 90%); }
        .redacted { background: #f43f5e; color: transparent; user-select: none; border-radius: 2px; padding: 0 4px; margin: 0 2px; }
        .text-glow { text-shadow: 0 0 5px rgba(244,63,94,0.5), 0 0 10px rgba(244,63,94,0.3); }
        .cyber-border { border: 1px solid rgba(244,63,94,0.2); background: rgba(0,0,0,0.8); }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
        .animate-alert { animation: pulse 2s infinite; }
    </style>
</head>
<body class="bg-black text-rose-500">
    <div class="crt-container flex items-center justify-center p-4 text-center">
        <div class="w-full max-w-xl p-8 cyber-border rounded-sm relative">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-black px-4 py-1 text-[10px] font-bold tracking-[0.3em] uppercase border border-rose-500/50">Restricted_Area</div>
            
            <div class="mb-6">
                <h1 class="text-6xl font-bold tracking-tighter mb-2 text-glow">404</h1>
                <p class="text-rose-500/60 uppercase tracking-widest text-xs">Path_Not_Found // Execution_Halted</p>
            </div>

            <div class="space-y-4 mb-8 font-mono text-sm text-left">
                <p class="text-rose-500/40">TRACEBACK_REPORT_0x44F2:</p>
                <p class="leading-relaxed">
                    The requested resource at <span class="redacted">SECRET_LOCATION</span> is currently 
                    <span class="redacted">DELETED_OR_MOVED</span> by order of <span class="redacted">CENTRAL_COMMAND</span>.
                    Attempting further access will result in <span class="text-rose-500 font-bold uppercase tracking-tighter">PERMANENT_LOG_ENTRY</span>.
                </p>
            </div>

            <div class="mt-8">
                <a href="<?php echo htmlspecialchars($ref, ENT_QUOTES); ?>" class="inline-block px-6 py-2 border border-rose-500/50 hover:bg-rose-500/10 transition-all text-xs font-bold tracking-[0.2em] uppercase">
                    [ RETURN_TO_SAFE_ZONE ]
                </a>
            </div>
            
            <div class="mt-8 opacity-20 text-[10px] uppercase tracking-tighter">
                Reference: CID_<?=bin2hex(random_bytes(4))?> // Unauthorized_Access_Detected
            </div>
        </div>
    </div>

</body>
</html>
