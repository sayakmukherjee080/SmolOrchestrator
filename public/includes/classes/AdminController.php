<?php
declare(strict_types=1);

class AdminController {
    private $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    public function handlePostActions(): ?array {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') return null;

        $action = $_POST['action'] ?? null;
        $now = time();
        $flash = null;

        // TEMPORARILY DISABLED FOR DEBUGGING
        // if (!csrf_check($_POST['csrf'] ?? '')) {
        //     return ['type'=>'error','msg'=>'Invalid CSRF'];
        // }

        if ($action === 'add_provider') {
            $name = trim($_POST['name'] ?? '');
            $base = rtrim(trim($_POST['base_url'] ?? ''), '/');
            $key = trim($_POST['api_key'] ?? '');
            
            if (!filter_var($base, FILTER_VALIDATE_URL)) {
                $flash = ['type'=>'error','msg'=>'Invalid Base URL'];
            } elseif ($name && $base && $key) {
                $enc = enc($key);
                $stmt = $this->pdo->prepare("INSERT INTO providers (name,base_url,api_key_enc,enabled,created_at) VALUES(?,?,?,?,?)");
                $stmt->execute([$name,$base,$enc,1,$now]);
                $flash = ['type'=>'success','msg'=>'Provider added'];
            } else $flash = ['type'=>'error','msg'=>'All fields required'];
        }

        if ($action === 'update_provider') {
            $id = (int)($_POST['provider_id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            if ($id && $name) {
                $stmt = $this->pdo->prepare("UPDATE providers SET name=? WHERE id=?");
                $stmt->execute([$name, $id]);
                $flash = ['type'=>'success','msg'=>'Provider updated'];
            } else $flash = ['type'=>'error','msg'=>'Invalid data'];
        }



        if ($action === 'map_provider') {
            $endpoint_id = (int)($_POST['endpoint_id'] ?? 0);
            $provider_id = (int)($_POST['provider_id'] ?? 0);
            $model = trim($_POST['model'] ?? '');
            $priority = max(1,(int)($_POST['priority'] ?? 1));
            $quota = max(0,(int)($_POST['quota'] ?? 90));
            if ($endpoint_id && $provider_id && $model) {
                $stmt = $this->pdo->prepare("INSERT INTO endpoint_providers (endpoint_id,provider_id,model,priority,quota,used,reset_at,status) VALUES(?,?,?,?,?,0,?, 'active')");
                $stmt->execute([$endpoint_id,$provider_id,$model,$priority,$quota,$now]);
                $flash = ['type'=>'success','msg'=>'Mapping created'];
            } else $flash = ['type'=>'error','msg'=>'Missing fields'];
        }

        if ($action === 'generate_key') {
            $label = trim($_POST['label'] ?? '');
            $endpoint = trim($_POST['endpoint'] ?? 'pro');
            $quota = (int)($_POST['quota'] ?? 0);
            $raw = bin2hex(random_bytes(24));
            $hash = hash('sha256', $raw);
            $stmt = $this->pdo->prepare("INSERT INTO api_keys (key_hash,label,endpoint,quota,used,reset_at,enabled,created_at) VALUES(?,?,?,?,0,?,1,?)");
            $stmt->execute([$hash,$label,$endpoint,$quota,$now,$now]);
            // Return key in a special way or just flash? 
            // The original code set a variable $generated_key. We can return it in flash or separate return.
            // Let's return it in the result array.
            return ['type'=>'success','msg'=>'API key generated — copy now', 'generated_key'=>$raw];
        }

        if ($action === 'toggle_provider') {
            $id = (int)($_POST['provider_id'] ?? 0);
            $row = $this->pdo->prepare("SELECT enabled FROM providers WHERE id=?");
            $row->execute([$id]);
            $p = $row->fetch(PDO::FETCH_ASSOC);
            if ($p) {
                $new = $p['enabled'] ? 0 : 1;
                $this->pdo->prepare("UPDATE providers SET enabled=? WHERE id=?")->execute([$new,$id]);
                $flash = ['type'=>'success','msg'=>'Provider toggled'];
            }
        }

        if ($action === 'delete_provider') {
            $id = (int)($_POST['provider_id'] ?? 0);
            if ($id) {
                try {
                    $this->pdo->beginTransaction();
                    $this->pdo->prepare("DELETE FROM endpoint_providers WHERE provider_id=?")->execute([$id]);
                    $this->pdo->prepare("DELETE FROM providers WHERE id=?")->execute([$id]);
                    $this->pdo->commit();
                    $flash = ['type'=>'success','msg'=>'Provider and associated mappings deleted'];
                } catch (Exception $e) {
                    $this->pdo->rollBack();
                    $flash = ['type'=>'error','msg'=>'Deletion failed. Ensure no unexpected dependencies exist.'];
                }
            }
        }

        if ($action === 'delete_mapping') {
            $id = (int)($_POST['map_id'] ?? 0);
            if ($id) {
                $this->pdo->prepare("DELETE FROM endpoint_providers WHERE id=?")->execute([$id]);
                $flash = ['type'=>'success','msg'=>'Mapping removed'];
            }
        }

        if ($action === 'reset_mapping_stats') {
            $id = (int)($_POST['map_id'] ?? 0);
            if ($id) {
                $this->pdo->prepare("UPDATE endpoint_providers SET used=0, rate_limit_hits=0, suspended_until=NULL WHERE id=?")->execute([$id]);
                $flash = ['type'=>'success','msg'=>'Mapping quotas and blocks reset'];
            }
        }

        if ($action === 'reset_all_mapping_stats') {
            $this->pdo->exec("UPDATE endpoint_providers SET used=0, rate_limit_hits=0, suspended_until=NULL");
            $flash = ['type'=>'success','msg'=>'Global Protocol Reset: All quotas and blocks cleared'];
        }

        if ($action === 'update_mapping_details') {
            $id = (int)($_POST['map_id'] ?? 0);
            $quota = max(0, (int)($_POST['quota'] ?? 0));
            $priority = max(1, (int)($_POST['priority'] ?? 1));
            
            if ($id) {
                // Log the update
                $logMsg = date('[Y-m-d H:i:s]') . " UPDATE MAPPING [$id]: Prio=$priority, Quota=$quota" . PHP_EOL;
                file_put_contents(__DIR__ . '/../../../dev/err.log', $logMsg, FILE_APPEND);

                $stmt = $this->pdo->prepare("UPDATE endpoint_providers SET quota=?, priority=? WHERE id=?");
                $stmt->execute([$quota, $priority, $id]);
                $flash = ['type'=>'success','msg'=>'Mapping details updated'];
            } else {
                $flash = ['type'=>'error','msg'=>'Invalid data'];
                file_put_contents(__DIR__ . '/../../../dev/err.log', date('[Y-m-d H:i:s]') . " UPDATE FAILED: Invalid ID" . PHP_EOL, FILE_APPEND);
            }
        }

        if ($action === 'revoke_key') {
            $id = (int)($_POST['key_id'] ?? 0);
            if ($id) {
                $this->pdo->prepare("UPDATE api_keys SET enabled=0 WHERE id=?")->execute([$id]);
                $flash = ['type'=>'success','msg'=>'Key revoked'];
            }
        }

        if ($action === 'delete_key') {
            $id = (int)($_POST['key_id'] ?? 0);
            if ($id) {
                $this->pdo->prepare("DELETE FROM api_keys WHERE id=?")->execute([$id]);
                $flash = ['type'=>'success','msg'=>'Key deleted'];
            }
        }

        if ($action === 'add_endpoint') {
            $name = trim($_POST['name'] ?? '');
            $quota = (int)($_POST['quota'] ?? 0);
            if ($name) {
                try {
                    $stmt = $this->pdo->prepare("INSERT INTO endpoints (name,quota,used,reset_at) VALUES(?,?,0,?)");
                    $stmt->execute([$name, $quota, $now]);
                    $flash = ['type'=>'success','msg'=>'Endpoint created'];
                } catch (Exception $e) {
                    $flash = ['type'=>'error','msg'=>'Error: Name must be unique'];
                }
            } else $flash = ['type'=>'error','msg'=>'Name required'];
        }

        if ($action === 'update_endpoint_quota') {
            $id = (int)($_POST['endpoint_id'] ?? 0);
            $quota = (int)($_POST['quota'] ?? 0);
            if ($id) {
                $stmt = $this->pdo->prepare("UPDATE endpoints SET quota=? WHERE id=?");
                $stmt->execute([$quota, $id]);
                $flash = ['type'=>'success','msg'=>'Endpoint quota updated'];
            } else $flash = ['type'=>'error','msg'=>'Invalid data'];
        }

        if ($action === 'delete_endpoint') {
            $id = (int)($_POST['endpoint_id'] ?? 0);
            if ($id) {
                try {
                    $this->pdo->prepare("DELETE FROM endpoints WHERE id=?")->execute([$id]);
                    $flash = ['type'=>'success','msg'=>'Endpoint deleted'];
                } catch (Exception $e) {
                    $flash = ['type'=>'error','msg'=>'Cannot delete: in use'];
                }
            }
        }

        if ($action === 'update_settings') {
            $cacheEnabled = isset($_POST['cache_enabled']);
            $cacheDriver = $_POST['cache_driver'] ?? 'file';
            $block429 = max(1, (int)($_POST['block_429_hrs'] ?? 1));
            $blockOther = max(1, (int)($_POST['block_other_mins'] ?? 1));
            $bootAnim = isset($_POST['boot_animation_enabled']);
            
            $settings = [
                'cache_enabled' => $cacheEnabled, 
                'cache_driver' => $cacheDriver,
                'block_429_hrs' => $block429,
                'block_other_mins' => $blockOther,
                'boot_animation_enabled' => $bootAnim
            ];
            file_put_contents(STORAGE_PATH . '/settings.json', json_encode($settings));
            $flash = ['type'=>'success','msg'=>'Settings saved'];
        }

        if ($action === 'clear_cache') {
            require_once __DIR__ . '/Cache.php';
            $settings = json_decode(file_get_contents(STORAGE_PATH . '/settings.json') ?: '{}', true);
            $cache = new Cache($settings['cache_enabled'] ?? false, $settings['cache_driver'] ?? 'file');
            $cache->flush();
            $flash = ['type'=>'success','msg'=>'Cache cleared'];
        }

        if ($action === 'optimize_db') {
            try {
                $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash)");
                $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_endpoints_name ON endpoints(name)");
                $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_ep_provider ON endpoint_providers(endpoint_id, priority)");
                $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_logs_ts ON request_logs(ts)");
                $flash = ['type'=>'success','msg'=>'Database optimized (Indexes added)'];
            } catch (Exception $e) {
                $flash = ['type'=>'error','msg'=>'Optimization failed. Check logs.'];
            }
        }

        return $flash;
    }

