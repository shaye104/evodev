CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  discord_avatar TEXT,
  email TEXT,
  notifications_enabled INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  permissions TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS staff_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  discord_id TEXT UNIQUE,
  role_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  slug TEXT UNIQUE,
  is_default_open INTEGER DEFAULT 0,
  is_closed INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE,
  panel_id INTEGER,
  status_id INTEGER,
  creator_user_id INTEGER,
  creator_discord_id TEXT,
  creator_email TEXT,
  subject TEXT,
  source TEXT,
  assigned_staff_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  closed_at TEXT,
  last_message_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER,
  author_type TEXT,
  author_user_id INTEGER,
  author_discord_id TEXT,
  body TEXT,
  source TEXT,
  created_at TEXT,
  parent_message_id INTEGER
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_message_id INTEGER,
  filename TEXT,
  storage_path TEXT,
  storage_url TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER,
  staff_id INTEGER,
  action TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_discord_id TEXT,
  actor_type TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  metadata TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_members_role_id ON staff_members (role_id);
CREATE INDEX IF NOT EXISTS idx_ticket_panels_active ON ticket_panels (is_active);
CREATE INDEX IF NOT EXISTS idx_ticket_statuses_default ON ticket_statuses (is_default_open);
CREATE INDEX IF NOT EXISTS idx_tickets_status_id ON tickets (status_id);
CREATE INDEX IF NOT EXISTS idx_tickets_panel_id ON tickets (panel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_creator_user_id ON tickets (creator_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_staff_id ON tickets (assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_tickets_last_message_at ON tickets (last_message_at);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_claims_ticket_id ON ticket_claims (ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

INSERT OR IGNORE INTO staff_roles (name, permissions, is_admin, created_at)
VALUES ('Admin', '["*"]', 1, datetime('now'));
INSERT OR IGNORE INTO staff_roles (name, permissions, is_admin, created_at)
VALUES ('Agent', '["tickets.view","tickets.reply","tickets.claim","tickets.assign","tickets.status"]', 0, datetime('now'));

INSERT OR IGNORE INTO ticket_statuses (name, slug, is_default_open, is_closed, sort_order, created_at)
VALUES ('Open', 'open', 1, 0, 1, datetime('now'));
INSERT OR IGNORE INTO ticket_statuses (name, slug, is_default_open, is_closed, sort_order, created_at)
VALUES ('Pending', 'pending', 0, 0, 2, datetime('now'));
INSERT OR IGNORE INTO ticket_statuses (name, slug, is_default_open, is_closed, sort_order, created_at)
VALUES ('Closed', 'closed', 0, 1, 3, datetime('now'));
