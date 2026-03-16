-- Add role color customization
--
-- Note: We intentionally do NOT ALTER staff_roles here.
-- The app applies these columns via a runtime schema ensure to avoid
-- migration failures on databases where the columns may already exist.

-- Saved ticket transcripts (snapshots)
CREATE TABLE IF NOT EXISTS ticket_transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  ticket_public_id TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'json',
  content TEXT NOT NULL,
  trigger TEXT,
  created_by_actor_type TEXT,
  created_by_user_id INTEGER,
  created_by_staff_id INTEGER,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket_id ON ticket_transcripts (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket_public_id ON ticket_transcripts (ticket_public_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_created_at ON ticket_transcripts (created_at);
