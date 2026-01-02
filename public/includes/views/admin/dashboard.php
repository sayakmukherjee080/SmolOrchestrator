<?php
// includes/views/admin/dashboard.php
?>
<!-- Row 1: Endpoint Load & Traffic -->
<section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <!-- Endpoints Monitor -->
    <div class="glass p-5 relative overflow-hidden group cyber-corner">
        <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg class="w-16 h-16 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-width="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        </div>
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Endpoint_Load</h3>
        <div class="space-y-4 relative z-10" id="endpoint-load-container">
        <?php foreach ($data['endpoint_usage'] as $ep): $pct = pct($ep['used'],$ep['quota']); ?>
            <div data-endpoint-id="<?= $ep['id'] ?>">
                <div class="flex justify-between text-xs font-mono mb-1">
                    <span class="text-white font-bold"><?=h($ep['name'])?></span>
                    <span class="text-emerald-500/70 usage-text"><?=h($ep['used'])?>/<?=h($ep['quota'])?></span>
                </div>
                <div class="w-full bg-slate-900 h-2 border border-emerald-500/20">
                    <div class="h-full bg-emerald-500 progress-blocks shadow-[0_0_8px_rgba(16,185,129,0.6)] progress-bar" style="width:<?=$pct?>%"></div>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
    </div>

    <!-- Traffic Graph -->
    <div class="glass p-5 relative cyber-corner">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Traffic_Analysis_24h</h3>
        <div class="h-40">
            <canvas id="hourlyChart"></canvas>
        </div>
        <script nonce="<?php echo csp_nonce(); ?>">
        const ctx = document.getElementById('hourlyChart');
        const hourlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [<?php echo implode(',', array_map(fn($i)=>'"'.str_pad((string)$i,2,'0',STR_PAD_LEFT).':00"', range(0,23))); ?>],
                datasets: [{
                    label: 'REQ/HR',
                    data: [<?php echo implode(',', $data['hourly']); ?>],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(16, 185, 129, 0.05)' }, 
                        ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 10 } },
                        border: { display: false }
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { display: false } 
                    }
                }
            }
        });
        </script>
    </div>
</section>

<!-- Row 2: Route Nodes (5 cols) -->
<section class="mb-8">
    <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Route_Nodes</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="route-nodes-container">
        <?php foreach ($globalData['mappings_usage'] as $map): 
            $effectiveQuota = $map['quota'] > 0 ? $map['quota'] : $map['endpoint_quota'];
            $pct = pct($map['used'], $effectiveQuota);
            $isSuspended = !empty($map['suspended_until']) && $map['suspended_until'] > time();
            $statusColor = $isSuspended ? 'text-rose-400' : 'text-emerald-400';
            $borderColor = $isSuspended ? 'border-rose-500/30' : 'border-emerald-500/20';
        ?>
        <div class="glass p-4 relative overflow-hidden group cyber-corner flex flex-col justify-between h-full" data-mapping-id="<?= $map['id'] ?>">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="text-[10px] text-emerald-500/60 uppercase tracking-widest mb-1">ROUTE_NODE</div>
                    <div class="font-bold text-white text-sm flex items-center gap-2">
                        <?=h($map['endpoint_name'])?> 
                        <span class="text-emerald-500">>></span> 
                        <?=h($map['provider_name'])?>
                    </div>
                    <div class="text-[10px] font-mono text-emerald-500/50 mt-1">MODEL: <?=h($map['model'])?></div>
                </div>
                <div class="text-right">
                    <div class="text-xs font-mono status-text <?= $statusColor ?>"><?= $isSuspended ? 'SUSPENDED' : 'ACTIVE' ?></div>
                    <div class="text-[10px] text-emerald-500/40">PRIO: <?=h($map['priority'])?></div>
                </div>
            </div>
            
            <div class="mt-2">
                <div class="flex justify-between text-[10px] font-mono mb-1">
                    <span class="text-emerald-500/60">QUOTA_USAGE <?= $map['quota']==0 ? '(INHERITED)' : '' ?></span>
                    <span class="text-white usage-text"><?=h($map['used'])?> / <?= $effectiveQuota==0 ? '∞' : h($effectiveQuota) ?></span>
                </div>
                <div class="w-full bg-slate-900 h-1.5 border border-container <?= $borderColor ?>">
                    <div class="h-full progress-bar <?= $isSuspended ? 'bg-rose-500' : 'bg-emerald-500' ?> progress-blocks shadow-[0_0_8px_rgba(16,185,129,0.6)]" style="width:<?=$pct?>%"></div>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <div class="text-center mt-4">
        <button id="toggle-routes-btn" class="text-xs font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-widest border border-emerald-500/30 hover:border-emerald-500/60 px-4 py-2 rounded-sm transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-900/20">
            [ SHOW_ALL_NODES ]
        </button>
    </div>
