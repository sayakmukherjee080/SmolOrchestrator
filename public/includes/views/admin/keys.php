<?php
// includes/views/admin/keys.php
?>
<!-- Row 1: Generate & Result -->
<section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <!-- Col 1: Generate Form -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Generate_Access_Token</h3>
        <form method="post" class="space-y-4">
        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
        <input type="hidden" name="action" value="generate_key">
        
        <div class="space-y-1">
            <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Token_Label</label>
            <input name="label" placeholder="e.g. CLIENT_APP_V1" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm">
        </div>

        <div class="space-y-1">
            <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Target_Endpoint</label>
            <select name="endpoint" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-sm">
                <?php foreach ($data['endpoints'] as $e) echo "<option value='{$e['name']}'>./{$e['name']}</option>"; ?>
            </select>
        </div>
        
        <div class="space-y-1">
            <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Daily_Quota_Override</label>
            <input name="quota" type="number" placeholder="0 = INHERIT_DEFAULT" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm">
        </div>

        <div class="flex justify-end pt-2">
            <button class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-6 py-2 rounded-sm text-xs font-bold tracking-widest uppercase transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                [ Generate_Key ]
            </button>
        </div>
        </form>
    </div>

    <!-- Col 2: Generated Token Display -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 flex flex-col justify-center cyber-corner relative">
        <?php if (!empty($flash['generated_key'])): ?>
        <div class="p-4 bg-emerald-900/10 border border-emerald-500/40 rounded-sm relative overflow-hidden group">
            <div class="absolute top-0 right-0 p-1 opacity-50">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </div>
            <div class="text-[10px] text-emerald-500/70 uppercase tracking-widest mb-2">New_Key_Generated</div>
            <div class="flex gap-2">
                <div id="new-key" class="font-mono text-emerald-300 break-all bg-black/50 p-2 rounded border border-emerald-500/20 flex-1">
                    <?=h($flash['generated_key'])?>
                </div>
                <button id="copy-key-btn" class="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-3 rounded text-[10px] font-bold tracking-wider transition-all">
                    COPY
                </button>
            </div>
            <div class="text-[10px] text-rose-400 mt-2 animate-pulse">WARNING: KEY_VISIBLE_ONCE_ONLY</div>
        </div>
        <script nonce="<?php echo csp_nonce(); ?>">
        document.getElementById('copy-key-btn').addEventListener('click', function() {
            navigator.clipboard.writeText(document.getElementById('new-key').innerText.trim());
            this.innerText = 'COPIED!';
        });
        </script>
        <?php else: ?>
        <div class="h-full flex flex-col items-center justify-center text-emerald-500/20 border-2 border-dashed border-emerald-500/10 rounded-sm p-8">
            <svg class="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-width="1" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            <div class="text-xs font-mono tracking-widest">AWAITING_GENERATION...</div>
        </div>
        <?php endif; ?>
    </div>
</section>

<!-- Row 2: Access Control List -->
<section>
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Access_Control_List</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <?php foreach ($data['keys'] as $k): ?>
            <div class="flex items-center justify-between p-3 bg-black/40 border border-emerald-500/10 rounded-sm hover:border-emerald-500/30 transition-colors">
            <div>
                <div class="font-bold text-emerald-300 text-sm font-mono"><?=h($k['label'] ?? 'UNLABELED_KEY')?></div>
                <div class="text-[10px] font-mono text-emerald-500/50 mt-1">
                    SCOPE: ./<?=h($k['endpoint'])?> <span class="text-emerald-500/30">|</span> 
                    LIMIT: <?= $k['quota'] ? h($k['quota']).'/DAY' : 'INHERIT' ?>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-right">
                    <div class="text-xs font-mono text-emerald-400"><?=h($k['used'])?> REQS</div>
                    <div class="text-[10px] text-emerald-500/30 tracking-widest">USAGE</div>
                </div>
                <?php if ($k['enabled']): ?>
                <form method="post" style="display:inline">
                    <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                    <input type="hidden" name="action" value="revoke_key">
                    <input type="hidden" name="key_id" value="<?php echo $k['id']; ?>">
                    <button class="text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1 rounded-sm font-bold tracking-wider transition-colors">REVOKE</button>
                </form>
                <?php else: ?>
                <div class="flex gap-2 items-center">
                    <div class="text-[10px] bg-slate-800 text-slate-500 border border-slate-700 px-2 py-1 rounded-sm font-bold tracking-wider">REVOKED</div>
                    <form method="post" style="display:inline" onsubmit="return confirm('PERMANENTLY DELETE KEY? This cannot be undone.');">
                        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                        <input type="hidden" name="action" value="delete_key">
                        <input type="hidden" name="key_id" value="<?php echo $k['id']; ?>">
                        <button class="text-[10px] bg-rose-900/10 hover:bg-rose-900/30 text-rose-600 border border-rose-900/30 px-2 py-1 rounded-sm font-bold tracking-wider transition-colors">[DEL]</button>
                    </form>
                </div>
                <?php endif; ?>
            </div>
            </div>
        <?php endforeach; ?>
        </div>
    </div>
</section>
