<?php
// includes/views/admin/mappings.php
?>
<section>
    <div class="glass p-5 rounded-sm border border-emerald-500/20 mb-6 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Configure_Routing_Protocol</h3>
        <form method="post" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
        <input type="hidden" name="action" value="map_provider">
        
        <label class="block space-y-1">
            <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Source_Alias</span>
            <select name="endpoint_id" id="map-endpoint" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-sm" onchange="updateProviderOptions()">
            <?php foreach ($data['endpoints'] as $e) echo "<option value='{$e['id']}'>".h($e['name'])."</option>"; ?>
            </select>
        </label>

        <label class="block space-y-1">
            <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Target_Provider</span>
            <select name="provider_id" id="map-provider" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-sm" onchange="fetchModels(this.value)">
            <option value="">[ SELECT_NODE ]</option>
            <?php foreach ($data['providers'] as $p) echo "<option value='{$p['id']}'>".h($p['name'])."</option>"; ?>
            </select>
        </label>

        <label class="block lg:col-span-2 space-y-1">
            <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Upstream_Model_ID</span>
            <div class="relative">
            <input name="model" list="provider_models" placeholder="e.g. gpt-4-0613" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 font-mono text-sm" autocomplete="off">
            <datalist id="provider_models"></datalist>
            <div id="model-loading" class="absolute right-2 top-2 text-[10px] text-emerald-500 animate-pulse hidden">SCANNING...</div>
            </div>
        </label>

        <label class="block space-y-1">
            <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Priority_Level</span>
            <input name="priority" type="number" value="1" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-sm">
        </label>

        <label class="block space-y-1">
            <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Allocated_Quota</span>
            <div class="flex items-center gap-2 mb-1">
                <input type="checkbox" id="use-global-quota" checked onchange="toggleQuotaInput()" class="accent-emerald-500 bg-black border-emerald-500/30">
                <span class="text-[10px] text-emerald-500/60">INHERIT_GLOBAL</span>
            </div>
            <input name="quota" id="quota-input" type="number" value="0" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-sm hidden">
        </label>

        <div class="lg:col-span-6 flex justify-end pt-2">
            <button class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-6 py-2 rounded-sm text-xs font-bold tracking-widest uppercase transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                [ Establish_Link ]
            </button>
        </div>
        </form>
        <script nonce="<?php echo csp_nonce(); ?>">
        function toggleQuotaInput() {
            const chk = document.getElementById('use-global-quota');
            const inp = document.getElementById('quota-input');
            if (chk.checked) {
                inp.classList.add('hidden');
                inp.value = 0;
            } else {
                inp.classList.remove('hidden');
                if(inp.value == 0) inp.value = 90;
            }
        }
        toggleQuotaInput();
        const existingMappings = <?php echo json_encode($data['maps']); ?>;
        function updateProviderOptions() {
            const endpointId = parseInt(document.getElementById('map-endpoint').value);
            const providerSelect = document.getElementById('map-provider');
            const options = providerSelect.options;
            // Always show all options to allow multiple models per provider (e.g. fallbacks)
            for (let i = 0; i < options.length; i++) {
                options[i].hidden = false;
                options[i].disabled = false;
            }
        }
        async function fetchModels(pid) {
            if(!pid) return;
            const dl = document.getElementById('provider_models');
            const loader = document.getElementById('model-loading');
            dl.innerHTML = '';
            loader.classList.remove('hidden');
            try {
                const fd = new FormData();
                fd.append('action', 'fetch_models');
                fd.append('provider_id', pid);
                fd.append('csrf', document.querySelector('meta[name="csrf-token"]').content);

                const res = await fetch('', { method: 'POST', body: fd });
                const json = await res.json();
                if(json.data) {
                    json.data.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        dl.appendChild(opt);
                    });
                }
            } catch(e) {} finally { loader.classList.add('hidden'); }
        }

        
        function toggleMappingEdit(id) {
            const display = document.getElementById('quota-display-' + id);
            const edit = document.getElementById('quota-edit-' + id);
            display.classList.toggle('hidden');
            edit.classList.toggle('hidden');
            if(!edit.classList.contains('hidden')) {
                const inp = document.getElementById('quota-input-' + id);
                inp.focus();
                inp.select();
            }
        }

        async function saveMappingQuota(id) {
            const inp = document.getElementById('quota-input-' + id);
            const val = parseInt(inp.value) || 0; // Default to 0 if empty
            
            const fd = new FormData();
            fd.append('action', 'update_mapping_quota');
            fd.append('map_id', id);
            fd.append('quota', val);
            fd.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
            
            // Disable inputs while saving
            inp.disabled = true;
            
            try {
                const res = await fetch('', { method: 'POST', body: fd });
                // Reload to reflect changes as flash message and list update is simplest
                window.location.href = window.location.pathname + window.location.search;
            } catch(e) {
                alert('SAVE_FAILED');
                inp.disabled = false;
            }
        }
        
        updateProviderOptions();

        // Enhanced Inline Editing with Logging
        function toggleMappingEdit(id) {
            console.log(`[UI] Toggling edit mode for mapping ${id}`);
            document.querySelectorAll(`.view-mode-${id}`).forEach(el => el.classList.toggle('hidden'));
            document.querySelectorAll(`.edit-mode-${id}`).forEach(el => el.classList.toggle('hidden'));
        }

        async function saveMappingDetails(id) {
            console.log(`[UI] Attempting save for mapping ${id}`);
            const quotaInput = document.getElementById('quota-input-' + id);
            const prioInput = document.getElementById('prio-input-' + id);
            
            const quotaVal = parseInt(quotaInput.value) || 0;
            const prioVal = parseInt(prioInput.value) || 1;
            
            console.log(`[DATA] New Values - Quota: ${quotaVal}, Priority: ${prioVal}`);

            const fd = new FormData();
            fd.append('action', 'update_mapping_details');
            fd.append('map_id', id);
            fd.append('quota', quotaVal);
            fd.append('priority', prioVal);
            fd.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
            
            try {
                const res = await fetch('', { method: 'POST', body: fd });
                console.log(`[NET] Save request completed for ${id}`);
                window.location.href = window.location.pathname + window.location.search;
            } catch(e) {
                console.error(`[ERR] Save failed for ${id}`, e);
                alert('SAVE_FAILED');
            }
        }

        // Event delegation
        document.body.addEventListener('click', function(e) {
            if(e.target.closest('.edit-trigger')) {
                toggleMappingEdit(e.target.closest('.edit-trigger').dataset.id);
            }
            if(e.target.closest('.save-btn')) {
                saveMappingDetails(e.target.closest('.save-btn').dataset.id);
            }
            if(e.target.closest('.cancel-btn')) {
                toggleMappingEdit(e.target.closest('.cancel-btn').dataset.id);
            }
        });
        </script>
    </div>

    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <div class="flex justify-between items-end mb-4 tech-border-b pb-2">
            <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest">Active_Routes</h3>
            <form method="post" onsubmit="return confirm('WARNING: This will reset quotas and blocks for ALL mappings. Continue?');">
                <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                <input type="hidden" name="action" value="reset_all_mapping_stats">
                <button class="text-[10px] text-amber-500 hover:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-sm border border-amber-500/20 hover:border-amber-500/50 transition-all uppercase tracking-wider font-bold">[ RESET_ALL_PROTOCOLS ]</button>
            </form>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($data['maps'] as $m): 
            $statusBadge = '<span class="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1 rounded-sm tracking-wide">[ACTIVE]</span>';
            
            // Logic for badges
            if ((int)($m['provider_enabled'] ?? 1) === 0) {
                $statusBadge = '<span class="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1 rounded-sm tracking-wide">[DISRUPTED]</span>';
            } elseif ((!empty($m['suspended_until']) && $m['suspended_until'] > time()) || (isset($m['rate_limit_hits']) && (int)$m['rate_limit_hits'] > 0)) {
                $statusBadge = '<span class="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1 rounded-sm tracking-wide">[429 RATE LIMIT]</span>';
            }

            $effectiveQuota = $m['quota'] > 0 ? $m['quota'] : $m['endpoint_quota'];
        ?>
            <div class="flex flex-col gap-3 p-3 bg-black/40 border border-emerald-500/10 rounded-sm hover:border-emerald-500/30 transition-colors group h-full">
                <!-- Row 1: Header + Badges -->
                <div class="flex justify-between items-start">
                    <div class="font-bold text-emerald-300 text-sm font-mono truncate pr-2">
                        <?=h($m['endpoint'])?> <span class="text-emerald-600">>></span> <?=h($m['provider'])?>
                    </div>
                    <div class="flex gap-1 shrink-0">
                        <?=$statusBadge?>
                    </div>
                </div>
                
                <!-- Row 2: Details -->
                <div class="text-[10px] font-mono text-emerald-500/50">
                    MODEL: <span class="text-emerald-400"><?=h($m['model'])?></span>
                </div>

                <!-- Row 3: Data Grid -->
                <div class="grid grid-cols-2 gap-2 bg-black/20 p-2 rounded-sm border border-emerald-500/5 mt-1">
                    <!-- Priority -->
                    <div>
                        <span class="text-[8px] text-emerald-500/40 uppercase tracking-widest block mb-1">Priority</span>
                        <div class="view-mode-<?=$m['id']?> font-mono text-xs text-emerald-400"><?=h($m['priority'])?></div>
                        <input type="number" id="prio-input-<?=$m['id']?>" value="<?=$m['priority']?>" class="edit-mode-<?=$m['id']?> hidden w-full bg-black/50 border border-emerald-500/30 text-emerald-400 text-xs p-1 rounded-sm focus:outline-none focus:border-emerald-500">
                    </div>
                    
                    <!-- Quota -->
                    <div>
                        <span class="text-[8px] text-emerald-500/40 uppercase tracking-widest block mb-1">Quota</span>
                        <div class="view-mode-<?=$m['id']?> font-mono text-xs text-emerald-400">
                            <?=h($m['used'])?> / <?= $effectiveQuota == 0 ? '∞' : h($effectiveQuota) ?>
                            <?php if($m['quota'] == 0): ?><span class="block text-[8px] opacity-50">(GLOBAL)</span><?php endif; ?>
                        </div>
                        <div class="edit-mode-<?=$m['id']?> hidden">
                            <input type="number" id="quota-input-<?=$m['id']?>" value="<?=$m['quota']?>" class="w-full bg-black/50 border border-emerald-500/30 text-emerald-400 text-xs p-1 rounded-sm mb-1 focus:outline-none focus:border-emerald-500">
                            <div class="text-[8px] text-emerald-500/30 italic">0 = GLOBAL</div>
                        </div>
                    </div>
                </div>

                <!-- Row 4: Actions -->
                <div class="flex justify-end pt-2 border-t border-emerald-500/10 mt-auto">
                    <!-- View Mode Actions -->
                    <div class="view-mode-<?=$m['id']?> flex gap-2 w-full justify-between items-center">
                        <div class="text-[10px] text-emerald-500/20">ID: <?=$m['id']?></div>
                        <div class="flex gap-2">
                        <button class="edit-trigger text-[10px] text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-sm border border-emerald-500/20 hover:border-emerald-500/50 transition-all uppercase tracking-wider" data-id="<?=$m['id']?>">[ EDIT ]</button>
                        <form method="post" style="display:inline" onsubmit="return confirm('Reset quotas and blocks for this mapping?');">
                            <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                            <input type="hidden" name="action" value="reset_mapping_stats">
                            <input type="hidden" name="map_id" value="<?php echo $m['id']; ?>">
                            <button class="text-[10px] text-amber-500 hover:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-sm border border-amber-500/20 hover:border-amber-500/50 transition-all uppercase tracking-wider">[ RESET ]</button>
                        </form>
                        <form method="post" style="display:inline">
                                    <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                                    <input type="hidden" name="action" value="delete_mapping">
                                    <input type="hidden" name="map_id" value="<?php echo $m['id']; ?>">
                                    <button class="text-[10px] text-rose-500 hover:text-rose-400 bg-rose-500/10 px-3 py-1 rounded-sm border border-rose-500/20 hover:border-rose-500/50 transition-all uppercase tracking-wider">[ DEL ]</button>
                        </form>
                        </div>
                    </div>

                    <!-- Edit Mode Actions -->
                    <div class="edit-mode-<?=$m['id']?> hidden flex gap-2 w-full justify-end">
                        <button class="save-btn text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-600/20 px-3 py-1 rounded-sm border border-emerald-500/50 hover:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-bold uppercase tracking-wider" data-id="<?=$m['id']?>">[ SAVE ]</button>
                        <button class="cancel-btn text-[10px] text-rose-400 hover:text-rose-300 bg-rose-600/10 px-3 py-1 rounded-sm border border-rose-500/30 transition-all uppercase tracking-wider" data-id="<?=$m['id']?>">[ CANCEL ]</button>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
    </div>
</section>
