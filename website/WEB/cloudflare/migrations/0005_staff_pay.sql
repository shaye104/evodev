-- Add per-ticket pay (Robux) for staff earnings tracking.
-- This is also guarded at runtime via ensureStaffPaySchema, but keeping a migration helps keep DBs consistent.

ALTER TABLE staff_members ADD COLUMN pay_per_ticket INTEGER;

