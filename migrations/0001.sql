CREATE TABLE IF NOT EXISTS sync_events (
  event_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_events_site_received
ON sync_events(site_id, received_at DESC);

CREATE TABLE IF NOT EXISTS portal_members (
  member_key TEXT PRIMARY KEY,
  matricula TEXT NOT NULL,
  nome TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_members_pin
ON portal_members(pin_hash);