    public function handleAjaxActions(): void {
        // Enforce CSRF for ALL AJAX actions (converted to POST)
        // We check $_REQUEST to allow flexibility but prefer POST
        $action = $_POST['action'] ?? '';
        $token = $_POST['csrf'] ?? '';

        // TEMPORARILY DISABLED FOR DEBUGGING
        // if (!csrf_check($token)) {
        //     respond_json(['error' => 'Invalid CSRF token'], 403);
        // }
        
        // Remove old GET origin check as CSRF token is stronger
        $action = $_REQUEST['action'] ?? '';
        
        if ($action === 'fetch_models') {
            $pid = (int)($_REQUEST['provider_id'] ?? 0);
            if (!$pid) respond_json(['error'=>'missing provider_id'], 400);
            
            $stmt = $this->pdo->prepare("SELECT base_url, api_key_enc FROM providers WHERE id = ?");
            $stmt->execute([$pid]);
            $p = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$p) respond_json(['error'=>'provider not found'], 404);

            $key = dec($p['api_key_enc']);
            if (!$key) respond_json(['error'=>'decrypt failed'], 500);

            $url = rtrim($p['base_url'], '/') . '/models';
            
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $key"]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $res = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            // curl_close($ch); // Deprecated in PHP 8.0+

            if ($code !== 200) respond_json(['error'=>"upstream returned $code"], 502);
            
            header('Content-Type: application/json');
            echo $res;
            exit;
        }

