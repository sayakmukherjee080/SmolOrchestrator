<?php
declare(strict_types=1);

class Cache {
    private $driver = 'file'; // 'apcu' or 'file'
    private $enabled = false;
    private $cacheDir;

    public function __construct(bool $enabled = false, string $driver = 'file') {
        $this->enabled = $enabled;
        $this->driver = $driver;
        $this->cacheDir = __DIR__ . '/../../../storage/cache';
        
        if ($this->driver === 'file' && !is_dir($this->cacheDir)) {
            if (!mkdir($this->cacheDir, 0700, true) && !is_dir($this->cacheDir)) {
                throw new RuntimeException("Failed to create cache directory: {$this->cacheDir}");
            }
        }
    }

    public function get(string $key) {
        if (!$this->enabled) return null;

        if ($this->driver === 'apcu' && function_exists('apcu_fetch')) {
            $success = false;
            $val = apcu_fetch($key, $success);
            return $success ? $val : null;
        }

        // File fallback
        $file = $this->getFilePath($key);
        if (file_exists($file) && is_readable($file)) {
            $content = file_get_contents($file);
            if ($content === false) return null;
            
            $data = json_decode($content, true);
            if (!is_array($data) || !isset($data['expires'], $data['val'])) {
                @unlink($file);
                return null;
            }

            if ($data['expires'] > time()) {
                return $data['val'];
            }
            // expired
            @unlink($file);
        }
        return null;
    }

    public function set(string $key, $value, int $ttl = 300): bool {
        if (!$this->enabled) return false;

        if ($this->driver === 'apcu' && function_exists('apcu_store')) {
            return apcu_store($key, $value, $ttl);
        }

        // File fallback
        $file = $this->getFilePath($key);
        $data = [
            'expires' => time() + $ttl,
            'val' => $value
        ];
        $content = json_encode($data, JSON_UNESCAPED_SLASHES);
        return (bool)file_put_contents($file, $content, LOCK_EX);
    }

    public function exists(string $key): bool {
        if (!$this->enabled) return false;
        
        if ($this->driver === 'apcu' && function_exists('apcu_fetch')) {
            $success = false;
            apcu_fetch($key, $success);  // Returns false for expired or missing keys
            return $success;
        }
        
        // File fallback - check existence AND expiry
        $file = $this->getFilePath($key);
        if (!file_exists($file)) return false;
        
        $content = @file_get_contents($file);
        if ($content === false) return false;
        
        $data = json_decode($content, true);
        if (!is_array($data) || !isset($data['expires'])) return false;
        
        return $data['expires'] > time();
    }
    
    /**
     * Atomically set value if key does not exist.
     * Returns true if set, false if already exists.
     */
    public function add(string $key, $value, int $ttl = 300): bool {
        if (!$this->enabled) return false;
        
        if ($this->driver === 'apcu' && function_exists('apcu_add')) {
            return apcu_add($key, $value, $ttl);
        }
        
        // File fallback with atomic creation
        $file = $this->getFilePath($key);
        // Use 'x' mode (create and open for write only, returns false if file exists)
        $fp = @fopen($file, 'x'); 
        if (!$fp) return false;
        
        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            return false;
        }
        
        $data = [
            'expires' => time() + $ttl,
            'val' => $value
        ];
        fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES));
        
        flock($fp, LOCK_UN);
        fclose($fp);
        
        return true;
    }

    public function increment(string $key, int $step = 1, int $ttl = 300): int {
        if (!$this->enabled) return 0;

        if ($this->driver === 'apcu' && function_exists('apcu_inc')) {
            $success = false;
            if ($step >= 0) {
                $val = apcu_inc($key, $step, $success, $ttl);
            } else {
                // apcu_dec for negative steps (release reservation)
                if (function_exists('apcu_dec')) {
                    $val = apcu_dec($key, -$step, $success, $ttl);
                } else {
                    return 0; // Fallback if apcu_dec not available
                }
            }
            return $success ? $val : 0;
        }

        // File fallback with locking
        $file = $this->getFilePath($key);
        $fp = fopen($file, 'c+'); // Read/Write, create if not exists
        if (!$fp) return 0;

        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            return 0;
        }

        $content = '';
        while (!feof($fp)) $content .= fread($fp, 8192);
        
        $data = json_decode($content, true);
        $val = 0;
        $expires = time() + $ttl;

        if (is_array($data) && isset($data['val'], $data['expires']) && $data['expires'] > time()) {
            $val = (int)$data['val'];
            $expires = $data['expires']; // Keep original expiry? Or extend? Usually rate limit resets require fixed window.
            // If RateLimiter passes fixed window, we should use that.
            // But here we might just respect existing TTL or update it.
            // RateLimiter sets TTL relative to now.
            // Let's assume we update expiry if it's new, or keep if existing?
            // Simplest: update val, keep expiry if valid, else new expiry.
        } else {
             $expires = time() + $ttl;
        }

        $val += $step;
        
        $newData = ['val' => $val, 'expires' => $expires];
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($newData, JSON_UNESCAPED_SLASHES));
        
        flock($fp, LOCK_UN);
        fclose($fp);
        
        return $val;
    }

    public function delete(string $key): bool {
        if (!$this->enabled) return true;

        if ($this->driver === 'apcu' && function_exists('apcu_delete')) {
            apcu_delete($key);
        }

        // Always try to delete file too, just in case
        $file = $this->getFilePath($key);
        if (file_exists($file)) {
            @unlink($file);
        }
        return true;
    }

    public function flush(): bool {
        if ($this->driver === 'apcu' && function_exists('apcu_clear_cache')) {
            apcu_clear_cache();
        }
        
        // Clear file cache
        if (is_dir($this->cacheDir)) {
            $files = glob($this->cacheDir . '/*.cache');
            foreach ($files as $file) {
                @unlink($file);
            }
        }
        return true;
    }

    public function scan(string $pattern): array {
        $keys = [];
        if ($this->driver === 'apcu' && class_exists('APCuIterator') && ini_get('apc.enabled')) {
            $regex = '/^' . str_replace(['\\*', '\\?'], ['.*', '.'], preg_quote($pattern, '/')) . '$/';
            try {
                $iterator = new APCuIterator($regex, APC_ITER_KEY);
                foreach ($iterator as $entry) {
                    $keys[] = $entry['key'];
                }
            } catch (Throwable $e) {
                // Fallback silently (APC might be disabled in CLI)
            }
        } elseif ($this->driver === 'apcu' && function_exists('apcu_cache_info') && ini_get('apc.enabled')) {
            $info = apcu_cache_info();
            foreach ($info['cache_list'] as $entry) {
                $key = $entry['info'] ?? ($entry['key'] ?? '');
                if ($key && fnmatch($pattern, $key)) {
                    $keys[] = $key;
                }
            }
        } elseif ($this->driver === 'file') {
            $files = glob($this->cacheDir . '/*.cache');
            foreach ($files as $file) {
                $enc = basename($file, '.cache');
                $key = base64_decode(str_replace(['-','_'], ['+','/'], $enc));
                if ($key && fnmatch($pattern, $key)) {
                    $keys[] = $key;
                }
            }
        }
        return $keys;
    }

    public function isEnabled(): bool {
        return $this->enabled;
    }

    private function getFilePath(string $key): string {
        // Use Base64 URL safe for filename
        $enc = str_replace(['+','/'], ['-','_'], base64_encode($key));
        return $this->cacheDir . '/' . $enc . '.cache';
    }
}
