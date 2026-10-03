-- Response cache, provider cached-token telemetry, capability routing, and backup-era columns.

ALTER TABLE models ADD COLUMN cache_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE routes ADD COLUMN capabilities TEXT;
ALTER TABLE routes ADD COLUMN max_context INTEGER;
ALTER TABLE routes ADD COLUMN cached_input_cost_per_m REAL;

ALTER TABLE telemetry ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telemetry ADD COLUMN saved_cost REAL NOT NULL DEFAULT 0;

ALTER TABLE usage ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage ADD COLUMN saved_cost REAL NOT NULL DEFAULT 0;

CREATE TABLE cache_stats (
    window_start INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    misses INTEGER NOT NULL DEFAULT 0,
    coalesced INTEGER NOT NULL DEFAULT 0,
    saved_cost REAL NOT NULL DEFAULT 0,
    saved_tokens_in INTEGER NOT NULL DEFAULT 0,
    saved_tokens_out INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (window_start, model_id)
);
