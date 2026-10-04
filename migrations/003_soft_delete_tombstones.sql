-- Free soft-deleted names and token hashes so deleted records no longer block reuse.

UPDATE models
SET name = name || ' [deleted ' || id || ']'
WHERE deleted_at IS NOT NULL AND name NOT LIKE '% [deleted ' || id || ']';

UPDATE providers
SET name = name || ' [deleted ' || id || ']'
WHERE deleted_at IS NOT NULL AND name NOT LIKE '% [deleted ' || id || ']';

UPDATE tokens
SET key_hash = key_hash || ':deleted:' || id
WHERE deleted_at IS NOT NULL AND key_hash NOT LIKE '%:deleted:' || id;
