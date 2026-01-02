<?php
// includes/views/layout/header.php
require_once __DIR__ . '/../../security.php';
apply_security_headers();
?>
<!doctype html>
<html class="h-full bg-slate-950 text-white font-mono selection:bg-emerald-500/30 selection:text-emerald-200" style="background-color: #020617;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf-token" content="<?php echo csrf_token(); ?>">
<script src="vendor/tailwindcss/dist/lib.min.js"></script>
<script src="vendor/chartjs/chart.umd.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<title>SYSTEM // ADMIN</title>
<link rel="icon" type="image/png" href="smolorchestrator_logo.png">
<link rel="stylesheet" href="css/style.css">
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
</head>
<body class="h-full overflow-hidden" style="background-color: #020617 !important;">
<div class="flex h-screen relative">