</section>

<!-- Row 3: Data Stream & Health Matrix -->
<section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Live Logs -->
    <div class="glass p-5 cyber-corner">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 flex justify-between items-center tech-border-b pb-2">
            <span>Data_Stream</span>
            <span class="animate-pulse text-[10px] text-emerald-400">● LIVE</span>
        </h3>
        <div class="overflow-auto max-h-64 font-mono text-[10px] space-y-1">
            <table class="w-full text-left border-collapse">
                <thead class="text-emerald-500/50 border-b border-emerald-500/20 sticky top-0 bg-slate-950/90 backdrop-blur">
                    <tr><th class="py-1">TIME</th><th>REQ</th><th>PROV</th><th>STAT</th><th>LAT</th></tr>
                </thead>
                <tbody class="divide-y divide-emerald-500/10" id="live-logs-body">
                <?php foreach ($data['logs'] as $l): 
                    $statusColor = $l['status'] >= 400 ? 'text-rose-500' : 'text-emerald-400';
                ?>
                <tr class="hover:bg-emerald-500/5 transition-colors">
                    <td class="py-1 text-emerald-500/60"><?=h(date('H:i:s',$l['ts']))?></td>
                    <td class="text-white"><?=h($l['endpoint'])?></td>
                    <td class="text-emerald-300"><?=h($l['provider'])?></td>
                    <td class="<?=$statusColor?> font-bold"><?=h($l['status'])?></td>
                    <td class="text-emerald-500/60"><?=h($l['latency_ms'])?>ms</td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Health Matrix -->
    <div class="glass p-5 cyber-corner">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Health_Matrix</h3>
        <div class="grid grid-cols-2 gap-2" id="health-matrix-container">
        <?php foreach ($data['health'] as $h): 
            $rate = $h['total'] ? round(($h['errors'] / $h['total']) * 100, 1) : 0; 
            $isHealthy = $rate < 5;
            $color = $isHealthy ? 'text-emerald-400 border-emerald-500/30' : 'text-rose-400 border-rose-500/30';
            $bg = $isHealthy ? 'bg-emerald-500/5' : 'bg-rose-500/5';
        ?>
            <div class="border <?=$color?> <?=$bg?> p-3 flex justify-between items-center relative overflow-hidden group health-card" data-provider="<?=h($h['provider'])?>">
                <div class="absolute inset-0 bg-current opacity-0 group-hover:opacity-5 transition-opacity"></div>
                <div>
                    <div class="text-xs font-bold text-white"><?=h($h['provider'])?></div>
                    <div class="text-[10px] opacity-60 total-reqs"><?=$h['total']?> REQS</div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold tracking-tighter error-rate"><?=$rate?>%</div>
                    <div class="text-[10px] uppercase tracking-widest opacity-60">ERR</div>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
    </div>
</section>

<script nonce="<?php echo csp_nonce(); ?>">
function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.getHours().toString().padStart(2, '0') + ':' + 
           d.getMinutes().toString().padStart(2, '0') + ':' + 
           d.getSeconds().toString().padStart(2, '0');
}

