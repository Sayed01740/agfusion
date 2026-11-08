CREATE TABLE IF NOT EXISTS arc_quote_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
  account TEXT NOT NULL CHECK (length(account) = 42),
  chain_id INTEGER NOT NULL CHECK (chain_id = 5042),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS arc_quote_sessions_expires_at_idx
  ON arc_quote_sessions (expires_at);

CREATE INDEX IF NOT EXISTS arc_quote_sessions_account_expires_at_idx
  ON arc_quote_sessions (account, expires_at);
