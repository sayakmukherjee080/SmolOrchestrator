<?php
declare(strict_types=1);

class RateLimiter {
    private Cache $cache;
    private PDO $pdo;

    public function __construct(Cache $cache, PDO $pdo) {
        $this->cache = $cache;
        $this->pdo = $pdo;
    }

    public function checkIp(string $ip, int $limit = 60, int $window = 60): bool {
        // Allow localhost in dev
        if (in_array($ip, ['127.0.0.1', '::1'])) return true;
        
        $key = "ratelimit:ip:$ip";
        return $this->processLimit($key, $limit, $window);
    }

    public function checkKey(string $keyHash, int $limit = 60, int $window = 60): bool {
        $key = "ratelimit:key:$keyHash";
        return $this->processLimit($key, $limit, $window);
    }

    private function processLimit(string $key, int $limit, int $window): bool {
        if ($this->cache->isEnabled()) {
            $newVal = $this->cache->increment($key, 1, $window);
            return $newVal <= $limit;
        }

        // DB Fallback (not recommended for high traffic but better than nothing)
        // Using a simple file-based approach if cache is file-driver is actually implicitly handled by Cache class
        // But if cache is disabled entirely, we might skip or use a temp file? 
        // For this implementation, if cache is disabled, we skip rate limiting to avoid DB death-spiral.
        // Or we could implement a very simple file touch.
        return true; 
    }
}
