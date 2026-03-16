-- Staff notifications + pay adjustments (bonuses)

CREATE TABLE IF NOT EXISTS staff_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_notifications_staff_id ON staff_notifications (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_read_at ON staff_notifications (read_at);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_created_at ON staff_notifications (created_at);

CREATE TABLE IF NOT EXISTS staff_pay_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_by_user_id INTEGER,
  created_by_staff_id INTEGER,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_pay_adjustments_staff_id ON staff_pay_adjustments (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_pay_adjustments_created_at ON staff_pay_adjustments (created_at);

