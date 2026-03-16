-- Add staff nickname support (used for display names across UI + bot events).
-- Safe to run once via migrations.

ALTER TABLE staff_members ADD COLUMN nickname TEXT;

