-- Security and ops hardening: password rotation tracking.
-- schema_migrations.checksum is added by the runner itself for pre-existing databases.

ALTER TABLE admin ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0;