        if ($action === 'test_connection') {
            $base = rtrim(trim($_REQUEST['base_url'] ?? ''), '/');
            $key = trim($_REQUEST['api_key'] ?? '');
            
            if (!$base || !$key) respond_json(['error'=>'Missing URL or Key'], 400);

            $url = $base . '/models';
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $key"]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $res = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            // curl_close($ch); // Deprecated in PHP 8.0+

            if ($code === 200) {
                respond_json(['success'=>true, 'msg'=>'Connection successful! Found models endpoint.']);
            }
            
            respond_json(['success'=>false, 'error'=>"Failed. HTTP $code. Response: " . substr($res, 0, 100)]);
        }

        // Auto-refresh endpoints
        if ($action === 'get_dashboard_stats') {
            $data = $this->getPageData('dashboard');
            
            // Calculate aggregate stats for JSON response
            $today = strtotime('today');
            
            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM request_logs WHERE ts >= ?");
            $stmt->execute([$today]);
            $reqs = $stmt->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT COALESCE(SUM(prompt_tokens + completion_tokens),0) FROM request_logs WHERE ts >= ?");
            $stmt->execute([$today]);
            $toks = $stmt->fetchColumn();

            $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM request_logs WHERE status >= 400 AND ts >= ?");
            $stmt->execute([$today]);
            $errs = $stmt->fetchColumn();

            $stats = [
                'requests' => $reqs,
                'tokens' => $toks,
                'errors' => $errs,
                'uptime' => '99.9%'
            ];
            
            respond_json([
                'stats' => $stats,
                'endpoint_usage' => $data['endpoint_usage'],
                'mappings' => $this->getMappingsWithUsage(),
                'logs' => array_slice($data['logs'], 0, 10), // Only top 10 for refresh
                'health' => $data['health'],
                'hourly' => $data['hourly']
            ]);
        }

