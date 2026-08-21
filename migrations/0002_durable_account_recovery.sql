-- Nur für eine bereits mit der ersten schema.sql angelegte D1-Datenbank.
ALTER TABLE users ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);

CREATE TABLE IF NOT EXISTS learning_record_chunks (
  user_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  PRIMARY KEY (user_id, chunk_index),
  FOREIGN KEY (user_id) REFERENCES learning_records(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legacy_accounts (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_account_chunks (
  email TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  PRIMARY KEY (email, chunk_index),
  FOREIGN KEY (email) REFERENCES legacy_accounts(email) ON DELETE CASCADE
);
