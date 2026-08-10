CREATE TABLE IF NOT EXISTS admin_login_rate_limits (
  scope_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  blocked_until INTEGER NOT NULL DEFAULT 0 CHECK (blocked_until >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_login_rate_limits_updated
  ON admin_login_rate_limits(updated_at);
