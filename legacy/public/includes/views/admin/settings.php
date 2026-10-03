<?php
// includes/views/admin/settings.php
$s = $data['settings'] ?? [];
?>
<section class="space-y-6">
    <!-- General Settings -->
    <div class="glass p-6 rounded-sm border border-emerald-500/20 relative overflow-hidden group cyber-corner">
        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg class="w-24 h-24 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-width="1" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="square" stroke-width="1" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </div>

        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-6 tech-border-b pb-2">System_Configuration</h3>
        
        <form method="post" class="space-y-6 relative z-10">
            <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
            <input type="hidden" name="action" value="update_settings">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Caching -->
                <div>
                    <h4 class="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-4">Performance_Caching</h4>
                    
                    <div class="flex items-center gap-3 mb-4">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" name="cache_enabled" class="sr-only peer" <?= ($s['cache_enabled']??false) ? 'checked' : '' ?>>
                            <div class="w-11 h-6 bg-slate-800 peer-focus:outline-none border border-emerald-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-emerald-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-900/50"></div>
                            <span class="ml-3 text-xs font-mono text-emerald-300 uppercase">Enable_Cache</span>
                        </label>
                    </div>

                    <div class="flex items-center gap-3 mb-4">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" name="boot_animation_enabled" class="sr-only peer" <?= ($s['boot_animation_enabled']??false) ? 'checked' : '' ?>>
                            <div class="w-11 h-6 bg-slate-800 peer-focus:outline-none border border-emerald-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-emerald-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-900/50"></div>
                            <span class="ml-3 text-xs font-mono text-emerald-300 uppercase">Enable_Boot_Anim</span>
                        </label>
                    </div>

                    <div class="space-y-4">
                        <div class="space-y-2">
                            <label class="text-[10px] text-emerald-500/50 uppercase tracking-wider">Cache_Driver</label>
                            <?php 
                            $apcuAvailable = function_exists('apcu_fetch') && ini_get('apc.enabled');
                            ?>
                            <select name="cache_driver" class="w-full bg-black/50 border border-emerald-500/30 text-emerald-400 text-xs p-2 rounded-sm focus:outline-none focus:border-emerald-500 font-mono">
                                <option value="file" <?= ($s['cache_driver']??'file')==='file'?'selected':'' ?>>FILE_SYSTEM (storage/cache)</option>
                                <?php if ($apcuAvailable): ?>
                                    <option value="apcu" <?= ($s['cache_driver']??'file')==='apcu'?'selected':'' ?>>APCu (Memory)</option>
                                <?php else: ?>
                                    <option value="apcu" disabled>APCu (Not Installed)</option>
                                <?php endif; ?>
                            </select>
                            <?php if (!$apcuAvailable): ?>
                                <div class="text-[10px] text-rose-400/80 font-mono mt-1 border-l-2 border-rose-500 pl-2">
                                    [WARN] APCu extension missing. Install php-pecl-apcu for memory caching.
                                </div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>

                <!-- Error Handling -->
                <div>
                    <h4 class="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-4">Error_Management</h4>
                    <div class="space-y-4">
                        <div class="space-y-1">
                            <label class="text-[10px] text-emerald-500/50 uppercase tracking-wider">429_Block_Duration (Hours)</label>
                            <input type="number" name="block_429_hrs" value="<?=h((string)($s['block_429_hrs']??1))?>" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-xs" min="1">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[10px] text-emerald-500/50 uppercase tracking-wider">Other_Errors_Block (Minutes)</label>
                            <input type="number" name="block_other_mins" value="<?=h((string)($s['block_other_mins']??1))?>" class="w-full p-2 bg-black/50 border border-emerald-500/30 rounded-sm text-emerald-400 focus:outline-none focus:border-emerald-400 font-mono text-xs" min="1">
                        </div>
                        <p class="text-[9px] text-emerald-500/40 italic uppercase tracking-tighter">* Other errors include 4xx (Client), 5xx (Server), and cURL Failures.</p>
                    </div>
                </div>

                <!-- Security Info -->
                <div>
                    <h4 class="text-[10px] text-emerald-500/70 uppercase tracking-wider mb-4">Security_Context</h4>
                    <div class="space-y-2 text-xs font-mono text-emerald-500/60">
                        <p>APP_SECRET: <span class="text-emerald-500">********</span> (Stored in storage/app_secret)</p>
                        <p>DB_PATH: <span class="text-emerald-500">storage/app.db</span></p>
                        <p>PHP_VERSION: <span class="text-emerald-500"><?=phpversion()?></span></p>
                    </div>
                </div>
            </div>

            <div class="pt-4 border-t border-emerald-500/10 flex justify-end">
                <button class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-4 py-2 rounded-sm text-xs font-bold tracking-wider transition-all hover:shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                    [ SAVE_CONFIGURATION ]
                </button>
            </div>
        </form>
    </div>

    <!-- Maintenance -->
    <div class="glass p-6 rounded-sm border border-emerald-500/20 relative overflow-hidden cyber-corner">
        <h3 class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-6 tech-border-b pb-2">System_Maintenance</h3>
        
        <div class="space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="text-xs font-bold text-white mb-1">Clear Cache</h4>
                    <p class="text-[10px] text-emerald-500/50">Flush all cached keys, endpoints, and provider maps.</p>
                </div>
                <form method="post">
                    <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                    <input type="hidden" name="action" value="clear_cache">
                    <?php $cacheActive = ($s['cache_enabled'] ?? false); ?>
                    <button <?= !$cacheActive ? 'disabled' : '' ?> class="<?= !$cacheActive ? 'opacity-50 cursor-not-allowed bg-gray-500/10 border-gray-500/30 text-gray-400' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/50 hover:shadow-[0_0_10px_rgba(244,63,94,0.2)]' ?> px-4 py-2 rounded-sm text-xs font-bold tracking-wider transition-all">
                        [ FLUSH_CACHE ]
                    </button>
                </form>
            </div>

            <div class="flex items-center justify-between pt-4 border-t border-emerald-500/10">
                <div>
                    <h4 class="text-xs font-bold text-white mb-1">Database Optimization</h4>
                    <p class="text-[10px] text-emerald-500/50">Add missing indexes and vacuum database.</p>
                </div>
                <form method="post">
                    <input type="hidden" name="csrf" value="<?php echo csrf_token(); ?>">
                    <input type="hidden" name="action" value="optimize_db">
                    <button class="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/50 px-4 py-2 rounded-sm text-xs font-bold tracking-wider transition-all hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                        [ RUN_OPTIMIZER ]
                    </button>
                </form>
            </div>
        </div>
    </div>
</section>