async function refreshDashboard() {
    try {
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (!csrfMeta) {
            console.error('CSRF token meta tag not found');
            return;
        }
        
        const fd = new FormData();
        fd.append('action', 'get_dashboard_stats');
        fd.append('csrf', csrfMeta.content);
        
        const res = await fetch('', { method: 'POST', body: fd });
        const data = await res.json();
        
        if (data.error) {
            console.error('Dashboard refresh error:', data.error);
            return;
        }
        
        // 1. Update Endpoint Load
        data.endpoint_usage.forEach(ep => {
            const el = document.querySelector(`[data-endpoint-id="${ep.id}"]`);
            if (el) {
                const pct = ep.quota > 0 ? (ep.used / ep.quota * 100) : 0;
                el.querySelector('.progress-bar').style.width = pct + '%';
                const usageText = el.querySelector('.usage-text');
                if (usageText) usageText.textContent = `${ep.used}/${ep.quota}`;
            }
        });

        // 3. Update Live Logs
        const logsBody = document.getElementById('live-logs-body');
        if (logsBody && data.logs) {
            logsBody.innerHTML = data.logs.map(l => {
                const statusColor = l.status >= 400 ? 'text-rose-500' : 'text-emerald-400';
                return `
                <tr class="hover:bg-emerald-500/5 transition-colors">
                    <td class="py-1 text-emerald-500/60">${formatTime(l.ts)}</td>
                    <td class="text-white">${l.endpoint}</td>
                    <td class="text-emerald-300">${l.provider}</td>
                    <td class="${statusColor} font-bold">${l.status}</td>
                    <td class="text-emerald-500/60">${l.latency_ms}ms</td>
                </tr>`;
            }).join('');
        }

        // 4. Update Health Matrix
        data.health.forEach(h => {
            const el = document.querySelector(`[data-provider="${h.provider}"]`);
            if (el) {
                const rate = h.total ? ((h.errors / h.total) * 100).toFixed(1) : 0;
                const isHealthy = rate < 5;
                el.querySelector('.total-reqs').textContent = `${h.total} REQS`;
                el.querySelector('.error-rate').textContent = `${rate}%`;
                
                const color = isHealthy ? 'text-emerald-400 border-emerald-500/30' : 'text-rose-400 border-rose-500/30';
                const bg = isHealthy ? 'bg-emerald-500/5' : 'bg-rose-500/5';
                el.className = `border ${color} ${bg} p-3 flex justify-between items-center relative overflow-hidden group health-card`;
            }
        });

        // 5. Update Chart
        if (window.hourlyChart) {
            window.hourlyChart.data.datasets[0].data = data.hourly;
            window.hourlyChart.update('none'); // Update without animation for smoothness
        }
        
    } catch (e) {
        console.error('Refresh failed', e);
    }
}

// Polling interval
// Polling interval
setInterval(refreshDashboard, 5000);

// Route Nodes Collapse Logic
const routesGrid = document.getElementById('route-nodes-container');
const toggleBtn = document.getElementById('toggle-routes-btn');
let routesExpanded = false;

function updateRoutesVisibility() {
    if (!routesGrid || !toggleBtn) return;
    
    // Determine items per row based on current grid columns
    // grid-cols-1 md:grid-cols-2 lg:grid-cols-3
    const width = window.innerWidth;
    let itemsPerRow = 1;
    if (width >= 1024) itemsPerRow = 3;      // lg
    else if (width >= 768) itemsPerRow = 2;  // md
    
    const items = Array.from(routesGrid.children);
    
    if (items.length <= itemsPerRow) {
        toggleBtn.classList.add('hidden');
        items.forEach(el => el.classList.remove('hidden'));
        return;
    }
    
    toggleBtn.classList.remove('hidden');
    
    if (routesExpanded) {
        items.forEach(el => el.classList.remove('hidden'));
        toggleBtn.innerText = '[ SHOW_FEWER_NODES ]';
    } else {
        items.forEach((el, index) => {
            if (index < itemsPerRow) el.classList.remove('hidden');
            else el.classList.add('hidden');
        });
        toggleBtn.innerText = '[ SHOW_ALL_NODES ]';
    }
}

toggleBtn.addEventListener('click', () => {
    routesExpanded = !routesExpanded;
    updateRoutesVisibility();
});

window.addEventListener('resize', updateRoutesVisibility);
// Initial run
updateRoutesVisibility();
</script>
