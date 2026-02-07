-- Panel role access control (staff visibility)
-- If a panel has no rows in ticket_panel_role_access, it is visible to all staff.

CREATE TABLE IF NOT EXISTS ticket_panel_role_access (
  panel_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  created_at TEXT,
  PRIMARY KEY (panel_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_panel_role_access_panel_id
  ON ticket_panel_role_access (panel_id);

CREATE INDEX IF NOT EXISTS idx_ticket_panel_role_access_role_id
  ON ticket_panel_role_access (role_id);

