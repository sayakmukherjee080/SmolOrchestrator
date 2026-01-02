<?php
declare(strict_types=1);

class Auth {
    private $pdo;
    private $cookieName = 'smolorchestrator_auth';
    private $cookieExpiry = 2592000; // 30 days

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
        $this->ensureTable();
    }

    public function check(): bool {
        if (session_status() === PHP_SESSION_NONE) session_start();

        // 1. Session Check
        if (isset($_SESSION['admin']) && $_SESSION['admin'] === true) {
            return true;
        }

        // 2. Cookie Check
        if (isset($_COOKIE[$this->cookieName])) {
            return $this->attemptCookieLogin();
        }

        return false;
    }

    public function login(string $email, string $password, bool $remember = false): bool {
        $stmt = $this->pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password'])) {
            $this->startSession($user);
            if ($remember) {
                $this->createRememberToken($user['id']);
            }
            return true;
        }
        return false;
    }

    public function logout() {
        if (session_status() === PHP_SESSION_NONE) session_start();
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
        
        // Clear Remember Cookie
        if (isset($_COOKIE[$this->cookieName])) {
            $parts = explode(':', $_COOKIE[$this->cookieName]);
            if (count($parts) === 2) {
                $this->pdo->prepare("DELETE FROM auth_tokens WHERE selector = ?")->execute([$parts[0]]);
            }
            setcookie($this->cookieName, '', time() - 3600, '/', '', true, true);
        }
    }

    private function startSession(array $user) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['email'] = $user['email'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(16));
        $_SESSION['login_attempts'] = 0;
    }

    private function createRememberToken(int $userId) {
        $selector = bin2hex(random_bytes(12));
        $validator = bin2hex(random_bytes(32));
        $hash = hash('sha256', $validator);
        $expires = time() + $this->cookieExpiry;

        // Limit active sessions per user (Max 5)
        $this->pdo->prepare("DELETE FROM auth_tokens WHERE user_id = ? AND id NOT IN (
            SELECT id FROM auth_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 4
        )")->execute([$userId, $userId]);

        $stmt = $this->pdo->prepare("INSERT INTO auth_tokens (selector, hashed_validator, user_id, expires_at) VALUES (?, ?, ?, ?)");
        $stmt->execute([$selector, $hash, $userId, $expires]);

        setcookie($this->cookieName, "$selector:$validator", $expires, '/', '', true, true);
    }

    private function attemptCookieLogin(): bool {
        $parts = explode(':', $_COOKIE[$this->cookieName]);
        if (count($parts) !== 2) return false;

        [$selector, $validator] = $parts;

        $stmt = $this->pdo->prepare("SELECT * FROM auth_tokens WHERE selector = ? AND expires_at > ?");
        $stmt->execute([$selector, time()]);
        $token = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$token) return false;

        if (hash_equals($token['hashed_validator'], hash('sha256', $validator))) {
            // Valid Token
            $stmt = $this->pdo->prepare("SELECT * FROM users WHERE id = ?");
            $stmt->execute([$token['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user) {
                $this->startSession($user);
                // Rotate Token for security
                $this->pdo->prepare("DELETE FROM auth_tokens WHERE id = ?")->execute([$token['id']]);
                $this->createRememberToken((int)$user['id']);
                return true;
            }
        }
        
        return false;
    }

    private function ensureTable() {
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            selector TEXT UNIQUE NOT NULL,
            hashed_validator TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )");
    }
}