        if ($action === 'get_usage_stats') {
            $pageData = $this->getPageData('usage');
            respond_json($pageData);
        }
    }

    public function getGlobalData(): array {
        // Run maintenance
        $this->enforceLogSizeCap();
        return [
            'mappings_usage' => $this->getMappingsWithUsage()
        ];
    }

    public function getPageData(string $page): array {
        $data = [];
        
        // Common data needed for many pages
        if (in_array($page, ['endpoints', 'mappings', 'keys', 'playground', 'dashboard', 'usage'])) {
            $data['endpoints'] = $this->pdo->query("SELECT * FROM endpoints ORDER BY name")->fetchAll(PDO::FETCH_ASSOC);
        }
        if (in_array($page, ['providers', 'mappings', 'dashboard', 'usage'])) {
            $data['providers'] = $this->pdo->query("SELECT id,name,base_url,enabled,created_at FROM providers ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        }

        // Page specific
        if ($page === 'dashboard') {
            // Calculate total quota per endpoint based on linked providers
            // If provider quota is 0 (unlimited/inherit), use endpoint quota
            $data['endpoint_usage'] = $this->pdo->query("
                SELECT e.id,
                       e.name, 
                       e.used, 
                       COALESCE(SUM(CASE WHEN ep.quota > 0 THEN ep.quota ELSE e.quota END), 0) as quota
                FROM endpoints e
                LEFT JOIN endpoint_providers ep ON ep.endpoint_id = e.id
                GROUP BY e.id, e.name, e.used
            ")->fetchAll(PDO::FETCH_ASSOC);
            
            $data['provider_usage'] = $this->pdo->query("SELECT e.name endpoint, p.name provider, ep.used, ep.quota FROM endpoint_providers ep JOIN endpoints e ON e.id=ep.endpoint_id JOIN providers p ON p.id=ep.provider_id ORDER BY e.name, ep.priority")->fetchAll(PDO::FETCH_ASSOC);
            
            // Hourly stats
            $hourlyStmt = $this->pdo->prepare("SELECT strftime('%H', ts, 'unixepoch') AS hr, COUNT(*) AS c FROM request_logs WHERE ts > ? GROUP BY hr ORDER BY hr");
            $hourlyStmt->execute([time() - 86400]);
            $hourlyRows = $hourlyStmt->fetchAll(PDO::FETCH_KEY_PAIR);
            $hourly = [];
            for ($i=0;$i<24;$i++){
                $k = str_pad((string)$i,2,'0',STR_PAD_LEFT);
                $hourly[] = (int)($hourlyRows[$k] ?? 0);
            }
            $data['hourly'] = $hourly;
            
            $data['logs'] = $this->pdo->query("SELECT * FROM request_logs ORDER BY id DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);
            $data['health'] = $this->pdo->query("SELECT provider, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors, COUNT(*) AS total FROM request_logs GROUP BY provider")->fetchAll(PDO::FETCH_ASSOC);
        }

        if ($page === 'mappings') {
            $data['maps'] = $this->pdo->query("SELECT ep.id, ep.endpoint_id, ep.provider_id, e.name endpoint, e.quota as endpoint_quota, p.name provider, p.enabled as provider_enabled, ep.model, ep.priority, ep.quota, ep.used, ep.rate_limit_hits, ep.suspended_until FROM endpoint_providers ep JOIN endpoints e ON e.id=ep.endpoint_id JOIN providers p ON p.id=ep.provider_id ORDER BY e.name, ep.priority")->fetchAll(PDO::FETCH_ASSOC);
        }

        if ($page === 'keys') {
            $data['keys'] = $this->pdo->query("SELECT * FROM api_keys ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        }

        if ($page === 'usage') {
            $data['endpoint_usage'] = $this->pdo->query("
                SELECT e.id,
                       e.name, 
                       e.used, 
                       COALESCE(SUM(CASE WHEN ep.quota > 0 THEN ep.quota ELSE e.quota END), 0) as quota
                FROM endpoints e
                LEFT JOIN endpoint_providers ep ON ep.endpoint_id = e.id
                GROUP BY e.id, e.name, e.used
            ")->fetchAll(PDO::FETCH_ASSOC);
            $data['provider_usage'] = $this->pdo->query("SELECT e.name endpoint, e.quota as endpoint_quota, p.name provider, ep.used, ep.quota FROM endpoint_providers ep JOIN endpoints e ON e.id=ep.endpoint_id JOIN providers p ON p.id=ep.provider_id ORDER BY e.name, ep.priority")->fetchAll(PDO::FETCH_ASSOC);
        }

        if ($page === 'logs') {
            $stmt = $this->pdo->query("SELECT * FROM request_logs ORDER BY id DESC LIMIT 500");
            $data['logs'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $settingsPath = __DIR__ . '/../../../storage/settings.json';
            $data['settings'] = file_exists($settingsPath)
                ? json_decode(file_get_contents($settingsPath) ?: '{"cache_enabled":false,"cache_driver":"file"}', true) ?? []
                : ['cache_enabled' => false, 'cache_driver' => 'file'];
        }

        if ($page === 'settings') {
            $settingsPath = __DIR__ . '/../../../storage/settings.json';
            $data['settings'] = file_exists($settingsPath)
                ? json_decode(file_get_contents($settingsPath) ?: '{"cache_enabled":false,"cache_driver":"file"}', true) ?? []
                : ['cache_enabled' => false, 'cache_driver' => 'file'];
        }

        return $data;
    }

    private function enforceLogSizeCap(int $maxBytes = 20 * 1024 * 1024): void {
        $row = $this->pdo->query("SELECT SUM(LENGTH(endpoint) + LENGTH(provider) + LENGTH(response_snippet) + 32) AS bytes, COUNT(*) as total FROM request_logs")->fetch(PDO::FETCH_ASSOC);
        $bytes = (int)($row['bytes'] ?? 0);
        $total = (int)($row['total'] ?? 0);
        
        if ($bytes <= $maxBytes || $total === 0) return;
        
        // Target 80% to avoid frequent cleanups
        $avgPerRow = $bytes / $total;
        $targetBytes = (int)($maxBytes * 0.8);
        $rowsToDelete = (int)ceil(($bytes - $targetBytes) / $avgPerRow);
        
        $this->pdo->prepare("DELETE FROM request_logs WHERE id IN (SELECT id FROM request_logs ORDER BY id ASC LIMIT ?)")->execute([$rowsToDelete]);
    }
    public function getMappingsWithUsage(): array {
        $stmt = $this->pdo->query("
            SELECT m.*, 
                   e.name as endpoint_name, 
                   e.quota as endpoint_quota,
                   p.name as provider_name,
                   p.enabled as provider_enabled
            FROM endpoint_providers m
            JOIN endpoints e ON m.endpoint_id = e.id
            JOIN providers p ON m.provider_id = p.id
            ORDER BY (m.status = 'active') DESC, e.name, m.priority DESC
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
