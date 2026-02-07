import { nowIso, randomId } from './utils.js';

async function ensurePanelRoleAccessSchema(env) {
  // Keep runtime resilient even if migrations weren't applied yet.
  // Safe to call multiple times.
  await env.DB.prepare(
    `
    CREATE TABLE IF NOT EXISTS ticket_panel_role_access (
      panel_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      created_at TEXT,
      PRIMARY KEY (panel_id, role_id)
    )
    `
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ticket_panel_role_access_panel_id ON ticket_panel_role_access (panel_id)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ticket_panel_role_access_role_id ON ticket_panel_role_access (role_id)'
  ).run();
}

async function getUserById(env, id) {
  if (!id) return null;
  return env.DB.prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(id)
    .first();
}

async function getUserByDiscordId(env, discordId) {
  if (!discordId) return null;
  return env.DB.prepare('SELECT * FROM users WHERE discord_id = ? LIMIT 1')
    .bind(discordId)
    .first();
}

async function upsertUserFromDiscord(env, profile) {
  if (!profile?.id) return null;
  const existing = await getUserByDiscordId(env, profile.id);
  const now = nowIso();
  const username = profile.global_name || profile.username || '';
  const avatar = profile.avatar || '';
  const email = profile.email || '';
  if (existing) {
    await env.DB.prepare(
      'UPDATE users SET discord_username = ?, discord_avatar = ?, email = ?, updated_at = ? WHERE id = ?'
    )
      .bind(username, avatar, email, now, existing.id)
      .run();
    return getUserById(env, existing.id);
  }

  await env.DB.prepare(
    'INSERT INTO users (discord_id, discord_username, discord_avatar, email, notifications_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(profile.id, username, avatar, email, 0, now, now)
    .run();
  return getUserByDiscordId(env, profile.id);
}

async function getStaffByUserId(env, userId) {
  if (!userId) return null;
  return env.DB.prepare(
    `
    SELECT sm.*, sr.name AS role_name, sr.permissions, sr.is_admin
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.user_id = ? AND sm.is_active = 1
    LIMIT 1
    `
  )
    .bind(userId)
    .first();
}

async function getStaffByDiscordId(env, discordId) {
  if (!discordId) return null;
  return env.DB.prepare(
    `
    SELECT sm.*, sr.name AS role_name, sr.permissions, sr.is_admin
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.discord_id = ? AND sm.is_active = 1
    LIMIT 1
    `
  )
    .bind(discordId)
    .first();
}

async function ensureAdminSeed(env) {
  const adminList = (env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);
  if (adminList.length === 0) return;
  const adminRole = await env.DB.prepare('SELECT id FROM staff_roles WHERE name = ? LIMIT 1')
    .bind('Admin')
    .first();
  if (!adminRole) return;
  const now = nowIso();
  for (const discordId of adminList) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO users (discord_id, created_at, updated_at) VALUES (?, ?, ?)'
    )
      .bind(discordId, now, now)
      .run();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO staff_members (discord_id, role_id, is_active, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(discordId, adminRole.id, 1, now)
      .run();
    const user = await getUserByDiscordId(env, discordId);
    if (user) {
      await env.DB.prepare('UPDATE staff_members SET user_id = ? WHERE discord_id = ?')
        .bind(user.id, discordId)
        .run();
    }
  }
}

async function getDefaultStatusId(env) {
  const row = await env.DB.prepare(
    'SELECT id FROM ticket_statuses WHERE is_default_open = 1 LIMIT 1'
  ).first();
  if (row?.id) return row.id;
  const fallback = await env.DB.prepare(
    'SELECT id FROM ticket_statuses ORDER BY id ASC LIMIT 1'
  ).first();
  return fallback?.id || null;
}

async function generatePublicId(env) {
  for (let i = 0; i < 5; i += 1) {
    const id = randomId(8);
    const row = await env.DB.prepare('SELECT id FROM tickets WHERE public_id = ? LIMIT 1')
      .bind(id)
      .first();
    if (!row) return id;
  }
  return randomId(8);
}

export {
  getUserById,
  getUserByDiscordId,
  upsertUserFromDiscord,
  getStaffByUserId,
  getStaffByDiscordId,
  ensureAdminSeed,
  getDefaultStatusId,
  generatePublicId,
  ensurePanelRoleAccessSchema,
  staffCanAccessPanel,
  getAccessiblePanelsForStaff,
};

async function staffCanAccessPanel(env, staff, panelId) {
  if (!staff) return false;
  if (staff.is_admin) return true;
  if (!panelId) return true;

  try {
    await ensurePanelRoleAccessSchema(env);
  } catch {
    // If schema can't be ensured for some reason, treat as unrestricted.
    return true;
  }

  // No rows => unrestricted for staff.
  const isRestricted = await env.DB.prepare(
    'SELECT 1 FROM ticket_panel_role_access WHERE panel_id = ? LIMIT 1'
  )
    .bind(panelId)
    .first();
  if (!isRestricted) return true;

  const allowed = await env.DB.prepare(
    'SELECT 1 FROM ticket_panel_role_access WHERE panel_id = ? AND role_id = ? LIMIT 1'
  )
    .bind(panelId, staff.role_id)
    .first();

  return Boolean(allowed);
}

async function getAccessiblePanelsForStaff(env, staff) {
  if (!staff) return [];
  if (staff.is_admin) {
    const results = await env.DB.prepare(
      'SELECT * FROM ticket_panels WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    ).all();
    return results.results || [];
  }

  try {
    await ensurePanelRoleAccessSchema(env);
  } catch {
    const results = await env.DB.prepare(
      'SELECT * FROM ticket_panels WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
    ).all();
    return results.results || [];
  }

  const results = await env.DB.prepare(
    `
    SELECT p.*
    FROM ticket_panels p
    WHERE p.is_active = 1 AND (
      NOT EXISTS (
        SELECT 1 FROM ticket_panel_role_access a
        WHERE a.panel_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM ticket_panel_role_access a
        WHERE a.panel_id = p.id AND a.role_id = ?
      )
    )
    ORDER BY p.sort_order ASC, p.name ASC
    `
  )
    .bind(staff.role_id)
    .all();
  return results.results || [];
}
