<section class="space-y-6">
    <!-- Section 1: Endpoint Load Distribution -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2 flex items-center gap-2">
            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Endpoint_Load_Distribution
        </h3>
        <div id="endpoint-usage-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <?php foreach ($data['endpoint_usage'] as $e): $pct = pct($e['used'],$e['quota']); ?>
            <div class="p-4 bg-black/40 border border-emerald-500/10 rounded-sm hover:border-emerald-500/30 transition-colors group" data-endpoint="<?=h($e['name'])?>">
                <div class="flex justify-between text-xs font-mono mb-2">
                    <span class="text-emerald-200 group-hover:text-emerald-100 transition-colors font-bold truncate pr-2"><?=h($e['name'])?></span>
                    <span class="text-emerald-500/60 usage-text whitespace-nowrap"><?=h($e['used'])?> / <?=h($e['quota'])?></span>
                </div>
                <div class="w-full bg-slate-900 h-2 border border-emerald-500/20 rounded-sm overflow-hidden">
                    <div style="width:<?=$pct?>%" class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] transition-all duration-500 progress-bar"></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Section 2: Provider Throughput -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-4 tech-border-b pb-2 flex items-center gap-2">
            <span class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span> Provider_Throughput
        </h3>
        <div id="provider-usage-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <?php foreach ($data['provider_usage'] as $p): 
                $effectiveQuota = $p['quota'] > 0 ? $p['quota'] : $p['endpoint_quota'];
                $pct = pct($p['used'], $effectiveQuota);
            ?>
            <div class="p-4 bg-black/40 border border-cyan-500/10 rounded-sm hover:border-cyan-500/30 transition-colors group" data-key="<?=h($p['endpoint'])?>-<?=h($p['provider'])?>">
                <div class="flex justify-between text-xs font-mono mb-2">
                    <span class="text-cyan-200 group-hover:text-cyan-100 transition-colors font-bold truncate pr-2" title="<?=h($p['endpoint'])?> >> <?=h($p['provider'])?>">
                        <?=h($p['endpoint'])?> <span class="text-cyan-600">>></span> <?=h($p['provider'])?>
                    </span>
                    <span class="text-cyan-500/60 usage-text whitespace-nowrap">
                        <?= $p['quota']==0 ? '<span class="text-[8px] uppercase tracking-wider mr-1">(INHERITED)</span>' : '' ?>
                        <?=h($p['used'])?> / <?= $effectiveQuota==0 ? '∞' : h($effectiveQuota) ?>
                    </span>
                </div>
                <div class="w-full bg-slate-900 h-2 border border-cyan-500/20 rounded-sm overflow-hidden">
                    <div style="width:<?=$pct?>%" class="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-all duration-500 progress-bar"></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<script nonce="<?php echo csp_nonce(); ?>">
async function refreshUsage() {
    try {
        const fd = new FormData();
        fd.append('action', 'get_usage_stats');
        fd.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
        
        const res = await fetch('', { method: 'POST', body: fd });
        const data = await res.json();
        
        // 1. Update Endpoint Usage
        data.endpoint_usage.forEach(e => {
            const el = document.querySelector(`[data-endpoint="${e.name}"]`);
            if (el) {
                const pct = e.quota > 0 ? (e.used / e.quota) * 100 : 0;
                el.querySelector('.usage-text').textContent = `${e.used} / ${e.quota}`;
                el.querySelector('.progress-bar').style.width = `${Math.min(100, pct)}%`;
            }
        });
        
        // 2. Update Provider Usage
        data.provider_usage.forEach(p => {
            const key = `${p.endpoint}-${p.provider}`;
            const el = document.querySelector(`[data-key="${key}"]`);
            if (el) {
                const effectiveQuota = p.quota > 0 ? p.quota : p.endpoint_quota;
                const pct = effectiveQuota > 0 ? (p.used / effectiveQuota) * 100 : 0;
                
                let usageHtml = '';
                if (p.quota == 0) {
                    usageHtml += '<span class="text-[8px] uppercase tracking-wider mr-1">(INHERITED)</span>';
                }
                usageHtml += `${p.used} / ${effectiveQuota == 0 ? '∞' : effectiveQuota}`;
                
                el.querySelector('.usage-text').innerHTML = usageHtml;
                el.querySelector('.progress-bar').style.width = `${Math.min(100, pct)}%`;
            }
        });
        
    } catch (e) {
        console.error('Refresh failed', e);
    }
}

setInterval(refreshUsage, 5000);
</script>
