<?php
declare(strict_types=1);

require_once __DIR__ . '/Cache.php';
require_once __DIR__ . '/RateLimiter.php';

class Gateway {
    private PDO $pdo;
    private Cache $cache;
    private array $settings;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
        $settingsPath = STORAGE_PATH . '/settings.json';
        $this->settings = file_exists($settingsPath) 
            ? json_decode(file_get_contents($settingsPath) ?: '{}', true) ?? []
            : [];
        $this->cache = new Cache($this->settings['cache_enabled'] ?? false, $this->settings['cache_driver'] ?? 'file');
    }

    public function handleRequest() {
        $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($requestUri, PHP_URL_PATH) ?: '/';

        // Handle Sub-directory installations
        // We detect the base directory from SCRIPT_NAME (e.g., /smol/index.php -> /smol)
        $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
        $baseDir = dirname($scriptName);
        
        // Normalize baseDir to empty string if it's just the root
        if ($baseDir === DIRECTORY_SEPARATOR || $baseDir === '.') {
            $baseDir = '';
        }
        
        // Strip baseDir from path if it matches
        if ($baseDir !== '' && strpos($path, $baseDir) === 0) {
            $path = substr($path, strlen($baseDir));
        }

        // Normalize: Ensure leading slash and remove trailing slash (except for /)
        $path = '/' . ltrim($path, '/');
        $normalizedPath = ($path !== '/') ? rtrim($path, '/') : $path;

        if ($normalizedPath === '/v1/models') {
            $this->handleModels();
        } elseif ($normalizedPath === '/v1/chat/completions') {
            $this->handleChatCompletions();
        } elseif ($normalizedPath === '/v1/embeddings') {
            $this->handleEmbeddings();
        } elseif ($normalizedPath === '/v1/images/generations') {
            $this->handleImageGenerations();
        } elseif ($normalizedPath === '/' || $normalizedPath === '/index.php' || $normalizedPath === '/index') {
            // Check for animation toggle
            if (!($this->settings['boot_animation_enabled'] ?? false)) {
                header('Location: dashboard.php');
                exit;
            }
            // Terminal Startup Animation
            ?>
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI_GATEWAY // BOOT</title>
                <script src="vendor/tailwindcss/dist/lib.min.js"></script>
                <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
                <style>
                    body { background-color: #020617; color: #10b981; font-family: 'JetBrains Mono', monospace; overflow: hidden; perspective: 1000px; }
                    .crt-container {
                        width: 100vw; height: 100vh;
                        position: relative;
                        overflow: hidden;
                        background: radial-gradient(circle, rgba(16,185,129,0.05) 0%, rgba(0,0,0,1) 90%);
                    }
                    .text-glow { text-shadow: 0 0 5px rgba(16,185,129,0.5), 0 0 10px rgba(16,185,129,0.3); }
                    .scanline {
                        width: 100%; height: 2px;
                        background: rgba(16, 185, 129, 0.1);
                        position: absolute;
                        animation: scan 6s linear infinite;
                        z-index: 50;
                        pointer-events: none;
                    }
                    @keyframes scan { 0% { top: -10%; } 100% { top: 110%; } }
                    ::-webkit-scrollbar { display: none; }
                </style>
            </head>
            <body class="bg-black">
                <div class="scanline"></div>
                <div class="crt-container flex items-center justify-center p-4 md:p-10">
                    
                    <div class="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10 h-[80vh]">
                        <!-- Main Boot Log -->
                        <div class="md:col-span-2 flex flex-col h-full">
                            <!-- Header -->
                            <div class="border-b border-emerald-500/30 pb-4 mb-4 flex justify-between items-end">
                                <div>
                                    <h1 class="text-4xl md:text-5xl font-bold tracking-tighter text-emerald-500 flex items-center gap-4">
                                        <span class="text-glow">SYSTEM_BOOT</span>
                                    </h1>
                                    <div class="text-[10px] text-emerald-500/50 mt-1 tracking-[0.3em] uppercase">Hypervisor_Level_1 :: CERN_link_active</div>
                                </div>
                                <div class="text-right hidden md:block">
                                    <div class="text-[10px] text-emerald-500/50">SECURE_CHANNEL</div>
                                    <div class="text-xl font-bold text-emerald-400">ENCRYPTED</div>
                                </div>
                            </div>
                            
                            <!-- Log Output -->
                            <div class="flex-1 overflow-hidden relative border-emerald-500/10 bg-black/20 rounded-sm p-4 font-mono text-sm">
                                <div id="boot-log" class="space-y-1 text-emerald-400/80"></div>
                            </div>

                            <!-- Progress -->
                            <div class="mt-4 space-y-1">
                                <div class="flex justify-between text-[10px] text-emerald-500/60 uppercase tracking-widest">
                                    <span>Kernel_Load</span>
                                    <span id="progress-text">0%</span>
                                </div>
                                <div class="w-full bg-emerald-900/30 h-1 overflow-hidden">
                                    <div id="progress-bar" class="h-full bg-emerald-500 w-0 shadow-[0_0_10px_rgba(16,185,129,0.8)] transition-all duration-100 ease-out"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Sidebar: Visuals -->
                        <div class="hidden md:flex flex-col gap-6 border-l border-emerald-500/20 pl-6 opacity-90 h-full">
                            
                            <!-- A* Visualizer -->
                            <div class="flex-1 flex flex-col">
                                <div class="text-[10px] text-emerald-500/70 mb-2 font-bold tracking-wider border-b border-emerald-500/20 pb-1 flex justify-between">
                                    <span>NEURAL_PATHFINDING</span>
                                    <span class="animate-pulse text-emerald-400">ACTIVE</span>
                                </div>
                                <div class="flex-1 bg-emerald-900/5 border border-emerald-500/20 relative p-1">
                                    <canvas id="astar-canvas" class="w-full h-full block opacity-80"></canvas>
                                </div>
                                <div class="text-[8px] text-emerald-500/30 font-mono mt-1 text-right">HEURISTIC: EUCLIDEAN // GRID: 20x20</div>
                            </div>

                            <!-- System Resources -->
                            <div>
                                <div class="text-[10px] text-emerald-500/70 mb-2 font-bold tracking-wider border-b border-emerald-500/20 pb-1">SYS_RESOURCES</div>
                                <div class="space-y-2 font-mono text-[10px]">
                                    <div class="flex justify-between items-center bg-emerald-900/10 p-1 border border-emerald-500/10">
                                        <span class="text-emerald-500/70">CPU_CORE_0</span>
                                        <span class="text-emerald-500/50" id="res-cpu0">10110</span>
                                    </div>
                                    <div class="flex justify-between items-center bg-emerald-900/10 p-1 border border-emerald-500/10">
                                        <span class="text-emerald-500/70">CPU_CORE_1</span>
                                        <span class="text-emerald-500/50" id="res-cpu1">01001</span>
                                    </div>
                                    <div class="flex justify-between items-center bg-emerald-900/10 p-1 border border-emerald-500/10">
                                        <span class="text-emerald-500/70">QUANTUM_RAM</span>
                                        <span class="text-emerald-500/50" id="res-ram">11010</span>
                                    </div>
                                    <div class="flex justify-between items-center bg-emerald-900/10 p-1 border border-emerald-500/10">
                                        <span class="text-emerald-500/70">NEURAL_NET</span>
                                        <span class="text-emerald-500/50" id="res-net">00111</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Decorative Hash -->
                            <div class="h-24 overflow-hidden relative">
                                <div class="text-[10px] text-emerald-500/70 mb-1 font-bold tracking-wider border-b border-emerald-500/20 pb-1">LIVE_DECRYPT</div>
                                <div id="decrypt-stream" class="font-mono text-[8px] leading-3 text-emerald-600/60 break-all"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <script nonce="<?php echo csp_nonce(); ?>">
                    // DOM Elements
                    const logEl = document.getElementById('boot-log');
                    const progRed = document.getElementById('progress-bar');
                    const progTxt = document.getElementById('progress-text');
                    const canvas = document.getElementById('astar-canvas');
                    const ctx = canvas.getContext('2d');

                    // ==========================================
                    // 1. Graph Pathfinding Logic (Dots & Lines)
                    // ==========================================
                    const nodeCount = 20;
                    const nodes = [];
                    const connections = [];

                    class GraphNode {
                        constructor(id) {
                            this.id = id;
                            this.x = Math.random() * (canvas.width - 20) + 10;
                            this.y = Math.random() * (canvas.height - 20) + 10;
                            this.status = 'neutral'; // neutral, scanning (red), path (green)
                            this.neighbors = [];
                        }
                        draw() {
                            ctx.beginPath();
                            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                            if (this.status === 'neutral') ctx.fillStyle = '#064e3b';
                            if (this.status === 'scanning') ctx.fillStyle = '#ef4444'; // Red scan
                            if (this.status === 'path') {
                                ctx.fillStyle = '#10b981'; // Green path
                                ctx.shadowColor = '#10b981';
                                ctx.shadowBlur = 8;
                            }
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    }

                    function resize() {
                        canvas.width = canvas.offsetWidth;
                        canvas.height = canvas.offsetHeight;
                    }
                    window.addEventListener('resize', resize);
                    resize();

                    function initGraph() {
                        nodes.length = 0;
                        connections.length = 0;
                        for(let i=0; i<nodeCount; i++) nodes.push(new GraphNode(i));
                        
                        // Connect close nodes
                        for(let i=0; i<nodes.length; i++) {
                            for(let j=i+1; j<nodes.length; j++) {
                                const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
                                if (dist < 80) {
                                    nodes[i].neighbors.push(nodes[j]);
                                    nodes[j].neighbors.push(nodes[i]);
                                    connections.push([nodes[i], nodes[j]]);
                                }
                            }
                        }
                        // Ensure graph connectivity (naive)
                        if (nodes[0].neighbors.length === 0) {
                             // force connect to nearest
                             let minD = Infinity; let nearest = null;
                             for(let j=1; j<nodes.length; j++){
                                 const d = Math.hypot(nodes[0].x - nodes[j].x, nodes[0].y - nodes[j].y);
                                 if(d < minD) { minD = d; nearest = nodes[j]; }
                             }
                             if(nearest) {
                                 nodes[0].neighbors.push(nearest);
                                 nearest.neighbors.push(nodes[0]);
                                 connections.push([nodes[0], nearest]);
                             }
                        }
                    }

                    async function runPathfinding() {
                        initGraph();
                        const start = nodes[0];
                        const end = nodes[nodes.length - 1];

                        // BFS for path
                        let queue = [[start]];
                        let visited = new Set();
                        let finalPath = null;

                        // Visual Loop
                        while(true) { // Continuous loop for animation within 5s
                           // Reset
                           nodes.forEach(n => n.status = 'neutral');
                           queue = [[start]];
                           visited = new Set([start]);
                           visited.add(start);
                           finalPath = null;

                           let searching = true;
                           while (queue.length > 0 && searching) {
                               const path = queue.shift();
                               const node = path[path.length - 1];

                               // Visualize Scan
                               node.status = 'scanning';
                               drawGraph(); // Red scan
                               await new Promise(r => setTimeout(r, 15)); // Blazing fast

                               if (node === end) {
                                   finalPath = path;
                                   searching = false;
                               }

                               for (let neighbor of node.neighbors) {
                                   if (!visited.has(neighbor)) {
                                       visited.add(neighbor);
                                       const newPath = [...path, neighbor];
                                       queue.push(newPath);
                                   }
                               }
                           }

                           if (finalPath) {
                               // Trace Path Green
                               for (let n of finalPath) {
                                   n.status = 'path';
                               }
                               drawGraph();
                               await new Promise(r => setTimeout(r, 200)); // Quick flash green
                           } else {
                               // Retry map if no path
                               initGraph();
                           }
                        }
                    }

                    function drawGraph() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        
                        // Draw Lines
                        ctx.lineWidth = 1;
                        for(let [n1, n2] of connections) {
                            ctx.beginPath();
                            ctx.moveTo(n1.x, n1.y);
                            ctx.lineTo(n2.x, n2.y);
                            
                            if (n1.status === 'path' && n2.status === 'path') {
                                ctx.strokeStyle = '#10b981';
                                ctx.globalAlpha = 1;
                            } else if (n1.status === 'scanning' || n2.status === 'scanning') {
                                ctx.strokeStyle = '#ef4444';
                                ctx.globalAlpha = 0.5;
                            } else {
                                ctx.strokeStyle = '#064e3b';
                                ctx.globalAlpha = 0.3;
                            }
                            ctx.stroke();
                        }
                        ctx.globalAlpha = 1;

                        // Draw Nodes
                        for(let n of nodes) n.draw();
                    }

                    runPathfinding(); // Async fire & forget

                    // ==========================================
                    // 2. Logging & Progress (HYPER FAST)
                    // ==========================================
                    const messages = [
                        "INIT_KERNEL_9.0 :: MOUNT_VOL_0",
                        "CONNECT_CERN_NODE_7 :: ACK (0.00ms)",
                        "DECRYPT_ENV_KEYS :: [OK]",
                        "ALLOC_NEURAL_BUFFERS :: [OK]",
                        "SYS_INTEGRITY_CHECK :: PASSED",
                        "START_WORKER_THREADS_x64 :: READY",
                        "UPLINK_ESTABLISHED :: GATEWAY_READY"
                    ];

                    async function typeLog() {
                        // Clear previous
                        logEl.innerHTML = '';
                        for (let line of messages) {
                            const p = document.createElement('div');
                            p.innerHTML = `<span class="opacity-50">[${(Date.now()/1000).toFixed(3)}]</span> ${line}`;
                            logEl.appendChild(p);
                            logEl.scrollTop = logEl.scrollHeight;
                            
                            // Blazing fast: ~15ms per line
                            await new Promise(r => setTimeout(r, 15)); 
                        }
                    }

                    // Progress Bar Animation (2s Total)
                    const totalTime = 1500; // 1.5s bar, redirect at 2s
                    let startTime = Date.now();
                    function updateProgress() {
                        const elapsed = Date.now() - startTime;
                        const pct = Math.min(100, (elapsed / totalTime) * 100);
                        progRed.style.width = pct + '%';
                        progTxt.innerText = Math.floor(pct) + '%';
                        
                        if (pct < 100) {
                            requestAnimationFrame(updateProgress);
                        } else {
                            // Redirect Immediately
                             window.location.href = 'dashboard.php';
                        }
                    }
                    
                    // Start
                    typeLog();
                    updateProgress();

                    // ==========================================
                    // 3. System Decoration (Binary -> OK)
                    // ==========================================
                    const resIds = ['res-cpu0', 'res-cpu1', 'res-ram', 'res-net'];
                    resIds.forEach((id, index) => {
                        const el = document.getElementById(id);
                        // Stagger resolution (fit within 2s)
                        const resolveTime = 200 + (index * 350); 
                        
                        // Binary flickering
                        const intv = setInterval(() => {
                            const bin = Math.random() > 0.5 ? '101101' : '010010';
                            el.innerText = bin;
                            el.className = 'text-emerald-500/30 font-mono'; 
                        }, 40);

                        // Resolve to OK
                        setTimeout(() => {
                            clearInterval(intv);
                            el.innerText = 'OK';
                            el.className = 'text-emerald-400 font-bold text-glow tracking-widest';
                        }, resolveTime);
                    });

                    // Decrypt Stream (Hyper Fast)
                    const hexChars = "01";
                    setInterval(() => {
                        const el = document.getElementById('decrypt-stream');
                        let str = "";
                        for(let i=0; i<300; i++) str += hexChars[Math.floor(Math.random()*2)];
                        el.innerText = str.replace(/(.{40})/g, "$1\n");
                    }, 40);



                </script>
            </body>
            </html>
            <?php
            exit;
        } else {
            // Check if it's an API request
            if (strpos($path, '/v1/') === 0) {
                respond_json(['error' => 'Not Found'], 404);
            }
            
            // Serve custom REDACTED 404 page
            require __DIR__ . '/../../404.php';
            exit;
        }
    }

    private function handleModels() {
        // read bearer key
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(\S+)/', $auth, $am)) {
            respond_json(['error' => 'missing api key'], 401);
        }
        $rawKey = $am[1];
        $keyHash = hash('sha256', $rawKey);
        
        // Cache API Key check? Maybe later. For now just cache models list.
        $stmt = $this->pdo->prepare("SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1");
        $stmt->execute([$keyHash]);
        if (!$stmt->fetch()) respond_json(['error' => 'invalid api key'], 401);

        // Check cache for models
        $data = $this->cache->get('models_list');
        if (!$data) {
            $stm = $this->pdo->query("SELECT name FROM endpoints");
            $data = [];
            while ($row = $stm->fetch(PDO::FETCH_ASSOC)) {
                $data[] = [
                    'id' => $row['name'],
                    'object' => 'model',
                    'created' => time(),
                    'owned_by' => 'system'
                ];
            }
            $this->cache->set('models_list', $data, 300);
        }
        
        respond_json(['object' => 'list', 'data' => $data]);
    }

    private function handleEmbeddings() {
        $this->handleGenericRequest('/embeddings');
    }

    private function handleImageGenerations() {
        $this->handleGenericRequest('/images/generations');
    }

    private function handleGenericRequest(string $subPath) {
        $now = time();
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(\S+)/', $auth, $am)) {
            respond_json(['error' => 'missing api key'], 401);
        }
        $rawKey = $am[1];
        $keyHash = hash('sha256', $rawKey);

        $keyRow = $this->cache->get("key:$keyHash");
        if (!$keyRow) {
            $stmt = $this->pdo->prepare("SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1");
            $stmt->execute([$keyHash]);
            $keyRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($keyRow) $this->cache->set("key:$keyHash", $keyRow, 60);
        }
        if (!$keyRow) respond_json(['error' => 'invalid api key'], 401);

        $bodyRaw = file_get_contents('php://input');
        $jsonBody = json_decode($bodyRaw, true);
        if (!$jsonBody || !isset($jsonBody['model'])) {
            respond_json(['error' => 'invalid json or missing model field'], 400);
        }

        $requestedModel = $jsonBody['model'];
        $endpoint = $this->cache->get("endpoint:$requestedModel");
        if (!$endpoint) {
            $stmt = $this->pdo->prepare("SELECT * FROM endpoints WHERE name = ?");
            $stmt->execute([$requestedModel]);
            $endpoint = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($endpoint) $this->cache->set("endpoint:$requestedModel", $endpoint, 300);
        }

        if (!$endpoint) respond_json(['error' => "model '$requestedModel' not found"], 404);

        $providers = $this->cache->get("providers:{$endpoint['id']}");
        if (!$providers) {
            $ps = $this->pdo->prepare("
            SELECT ep.id AS ep_id, ep.provider_id, ep.model, ep.priority, ep.quota, ep.used, ep.reset_at, ep.status, ep.suspended_until, ep.rate_limit_hits,
                p.name AS provider_name, p.base_url, p.api_key_enc, p.enabled
            FROM endpoint_providers ep
            JOIN providers p ON p.id = ep.provider_id
            WHERE ep.endpoint_id = ?
            ORDER BY ep.priority ASC, ep.id ASC
            ");
            $ps->execute([$endpoint['id']]);
            $providers = $ps->fetchAll(PDO::FETCH_ASSOC);
            if ($providers) $this->cache->set("providers:{$endpoint['id']}", $providers, 300);
        }
        
        if (!$providers) respond_json(['error' => 'no providers configured for this model'], 503);

        $this->proxyRequest($providers, $jsonBody, $requestedModel, $keyRow, $endpoint, $now, $subPath);
    }

    private function handleChatCompletions() {
        // Remove PHP execution time limit for streaming requests
        // cURL's CURLOPT_TIMEOUT (180s) still applies as safety net
        set_time_limit(0);
        
        // 0. Rate Limiting (IP-based)
        $rateLimiter = new RateLimiter($this->cache, $this->pdo);
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        if (!$rateLimiter->checkIp($ip, 60, 60)) {
            respond_json(['error' => 'rate limit exceeded'], 429);
        }

        // read bearer key
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(\S+)/', $auth, $am)) {
            respond_json(['error' => 'missing api key'], 401);
        }
        $rawKey = $am[1];
        $keyHash = hash('sha256', $rawKey);

        // Cache API Key
        $keyRow = $this->cache->get("key:$keyHash");
        if (!$keyRow) {
            $stmt = $this->pdo->prepare("SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1");
            $stmt->execute([$keyHash]);
            $keyRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($keyRow) $this->cache->set("key:$keyHash", $keyRow, 60); // Short TTL for keys
        }
        if (!$keyRow) respond_json(['error' => 'invalid api key'], 401);

        // lazy reset api_key daily counter
        $now = time();
        if ((int)$keyRow['reset_at'] + 86400 <= $now) {
            $this->queueDbWrite('api_keys', (int)$keyRow['id'], ['used' => 0, 'reset_at' => $now]);
            $keyRow['used'] = 0;
            $keyRow['reset_at'] = $now;
            // Invalidate cache
            $this->cache->delete("key:$keyHash");
        }
        // check api key quota (if >0)
        // Fix Async Overshoot: Check DB + Pending Cache
        $pending = $this->getPendingUsage('api_keys', (int)$keyRow['id']);
        if ((int)$keyRow['quota'] > 0 && ((int)$keyRow['used'] + $pending) >= (int)$keyRow['quota']) {
            respond_json(['error' => 'api key quota exceeded'], 429);
        }

        // Parse Body to get Model
        $bodyRaw = file_get_contents('php://input');
        $jsonBody = json_decode($bodyRaw, true);
        if (!$jsonBody || !isset($jsonBody['model'])) {
            respond_json(['error' => 'invalid json or missing model field'], 400);
        }

        $requestedModel = $jsonBody['model'];

        // Cache Endpoint with basic stampede prevention
        $endpoint = $this->cache->get("endpoint:$requestedModel");
        if (!$endpoint) {
            // Basic lock: if another request is fetching, wait a bit
            $lockKey = "lock:endpoint:$requestedModel";
            if ($this->cache->get($lockKey)) {
                usleep(50000); // 50ms wait
                $endpoint = $this->cache->get("endpoint:$requestedModel");
            }
            
            if (!$endpoint) {
                $this->cache->set($lockKey, true, 5); // 5s lock
                
                $stmt = $this->pdo->prepare("SELECT * FROM endpoints WHERE name = ?");
                $stmt->execute([$requestedModel]);
                $endpoint = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($endpoint) $this->cache->set("endpoint:$requestedModel", $endpoint, 300);
                
                $this->cache->delete($lockKey);
            }
        }

        if (!$endpoint) respond_json(['error' => "model '$requestedModel' not found"], 404);

        // lazy reset endpoint
        if ((int)$endpoint['reset_at'] + 86400 <= $now) {
            $this->queueDbWrite('endpoints', (int)$endpoint['id'], ['used' => 0, 'reset_at' => $now]);
            $endpoint['used'] = 0;
            $this->cache->delete("endpoint:$requestedModel");
        }
        // check endpoint quota - REMOVED (Per Provider Logic)
        // Global cap removed to allow sum of provider quotas


        // Cache Providers
        $providers = $this->cache->get("providers:{$endpoint['id']}");
        if (!$providers) {
            $ps = $this->pdo->prepare("
            SELECT ep.id AS ep_id, ep.provider_id, ep.model, ep.priority, ep.quota, ep.used, ep.reset_at, ep.status, ep.suspended_until, ep.rate_limit_hits,
                p.name AS provider_name, p.base_url, p.api_key_enc, p.enabled
            FROM endpoint_providers ep
            JOIN providers p ON p.id = ep.provider_id
            WHERE ep.endpoint_id = ?
            ORDER BY ep.priority ASC, ep.id ASC
            ");
            $ps->execute([$endpoint['id']]);
            $providers = $ps->fetchAll(PDO::FETCH_ASSOC);
            if ($providers) $this->cache->set("providers:{$endpoint['id']}", $providers, 300);
        }
        
        if (!$providers) respond_json(['error' => 'no providers configured for this model'], 503);

        $this->proxyRequest($providers, $jsonBody, $requestedModel, $keyRow, $endpoint, $now, '/chat/completions');
    }

    private function getForwardableHeaders(): array {
        $forward = [];
        $skip = [
            'host', 'authorization', 'content-length', 'content-type',
            'connection', 'accept-encoding', 'referer', 'user-agent'
        ];
        
        foreach ($_SERVER as $name => $value) {
            if (strpos($name, 'HTTP_') === 0) {
                $headerName = str_replace('_', '-', substr($name, 5));
                if (!in_array(strtolower($headerName), $skip)) {
                    $forward[] = "$headerName: $value";
                }
            }
        }
        return $forward;
    }

    private function proxyRequest($providers, $jsonBody, $requestedModel, $keyRow, $endpoint, $now, $subPath = '/chat/completions') {
        $lastErrors = [];
        
        foreach ($providers as $p) {
            // skip disabled provider
            if (!(int)$p['enabled']) {
                $lastErrors[] = "provider {$p['provider_name']} disabled";
                continue;
            }

            // lazy reset provider-per-endpoint
            if ((int)$p['reset_at'] + 86400 <= $now) {
                $this->queueDbWrite('endpoint_providers', (int)$p['ep_id'], ['used' => 0, 'reset_at' => $now, 'rate_limit_hits' => 0]);
                $p['used'] = 0;
                $p['rate_limit_hits'] = 0;
                $this->cache->delete("res:ep:" . $p['ep_id']); // Reset reservation counter
            }
            // check cooldown
            if (!empty($p['suspended_until']) && $p['suspended_until'] > $now) {
                $lastErrors[] = "provider {$p['provider_name']} suspended until " . date('H:i:s', (int)$p['suspended_until']);
                continue;
            }
            // Atomic quota reservation
            $effectiveQuota = (int)$p['quota'] > 0 ? (int)$p['quota'] : (int)$endpoint['quota'];
            if ($effectiveQuota > 0 && !$this->reserveQuotaSlot((int)$p['ep_id'], $effectiveQuota)) {
                $lastErrors[] = "provider {$p['provider_name']} quota exhausted";
                continue;
            }

            $upstreamUrl = rtrim($p['base_url'], '/');
            
            // Smarter subPath handling:
            // If subPath is already in base_url, don't append.
            // If base_url ends in /v1/openai, appending /chat/completions is correct.
            $cleanSubPath = ltrim($subPath, '/');
            if (strpos($upstreamUrl, $cleanSubPath) === false) {
                $upstreamUrl .= '/' . $cleanSubPath;
            }

            $upstreamApiKey = dec_key($p['api_key_enc']);
            if (!$upstreamApiKey) {
                $lastErrors[] = "provider {$p['provider_name']} decrypt failed";
                continue;
            }

            // REWRITE BODY: Set upstream model
            $jsonBody['model'] = $p['model'];
            $newBody = json_encode($jsonBody, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            // prepare headers
            $forwardHeaders = $this->getForwardableHeaders();
            $forwardHeaders[] = "Authorization: Bearer " . $upstreamApiKey;
            $forwardHeaders[] = "Content-Type: application/json";
            $forwardHeaders[] = "User-Agent: smolorchestrator/1.0";
            $forwardHeaders[] = "Accept: text/event-stream, application/json";

            // prepare for streaming
            $ch = curl_init($upstreamUrl);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $newBody);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
            // streaming requires we don't return transfer, but handle writes
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 180); // longer timeout for streams

            // pass through headers from upstream
            $headerSent = false;
            curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$headerSent, $p) {
                if (!$headerSent) {
                    header("X-smolorchestrator-Provider: " . $p['provider_name']);
                    $headerSent = true;
                }

                $len = strlen($header);
                $headerParts = explode(':', $header, 2);
                if (count($headerParts) < 2) return $len; // skip invalid headers

                $name = trim($headerParts[0]);
                $val = trim($headerParts[1]);
                
                // Forward all except hop-by-hop headers that PHP/web server manages
                $skip = ['transfer-encoding', 'connection', 'keep-alive', 'content-encoding'];
                if (!in_array(strtolower($name), $skip)) {
                    header("$name: $val");
                }
                return $len;
            });

            // stream body directly to client
            $bytesReceived = 0;
            curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $chunk) use (&$bytesReceived) {
                echo $chunk;
                if (ob_get_level() > 0) ob_flush();
                flush();
                $bytesReceived += strlen($chunk);
                return strlen($chunk);
            });

            $t0 = microtime(true);
            $success = curl_exec($ch);
            $lat = (int)((microtime(true) - $t0) * 1000);
            $errNo = curl_errno($ch);
            $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 0;
            // curl_close($ch); // Deprecated in PHP 8.0+

            // if curl error or 5xx, suspend and retry
            if ($errNo || $httpStatus >= 500) {
                $errorMsg = $errNo ? "curl error {$errNo}" : "status {$httpStatus}";
                $lastErrors[] = "provider {$p['provider_name']} failed: $errorMsg";
                
                // suspend for user-defined minutes
                $blockMins = (int)($this->settings['block_other_mins'] ?? 1);
                $suspendUntil = $now + ($blockMins * 60);
                $this->queueDbWrite('endpoint_providers', (int)$p['ep_id'], ['suspended_until' => $suspendUntil]);
                
                continue;
            }

            // 429 blocks immediately for user-defined hours
            if ($httpStatus === 429) {
                $blockHrs = (int)($this->settings['block_429_hrs'] ?? 1);
                $suspendUntil = $now + ($blockHrs * 3600);
                // For rate limit hits increments, we handle roughly via queue but specific +1 logic needs simpler queue support or just direct value
                // Since this is a "set", we can just set suspended_until. For rate_limit_hits + 1, we might need a specific op?
                // The current queueDbWrite supports 'key' => 'value'.
                // Ideally we want to increment rate_limit_hits.
                // Let's modify queueDbWrite to support special op or just do a read-modify-write here? No, that's racey.
                // Since this is an error path (429), it's less frequent. But we want to avoid locks.
                // Let's rely on the worker to sum up hits? Or just push a "increment" command?
                // For this implementation, I'll allow special syntax or just ignore the +1 here and queue the suspension primarily.
                // Actually, let's keep it simple: Just suspend. The hits counter is less critical than the block.
                $this->queueDbWrite('endpoint_providers', (int)$p['ep_id'], ['suspended_until' => $suspendUntil]);
                $lastErrors[] = "provider {$p['provider_name']} hit rate limit (blocking for {$blockHrs}hr)";
                continue;
            }

            // Other 4xx errors (excluding specific fatal ones) also block for user-defined minutes
            if ($httpStatus >= 400 && $httpStatus < 500 && !in_array($httpStatus, [401, 403, 404])) {
                $lastErrors[] = "provider {$p['provider_name']} returned client error {$httpStatus}";
                
                $blockMins = (int)($this->settings['block_other_mins'] ?? 1);
                $suspendUntil = $now + ($blockMins * 60);
                $this->pdo->prepare("UPDATE endpoint_providers SET suspended_until = ? WHERE id = ?")->execute([$suspendUntil, $p['ep_id']]);
                continue;
            }

            // Success (2xx) or Client Error (4xx - do not retry client errors)
            // Log request - status and bytes instead of full buffer
            $status = ($httpStatus >= 200 && $httpStatus < 400) ? 'success' : 'failed';
            $snippet = "status:$status bytes:$bytesReceived";
            $this->log_request($now, $requestedModel, $p['provider_name'], $httpStatus, $lat, $snippet);

            if ($httpStatus >= 200 && $httpStatus < 500) {
                // increment usage and reset rate limit counter on success
                $this->incrementUsage('api_keys', (int)$keyRow['id']);
                $this->incrementUsage('endpoints', (int)$endpoint['id']);
                // endpoint_providers: In DB mode, reserveQuotaSlot already incremented.
                // In cache mode, reservation key is separate, so we still need to track for worker sync.
                if ($this->cache->isEnabled()) {
                    // Cache mode: reservation key (res:ep:X) is source of truth, worker will sync it
                    // No additional increment needed here
                }
                
                // Reset rate limit hits immediately if using DB, or let worker handle it?
                // For simplicity, if using cache, we just don't increment rate_limit_hits.
                // But we need to reset it. 
                // Let's just do a direct DB update for resetting rate_limit_hits to 0 if it was > 0, 
                // or maybe just leave it. The worker will eventually sync usage.
                // Actually, if we are async, we should probably handle rate limit reset async too or just ignore it for now.
                // Let's stick to the plan: "Increment usage counters".
                // We'll leave rate_limit_hits reset for the worker or direct DB if critical.
                // For now, let's do direct DB for rate_limit_hits reset to be safe, as it affects logic.
                if ($p['rate_limit_hits'] > 0) {
                     $this->queueDbWrite('endpoint_providers', (int)$p['ep_id'], ['rate_limit_hits' => 0]);
                }
                
                exit; // done
            }
            
            // if we are here, it's some other weird status, try next
            $lastErrors[] = "provider {$p['provider_name']} unexpected status {$httpStatus}";
        }

        // all providers exhausted
        respond_json(['error' => 'all providers exhausted', 'details' => $lastErrors], 502);
    }

    private function incrementUsage(string $table, int $id) {
        // If cache enabled, increment in cache
        if ($this->cache->isEnabled()) {
            $key = "usage:$table:$id";
            $current = (int)$this->cache->get($key);
            $this->cache->set($key, $current + 1, 86400); // 24h TTL
            return;
        }

        // Fallback to Sync DB -> MOVED TO ASYNC QUEUE
        // We use a special key for increments: usage_inc
        $this->queueDbWrite($table, $id, ['__increment' => 'used']);
    }

    private function log_request($ts, $endpoint, $provider, $status, $latencyMs, $responseSnippet) {
        // Async File Logging
        $logDir = LOG_PATH;
        if (!is_dir($logDir) && !mkdir($logDir, 0750, true) && !is_dir($logDir)) {
            // Silently fail or log to system temp? Can't do much if storage is invalid.
            return;
        }
        
        $logFile = $logDir . '/requests.log';
        $data = json_encode([
            'ts' => $ts,
            'endpoint' => $endpoint,
            'provider' => $provider,
            'status' => $status,
            'latency_ms' => $latencyMs,
            'response_snippet' => base64_encode($responseSnippet) // Base64 to handle newlines/binary safely
        ]);
        
        if (file_put_contents($logFile, $data . "\n", FILE_APPEND | LOCK_EX) !== false) {
            return;
        }


    }

    /**
     * Atomically reserve a quota slot for a provider.
     * Returns true if slot reserved, false if quota exhausted.
     */
    private function reserveQuotaSlot(int $epId, int $effectiveQuota): bool {
        if ($this->cache->isEnabled()) {
            $key = "res:ep:$epId";
            
            // On first request with cache enabled, check for stale cache values
            // and persist them to DB if higher than current DB value
            $cacheExists = $this->cache->exists($key);
            
            if (!$cacheExists) {
                // Fetch current DB value
                $stmt = $this->pdo->prepare("SELECT used FROM endpoint_providers WHERE id = ?");
                $stmt->execute([$epId]);
                $dbUsed = (int)$stmt->fetchColumn();
                
                // Check if there's a stale cache value (exists but maybe expired/not detected)
                // Force a raw get to check for any lingering value
                $cachedValue = $this->cache->get($key);
                if ($cachedValue !== null && (int)$cachedValue > $dbUsed) {
                    // Cache has higher value - persist it to DB immediately
                    $this->pdo->prepare("UPDATE endpoint_providers SET used = ? WHERE id = ?")
                        ->execute([(int)$cachedValue, $epId]);
                    $dbUsed = (int)$cachedValue; // Use the higher value
                }
                
                // Clear any stale cache and reseed fresh from DB (now has correct value)
                $this->cache->delete($key);
                $added = $this->cache->add($key, $dbUsed, 86400);
                
                // If add failed (race: another request seeded it), verify it exists now
                if (!$added && !$this->cache->exists($key)) {
                    // Key still doesn't exist - this shouldn't happen, but fallback to DB mode
                    error_log("Cache seeding failed for res:ep:$epId, falling back to DB mode");
                    goto db_mode;
                }
            }
            
            // Cache mode: atomic increment
            $newCount = $this->cache->increment($key, 1, 86400);
            if ($newCount > $effectiveQuota) {
                $this->cache->increment($key, -1, 86400); // Release reservation
                return false;
            }
            return true;
        }
        
        db_mode:
        // DB mode: atomic UPDATE with condition
        $stmt = $this->pdo->prepare(
            "UPDATE endpoint_providers SET used = used + 1 WHERE id = ? AND used < ?"
        );
        $stmt->execute([$epId, $effectiveQuota]);
        return $stmt->rowCount() > 0;
    }

    private function getPendingUsage(string $table, int $id): int {
        if (!$this->cache->isEnabled()) return 0;
        return (int)$this->cache->get("usage:$table:$id");
    }

    private function queueDbWrite(string $table, int $id, array $updates): void {
        $queueFile = LOG_PATH . '/db_queue.log';
        $entry = json_encode(['table' => $table, 'id' => $id, 'updates' => $updates, 'ts' => time()]);
        // Fast append
        file_put_contents($queueFile, $entry . "\n", FILE_APPEND | LOCK_EX);
    }
}
