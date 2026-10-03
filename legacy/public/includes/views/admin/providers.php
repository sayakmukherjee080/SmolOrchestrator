<?php
// includes/views/admin/providers.php
?>
<section class="space-y-6">
    <!-- Row 1: Add Provider Form -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Initialize_Provider</h3>
        <form method="post" id="add-provider-form">
        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
        <input type="hidden" name="action" value="add_provider">
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div class="space-y-1">
                <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Provider_ID</label>
                <input name="name" id="prov-name" placeholder="e.g. OPENAI_MAIN" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" required>
            </div>
            
            <div class="space-y-1">
                <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Base_Endpoint</label>
                <input name="base_url" id="prov-url" placeholder="https://api.openai.com/v1" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" required>
            </div>
            
            <div class="space-y-1 relative">
                <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Auth_Key</label>
                <div class="flex gap-2">
                    <input name="api_key" id="prov-key" placeholder="sk-..." class="flex-1 p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" required>
                    <button type="button" id="add-provider-btn" class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-4 py-2 rounded-sm text-xs font-bold tracking-widest uppercase transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] whitespace-nowrap">
                        [ ADD ]
                    </button>
                </div>
            </div>
        </div>
        </form>
        <script nonce="<?php echo csp_nonce(); ?>">
        document.getElementById('add-provider-btn').addEventListener('click', addProvider);
        
        async function addProvider() {
            const url = document.getElementById('prov-url').value;
            const key = document.getElementById('prov-key').value;
            const name = document.getElementById('prov-name').value;
            
            if(!name || !url || !key) { alert('ERR: MISSING_FIELDS'); return; }
            
            const btn = event.target;
            const orig = btn.textContent;
            btn.textContent = '...';
            btn.disabled = true;
            
            try {
                const fd = new FormData();
                fd.append('action', 'test_connection');
                fd.append('base_url', url);
                fd.append('api_key', key);
                fd.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
                
                const res = await fetch('', { method: 'POST', body: fd });
                const json = await res.json();
                
                if(json.success) {
                    document.getElementById('add-provider-form').submit();
                } else {
                    alert('LINK_FAILURE:\n' + (json.error || 'UNKNOWN') + '\n\nABORTING_SAVE');
                    btn.textContent = orig;
                    btn.disabled = false;
                }
            } catch(e) {
                alert('NET_ERR');
                btn.textContent = orig;
                btn.disabled = false;
            }
        }
        </script>
    </div>

    <!-- Row 2: Provider List (Grid) -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Active_Nodes</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($data['providers'] as $p): ?>
            <div class="p-3 bg-black/40 border border-emerald-500/10 rounded-sm hover:border-emerald-500/30 transition-colors group flex flex-col justify-between h-full">
                <div class="mb-2">
                    <div class="flex items-center justify-between mb-1">
                        <div class="font-bold text-emerald-300 text-sm truncate" id="name-display-<?= $p['id'] ?>"><?=h($p['name'])?></div>
                        <input type="text" id="name-input-<?= $p['id'] ?>" value="<?=h($p['name'])?>" class="hidden w-24 bg-black/50 border border-emerald-500/30 text-emerald-400 text-xs p-1 rounded-sm focus:outline-none focus:border-emerald-500">
                        
                        <div class="flex gap-1">
                            <button id="edit-btn-<?= $p['id'] ?>" data-id="<?= $p['id'] ?>" class="edit-name-btn opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-emerald-500/50 hover:text-emerald-400">[EDT]</button>
                            <button id="save-btn-<?= $p['id'] ?>" data-id="<?= $p['id'] ?>" class="save-name-btn hidden text-[10px] text-emerald-500 hover:text-emerald-400">[SAV]</button>
                        </div>
                    </div>
                    <div class="text-[10px] font-mono text-emerald-500/50 truncate" title="<?=h($p['base_url'])?>"><?=h($p['base_url'])?></div>
                </div>
                
                <div class="flex justify-between items-center pt-2 border-t border-emerald-500/10 mt-2">
                    <form method="post" onsubmit="return confirm('CAUTION: PERMANENT_REMOVAL. Deleting this provider will cascade and remove all its model mappings. Continue?')">
                        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                        <input type="hidden" name="action" value="delete_provider">
                        <input type="hidden" name="provider_id" value="<?php echo $p['id']; ?>">
                        <button type="submit" class="text-[10px] text-rose-500/50 hover:text-rose-400 transition-colors uppercase tracking-wider font-bold">[DEL]</button>
                    </form>

                    <form method="post">
                        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                        <input type="hidden" name="action" value="toggle_provider">
                        <input type="hidden" name="provider_id" value="<?php echo $p['id']; ?>">
                        <button class="text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-wider border transition-all <?php echo $p['enabled'] ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-rose-500/50 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20' ?>">
                            <?php echo $p['enabled'] ? 'ON' : 'OFF'; ?>
                        </button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
        <script nonce="<?php echo csp_nonce(); ?>">
        // Event listeners for edit/save buttons
        document.querySelectorAll('.edit-name-btn').forEach(btn => {
            btn.addEventListener('click', () => toggleEdit(btn.dataset.id));
        });
        document.querySelectorAll('.save-name-btn').forEach(btn => {
            btn.addEventListener('click', () => saveName(btn.dataset.id));
        });
        
        function toggleEdit(id) {
            document.getElementById('name-display-'+id).classList.toggle('hidden');
            document.getElementById('name-input-'+id).classList.toggle('hidden');
            document.getElementById('edit-btn-'+id).classList.toggle('hidden');
            document.getElementById('save-btn-'+id).classList.toggle('hidden');
        }
        
        async function saveName(id) {
            const newName = document.getElementById('name-input-'+id).value;
            if(!newName) return;
            
            const fd = new FormData();
            fd.append('action', 'update_provider');
            fd.append('provider_id', id);
            fd.append('name', newName);
            fd.append('csrf', '<?php echo csrf_token(); ?>');
            
            // Reload to show flash message or just update UI?
            // Simple reload ensures flash message is shown
            const res = await fetch('', { method: 'POST', body: fd });
            window.location.reload();
        }
        </script>
    </div>
</section>
