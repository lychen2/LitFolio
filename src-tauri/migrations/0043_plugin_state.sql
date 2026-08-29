-- Plugin host registry state. The host owns enable/disable authority and a
-- monotonic per-plugin generation: every enable bumps the generation, and
-- bindings issued for an older generation are stale by definition.
CREATE TABLE plugin_state (
    plugin_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    generation INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
