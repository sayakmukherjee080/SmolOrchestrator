<?php
// includes/views/admin/logs.php
?>
<section>
    <div class="glass p-1 rounded-sm border border-emerald-500/20">
        <div class="bg-emerald-900/20 p-2 border-b border-emerald-500/20 flex justify-between items-center">
            <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest">System_Logs_Archive</h3>
            <div class="text-[10px] font-mono text-emerald-500/50">Displaying last 500 records</div>
        </div>
        <div class="overflow-auto max-h-[80vh]">
        <table class="w-full text-xs font-mono text-left border-collapse">
            <thead class="text-emerald-500/50 bg-slate-950/90 sticky top-0 z-10">
            <tr>
                <th class="p-3 border-b border-emerald-500/20">TIMESTAMP</th>
                <th class="p-3 border-b border-emerald-500/20">ENDPOINT</th>
                <th class="p-3 border-b border-emerald-500/20">PROVIDER</th>
                <th class="p-3 border-b border-emerald-500/20">STATUS</th>
                <th class="p-3 border-b border-emerald-500/20">LATENCY</th>
                <th class="p-3 border-b border-emerald-500/20">PAYLOAD_SNIPPET</th>
            </tr>
            </thead>
            <tbody class="divide-y divide-emerald-500/10">
            <?php foreach ($data['logs'] as $r): 
                $statusClass = $r['status'] >= 500 ? 'text-rose-500 bg-rose-900/10' : 
                              ($r['status'] >= 400 ? 'text-amber-500 bg-amber-900/10' : 'text-emerald-400 bg-emerald-900/10');
            ?>
            <tr class="hover:bg-white/5 transition-colors group">
                <td class="p-2 text-emerald-500/60 whitespace-nowrap"><?=h(date('Y-m-d H:i:s', $r['ts']))?></td>
                <td class="p-2 text-emerald-200"><?=h($r['endpoint'])?></td>
                <td class="p-2 text-cyan-300"><?=h($r['provider'])?></td>
                <td class="p-2"><span class="px-1.5 py-0.5 rounded-sm font-bold <?=$statusClass?>"><?=h($r['status'])?></span></td>
                <td class="p-2 text-emerald-500/60"><?=h($r['latency_ms'])?>ms</td>
                <td class="p-2 text-emerald-500/40 max-w-xs truncate group-hover:text-emerald-300 transition-colors font-mono text-[10px]"><?=h($r['response_snippet'])?></td>
            </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </div>
</section>
