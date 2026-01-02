<?php
// includes/views/admin/endpoints.php
?>
<section class="space-y-6">
    <!-- Row 1: Create Endpoint Form -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Create_Endpoint_Alias</h3>
        <form method="post">
        <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
        <input type="hidden" name="action" value="add_endpoint">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div class="space-y-1">
                <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Alias_Name</label>
                <input name="name" placeholder="e.g. gpt-4-turbo" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm" required>
            </div>
            
            <div class="space-y-1 relative">
                <label class="text-[10px] text-emerald-500/70 uppercase tracking-wider">Daily_Quota</label>
                <div class="flex gap-2">
                    <input name="quota" type="number" placeholder="0 = UNLIMITED" class="flex-1 p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 placeholder-emerald-500/20 focus:outline-none focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all font-mono text-sm">
                    <button class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 px-4 py-2 rounded-sm text-xs font-bold tracking-widest uppercase transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] whitespace-nowrap">
                        [ CREATE ]
                    </button>
                </div>
            </div>
        </div>
        </form>
    </div>

    <!-- Row 2: Active Endpoints Grid -->
    <div class="glass p-5 rounded-sm border border-emerald-500/20 cyber-corner relative">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 tech-border-b pb-2">Active_Endpoints</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($data['endpoints'] as $e): ?>
            <div class="p-3 bg-black/40 border border-emerald-500/10 rounded-sm hover:border-emerald-500/30 transition-colors group flex flex-col justify-between h-full">
            <div class="mb-2">
                <div class="font-bold text-emerald-300 text-sm font-mono flex items-center gap-2">
                    ./<?=h($e['name'])?>
                </div>
                <div class="flex items-center gap-2 mt-2 border-t border-emerald-500/10 pt-2">
                    <div class="text-[10px] font-mono text-emerald-500/50 uppercase tracking-tighter">QUOTA:</div>
                    <div class="text-[10px] font-mono text-emerald-400" id="quota-display-<?= $e['id'] ?>"><?=h($e['quota'])?></div>
                    <input type="number" id="quota-input-<?= $e['id'] ?>" value="<?=h($e['quota'])?>" class="hidden w-20 bg-black/50 border border-emerald-500/30 text-emerald-400 text-[10px] p-1 rounded-sm focus:outline-none focus:border-emerald-500 font-mono">
                    
                    <div class="flex-1 text-right">
                        <button id="edit-quota-btn-<?= $e['id'] ?>" data-id="<?= $e['id'] ?>" class="edit-quota-btn opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-emerald-500/50 hover:text-emerald-400">[EDT]</button>
                        <button id="save-quota-btn-<?= $e['id'] ?>" data-id="<?= $e['id'] ?>" class="save-quota-btn hidden text-[10px] text-emerald-500 hover:text-emerald-400">[SAV]</button>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-end gap-2 pt-2">
                <form method="post" style="display:inline">
                <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                <input type="hidden" name="action" value="delete_endpoint">
                <input type="hidden" name="endpoint_id" value="<?php echo $e['id']; ?>">
                <button class="text-[10px] text-rose-500/50 hover:text-rose-400 transition-colors uppercase tracking-wider font-bold">[DEL]</button>
                </form>
            </div>
            </div>
        <?php endforeach; ?>
        </div>

        <script nonce="<?php echo csp_nonce(); ?>">
        // Event listeners for edit/save buttons
        document.querySelectorAll('.edit-quota-btn').forEach(btn => {
            btn.addEventListener('click', () => toggleQuotaEdit(btn.dataset.id));
        });
        document.querySelectorAll('.save-quota-btn').forEach(btn => {
            btn.addEventListener('click', () => saveQuota(btn.dataset.id));
        });
        
        function toggleQuotaEdit(id) {
            document.getElementById('quota-display-'+id).classList.toggle('hidden');
            document.getElementById('quota-input-'+id).classList.toggle('hidden');
            document.getElementById('edit-quota-btn-'+id).classList.toggle('hidden');
            document.getElementById('save-quota-btn-'+id).classList.toggle('hidden');
        }
        
        async function saveQuota(id) {
            const newQuota = document.getElementById('quota-input-'+id).value;
            
            const fd = new FormData();
            fd.append('action', 'update_endpoint_quota');
            fd.append('endpoint_id', id);
            fd.append('quota', newQuota);
            fd.append('csrf', '<?php echo csrf_token(); ?>');
            
            const res = await fetch('', { method: 'POST', body: fd });
            window.location.reload();
        }
        </script>
    </div>
</section>
