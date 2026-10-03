-- Initial schema for the SmolOrchestrator Node gateway.

CREATE TABLE models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    balance_strategy TEXT NOT NULL DEFAULT 'round_robin'
        CHECK (balance_strategy IN ('round_robin', 'least_used', 'cache_aware')),
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE provider_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    label TEXT,
    key_enc TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    disabled_until INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL REFERENCES models(id),
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    upstream_model TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    input_cost_per_m REAL,
    output_cost_per_m REAL,
    daily_quota INTEGER,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    cooldown_until INTEGER NOT NULL DEFAULT 0,
    last_probe_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    label TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    daily_request_limit INTEGER,
    monthly_request_limit INTEGER,
    daily_spend_limit REAL,
    monthly_spend_limit REAL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE token_models (
    token_id INTEGER NOT NULL REFERENCES tokens(id),
    model_id INTEGER NOT NULL REFERENCES models(id),
    PRIMARY KEY (token_id, model_id)
);

CREATE TABLE telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    token_id INTEGER,
    model_id INTEGER,
    route_id INTEGER,
    provider_key_id INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    status INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    est_cost REAL NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    estimated INTEGER NOT NULL DEFAULT 0,
    is_probe INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE TABLE usage (
    entity TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    window_start INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (entity, entity_id, window_start)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip TEXT,
    outcome TEXT NOT NULL,
    details TEXT
);

CREATE INDEX idx_provider_keys_provider ON provider_keys(provider_id, enabled, deleted_at);
CREATE INDEX idx_routes_model ON routes(model_id, priority, deleted_at);
CREATE INDEX idx_routes_provider ON routes(provider_id, deleted_at);
CREATE INDEX idx_token_models_token ON token_models(token_id);
CREATE INDEX idx_token_models_model ON token_models(model_id);
CREATE INDEX idx_telemetry_ts ON telemetry(ts);
CREATE INDEX idx_telemetry_model_ts ON telemetry(model_id, ts);
CREATE INDEX idx_telemetry_token_ts ON telemetry(token_id, ts);
CREATE INDEX idx_usage_window ON usage(entity, window_start);
CREATE INDEX idx_audit_ts ON audit(ts);
