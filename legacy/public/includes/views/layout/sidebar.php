<?php
// includes/views/layout/sidebar.php
?>
<aside id="sidebar" class="fixed md:static inset-y-0 left-0 w-64 bg-slate-950 border-r border-emerald-500/20 transform -translate-x-full md:translate-x-0 transition-transform duration-300 z-50 flex flex-col">
    <div class="p-6 tech-border-b border-emerald-500/10">
        <div class="flex items-center gap-3 group cursor-default">
            <div class="w-10 h-10 flex items-center justify-center p-1">
                <img src="smolorchestrator_logo.png" alt="Logo" class="w-full h-full object-contain drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">
            </div>
            <div>
                <div class="font-bold tracking-widest text-white text-sm group-hover:text-emerald-400 transition-colors">SmolOrchestrator</div>
                <div class="text-[10px] text-emerald-500/60 tracking-[0.2em]">ONLINE</div>
            </div>
        </div>
    </div>

    <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
        <div class="text-xs text-emerald-500/60 font-bold mb-2 px-2 uppercase tracking-widest">Directory</div>
        <?php
        $nav = [
            'dashboard' => 'STATUS_MONITOR',
            'endpoints' => 'ENDPOINTS',
            'providers' => 'PROVIDERS',
            'mappings'  => 'ROUTING_MAP',
            'keys'      => 'ACCESS_KEYS',
            'usage'     => 'METRICS',
            'logs'      => 'DATA_LOGS',
            'playground'=> 'TERMINAL',
            'settings'  => 'SYSTEM_CONFIG'
        ];
        foreach ($nav as $k => $label) {
            $isActive = ($page === $k);
            $baseClasses = "block px-3 py-2 text-xs font-bold tracking-wide transition-all duration-200 relative overflow-hidden";
            
        if ($isActive) {
                // Active: skew, glow, color change
                $classes = "$baseClasses menu-item-active"; 
                $icon = '> '; // Classic terminal prompt
            } else {
                // Inactive: simple transition, glitch on hover
                $classes = "$baseClasses glitch-hover text-slate-300 hover:bg-emerald-500/10 hover:border-r hover:border-emerald-500/50";
                $icon = '  ';
            }
            
            echo "<a class='$classes' href='$k.php'>";
            echo "<span>$icon$label</span>"; // Wrap clear for counter-skew
            echo "</a>";
        }
        ?>
    </nav>

    <div class="p-4 tech-border-b border-emerald-500/10 border-t-0 border-b-0 border-t-[1px]">
        <a href="logout.php" class="block w-full text-center py-2 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 text-xs font-bold tracking-widest transition-colors cyber-corner">
            [ TERMINATE_SESSION ]
        </a>
    </div>
</aside>
<!-- Overlay for mobile -->
<div class="md:hidden fixed inset-0 bg-black/80 z-40 backdrop-blur-sm transition-opacity opacity-0 pointer-events-none" id="sidebar-overlay"></div>
<script nonce="<?php echo csp_nonce(); ?>">
    // Mobile overlay click handler
    document.getElementById('sidebar-overlay').addEventListener('click', function() {
        document.getElementById('sidebar').classList.add('-translate-x-full');
    });
    
    // Simple logic to show overlay when sidebar is open on mobile
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const observer = new MutationObserver((mutations) => {
        if (!sb.classList.contains('-translate-x-full')) {
            ov.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            ov.classList.add('opacity-0', 'pointer-events-none');
        }
    });
    observer.observe(sb, { attributes: true, attributeFilter: ['class'] });
</script>
