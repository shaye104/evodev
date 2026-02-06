const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getDbPool, nowMysql } = require('../db');
const { CONFIG } = require('../config');

function toBool(value) {
  return value ? 1 : 0;
}

function cleanDbValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length === 0 ? null : str;
}

function buildAvatarUrl(discordId, avatar) {
  if (!discordId || !avatar) return '';
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
}

function generatePublicId() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function ensureUploadDir(ticketPublicId) {
  const safeId = String(ticketPublicId || '').replace(/[^A-Z0-9_-]/gi, '');
  const dir = path.join(CONFIG.UPLOAD_DIR, safeId);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

async function getUserById(userId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [
    userId,
  ]);
  return rows?.[0] || null;
}

async function getUserByDiscordId(discordId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
    [discordId]
  );
  return rows?.[0] || null;
}

async function upsertUserFromDiscord(profile) {
  const pool = await getDbPool();
  if (!pool) return null;
  const discordId = String(profile.id || '').trim();
  if (!discordId) return null;

  const username =
    profile.global_name ||
    profile.username ||
    profile.displayName ||
    '';
  const email = profile.email || '';
  const avatar = profile.avatar || '';
  const now = nowMysql();

  const [rows] = await pool.query(
    'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
    [discordId]
  );

  if (rows.length > 0) {
    await pool.query(
      'UPDATE users SET discord_username = ?, discord_avatar = ?, email = ?, updated_at = ? WHERE discord_id = ?',
      [cleanDbValue(username), cleanDbValue(avatar), cleanDbValue(email), now, discordId]
    );
  } else {
    await pool.query(
      'INSERT INTO users (discord_id, discord_username, discord_avatar, email, notifications_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        discordId,
        cleanDbValue(username),
        cleanDbValue(avatar),
        cleanDbValue(email),
        0,
        now,
        now,
      ]
    );
  }

  const [after] = await pool.query(
    'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
    [discordId]
  );
  const user = after?.[0] || null;
  if (user) {
    await pool.query('UPDATE staff_members SET user_id = ? WHERE discord_id = ?', [
      user.id,
      discordId,
    ]);
  }
  return user;
}

async function ensureUserFromDiscordUser(user) {
  const pool = await getDbPool();
  if (!pool) return null;
  const discordId = String(user.id || '').trim();
  if (!discordId) return null;
  const username = user.globalName || user.username || '';
  const avatar = user.avatar || '';
  const now = nowMysql();

  const [rows] = await pool.query(
    'SELECT id FROM users WHERE discord_id = ? LIMIT 1',
    [discordId]
  );

  if (rows.length > 0) {
    await pool.query(
      'UPDATE users SET discord_username = ?, discord_avatar = ?, updated_at = ? WHERE discord_id = ?',
      [cleanDbValue(username), cleanDbValue(avatar), now, discordId]
    );
  } else {
    await pool.query(
      'INSERT INTO users (discord_id, discord_username, discord_avatar, notifications_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [discordId, cleanDbValue(username), cleanDbValue(avatar), 0, now, now]
    );
  }

  const [after] = await pool.query(
    'SELECT * FROM users WHERE discord_id = ? LIMIT 1',
    [discordId]
  );
  return after?.[0] || null;
}

async function getStaffByUserId(userId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    `
    SELECT sm.*, sr.name AS role_name, sr.permissions, sr.is_admin
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.user_id = ? AND sm.is_active = 1
    LIMIT 1
    `,
    [userId]
  );
  return rows?.[0] || null;
}

async function getStaffByDiscordId(discordId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    `
    SELECT sm.*, sr.name AS role_name, sr.permissions, sr.is_admin
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.discord_id = ? AND sm.is_active = 1
    LIMIT 1
    `,
    [discordId]
  );
  return rows?.[0] || null;
}

async function listRoles() {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query('SELECT * FROM staff_roles ORDER BY name');
  return rows.map((row) => {
    let permissionsText = '';
    try {
      const perms = JSON.parse(row.permissions || '[]');
      permissionsText = Array.isArray(perms) ? perms.join(', ') : '';
    } catch {
      permissionsText = row.permissions || '';
    }
    return { ...row, permissions_text: permissionsText };
  });
}

async function createRole({ name, permissions, is_admin }) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  const [result] = await pool.query(
    'INSERT INTO staff_roles (name, permissions, is_admin, created_at) VALUES (?, ?, ?, ?)',
    [name, JSON.stringify(permissions || []), toBool(is_admin), now]
  );
  return result.insertId;
}

async function updateRole(roleId, { name, permissions, is_admin }) {
  const pool = await getDbPool();
  if (!pool) return;
  await pool.query(
    'UPDATE staff_roles SET name = ?, permissions = ?, is_admin = ? WHERE id = ?',
    [name, JSON.stringify(permissions || []), toBool(is_admin), roleId]
  );
}

async function listStaffMembers() {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    `
    SELECT sm.*, sr.name AS role_name, sr.is_admin, u.discord_username
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    LEFT JOIN users u ON sm.user_id = u.id
    ORDER BY sm.created_at DESC
    `
  );
  return rows;
}

async function createStaffMember({ discord_id, role_id, is_active }) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  const [result] = await pool.query(
    'INSERT INTO staff_members (discord_id, role_id, is_active, created_at) VALUES (?, ?, ?, ?)',
    [discord_id, role_id, toBool(is_active), now]
  );
  return result.insertId;
}

async function updateStaffMember(staffId, { role_id, is_active }) {
  const pool = await getDbPool();
  if (!pool) return;
  await pool.query(
    'UPDATE staff_members SET role_id = ?, is_active = ? WHERE id = ?',
    [role_id, toBool(is_active), staffId]
  );
}

async function listPanels({ includeInactive = false } = {}) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    `
    SELECT *
    FROM ticket_panels
    ${includeInactive ? '' : 'WHERE is_active = 1'}
    ORDER BY sort_order ASC, name ASC
    `
  );
  return rows;
}

async function createPanel({ name, description, is_active, sort_order }) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  const [result] = await pool.query(
    'INSERT INTO ticket_panels (name, description, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      name,
      description || '',
      toBool(is_active),
      Number(sort_order || 0),
      now,
      now,
    ]
  );
  return result.insertId;
}

async function updatePanel(panelId, { name, description, is_active, sort_order }) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    'UPDATE ticket_panels SET name = ?, description = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?',
    [
      name,
      description || '',
      toBool(is_active),
      Number(sort_order || 0),
      now,
      panelId,
    ]
  );
}

async function listStatuses() {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    'SELECT * FROM ticket_statuses ORDER BY sort_order ASC, name ASC'
  );
  return rows;
}

async function createStatus({
  name,
  slug,
  is_default_open,
  is_closed,
  sort_order,
}) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  if (is_default_open) {
    await pool.query('UPDATE ticket_statuses SET is_default_open = 0');
  }
  const [result] = await pool.query(
    'INSERT INTO ticket_statuses (name, slug, is_default_open, is_closed, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      name,
      slug,
      toBool(is_default_open),
      toBool(is_closed),
      Number(sort_order || 0),
      now,
    ]
  );
  return result.insertId;
}

async function updateStatus(statusId, payload) {
  const pool = await getDbPool();
  if (!pool) return;
  if (payload.is_default_open) {
    await pool.query('UPDATE ticket_statuses SET is_default_open = 0');
  }
  await pool.query(
    'UPDATE ticket_statuses SET name = ?, slug = ?, is_default_open = ?, is_closed = ?, sort_order = ? WHERE id = ?',
    [
      payload.name,
      payload.slug,
      toBool(payload.is_default_open),
      toBool(payload.is_closed),
      Number(payload.sort_order || 0),
      statusId,
    ]
  );
}

async function getDefaultStatusId() {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT id FROM ticket_statuses WHERE is_default_open = 1 ORDER BY id ASC LIMIT 1'
  );
  if (rows?.[0]) return rows[0].id;
  const [fallback] = await pool.query(
    'SELECT id FROM ticket_statuses ORDER BY id ASC LIMIT 1'
  );
  return fallback?.[0]?.id || null;
}

async function generateUniquePublicId(pool) {
  for (let i = 0; i < 5; i += 1) {
    const publicId = generatePublicId();
    const [rows] = await pool.query(
      'SELECT id FROM tickets WHERE public_id = ? LIMIT 1',
      [publicId]
    );
    if (rows.length === 0) return publicId;
  }
  return generatePublicId();
}

async function createTicket(payload) {
  const pool = await getDbPool();
  if (!pool) return null;
  const publicId = await generateUniquePublicId(pool);
  const statusId = payload.status_id || (await getDefaultStatusId());
  const now = nowMysql();
  const [result] = await pool.query(
    `
    INSERT INTO tickets (
      public_id, panel_id, status_id, creator_user_id, creator_discord_id,
      creator_email, subject, source, assigned_staff_id, created_at, updated_at,
      last_message_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      publicId,
      payload.panel_id || null,
      statusId,
      payload.creator_user_id || null,
      cleanDbValue(payload.creator_discord_id),
      cleanDbValue(payload.creator_email),
      cleanDbValue(payload.subject),
      payload.source || 'web',
      payload.assigned_staff_id || null,
      now,
      now,
      now,
    ]
  );
  return {
    id: result.insertId,
    public_id: publicId,
    status_id: statusId,
    created_at: now,
  };
}

async function getTicketByPublicId(publicId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed,
      sm.discord_id AS assigned_discord_id,
      u.discord_username AS assigned_username
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE t.public_id = ? LIMIT 1
    `,
    [publicId]
  );
  return rows?.[0] || null;
}

async function getTicketById(ticketId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT * FROM tickets WHERE id = ? LIMIT 1',
    [ticketId]
  );
  return rows?.[0] || null;
}

async function listTicketsForUser(userId) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    WHERE t.creator_user_id = ?
    ORDER BY t.last_message_at DESC
    `,
    [userId]
  );
  return rows;
}

async function listTicketsForStaff(filters = {}) {
  const pool = await getDbPool();
  if (!pool) return [];
  const clauses = [];
  const values = [];

  if (filters.status_id) {
    clauses.push('t.status_id = ?');
    values.push(filters.status_id);
  }
  if (filters.panel_id) {
    clauses.push('t.panel_id = ?');
    values.push(filters.panel_id);
  }
  if (filters.assigned_staff_id) {
    clauses.push('t.assigned_staff_id = ?');
    values.push(filters.assigned_staff_id);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed,
      sm.discord_id AS assigned_discord_id,
      u.discord_username AS assigned_username
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    ${where}
    ORDER BY t.last_message_at DESC
    `,
    values
  );
  return rows;
}

async function listActiveDiscordTickets(discordId) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    `
    SELECT t.*, s.is_closed
    FROM tickets t
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    WHERE t.creator_discord_id = ? AND t.source = 'discord' AND (s.is_closed = 0 OR s.is_closed IS NULL)
    ORDER BY t.last_message_at DESC
    `,
    [discordId]
  );
  return rows;
}

async function listTicketMessages(ticketId) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    `
    SELECT tm.*, u.discord_username AS author_username
    FROM ticket_messages tm
    LEFT JOIN users u ON tm.author_user_id = u.id
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
    `,
    [ticketId]
  );
  return rows;
}

async function getTicketMessageById(messageId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT * FROM ticket_messages WHERE id = ? LIMIT 1',
    [messageId]
  );
  return rows?.[0] || null;
}

async function listMessageAttachments(messageId) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    'SELECT * FROM ticket_attachments WHERE ticket_message_id = ?',
    [messageId]
  );
  return rows;
}

async function getAttachmentById(attachmentId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT * FROM ticket_attachments WHERE id = ? LIMIT 1',
    [attachmentId]
  );
  return rows?.[0] || null;
}

async function addTicketMessage(payload) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  const [result] = await pool.query(
    `
    INSERT INTO ticket_messages (
      ticket_id, author_type, author_user_id, author_discord_id, body,
      source, created_at, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.ticket_id,
      payload.author_type || 'user',
      payload.author_user_id || null,
      cleanDbValue(payload.author_discord_id),
      cleanDbValue(payload.body),
      payload.source || 'web',
      now,
      payload.parent_message_id || null,
    ]
  );

  await pool.query(
    'UPDATE tickets SET updated_at = ?, last_message_at = ? WHERE id = ?',
    [now, now, payload.ticket_id]
  );

  return {
    id: result.insertId,
    created_at: now,
  };
}

async function addAttachmentRecord({
  ticket_message_id,
  filename,
  storage_path,
  storage_url,
  mime_type,
  size_bytes,
}) {
  const pool = await getDbPool();
  if (!pool) return null;
  const now = nowMysql();
  const [result] = await pool.query(
    `
    INSERT INTO ticket_attachments (
      ticket_message_id, filename, storage_path, storage_url,
      mime_type, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      ticket_message_id,
      filename,
      storage_path || null,
      storage_url || null,
      mime_type || null,
      size_bytes || 0,
      now,
    ]
  );
  return result.insertId;
}

async function updateTicketStatus(ticketId, statusId, closedAt) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    'UPDATE tickets SET status_id = ?, updated_at = ?, closed_at = ? WHERE id = ?',
    [statusId, now, closedAt || null, ticketId]
  );
}

async function assignTicket(ticketId, staffId) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    'UPDATE tickets SET assigned_staff_id = ?, updated_at = ? WHERE id = ?',
    [staffId || null, now, ticketId]
  );
}

async function addClaimRecord(ticketId, staffId, action) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    'INSERT INTO ticket_claims (ticket_id, staff_id, action, created_at) VALUES (?, ?, ?, ?)',
    [ticketId, staffId, action, now]
  );
}

async function logAudit({
  actor_user_id,
  actor_discord_id,
  actor_type,
  action,
  entity_type,
  entity_id,
  metadata,
}) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      actor_user_id || null,
      cleanDbValue(actor_discord_id),
      actor_type || 'system',
      action,
      entity_type,
      String(entity_id || ''),
      metadata ? JSON.stringify(metadata) : null,
      now,
    ]
  );
}

async function listAuditLogs(limit = 100) {
  const pool = await getDbPool();
  if (!pool) return [];
  const [rows] = await pool.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?',
    [Number(limit || 100)]
  );
  return rows;
}

async function getTicketStatusById(statusId) {
  const pool = await getDbPool();
  if (!pool) return null;
  const [rows] = await pool.query(
    'SELECT * FROM ticket_statuses WHERE id = ? LIMIT 1',
    [statusId]
  );
  return rows?.[0] || null;
}

async function toggleUserNotifications(userId, enabled) {
  const pool = await getDbPool();
  if (!pool) return;
  const now = nowMysql();
  await pool.query(
    'UPDATE users SET notifications_enabled = ?, updated_at = ? WHERE id = ?',
    [toBool(enabled), now, userId]
  );
}

module.exports = {
  buildAvatarUrl,
  ensureUploadDir,
  getUserById,
  getUserByDiscordId,
  upsertUserFromDiscord,
  ensureUserFromDiscordUser,
  getStaffByUserId,
  getStaffByDiscordId,
  listRoles,
  createRole,
  updateRole,
  listStaffMembers,
  createStaffMember,
  updateStaffMember,
  listPanels,
  createPanel,
  updatePanel,
  listStatuses,
  createStatus,
  updateStatus,
  getDefaultStatusId,
  createTicket,
  getTicketByPublicId,
  getTicketById,
  listTicketsForUser,
  listTicketsForStaff,
  listActiveDiscordTickets,
  listTicketMessages,
  getTicketMessageById,
  listMessageAttachments,
  getAttachmentById,
  addTicketMessage,
  addAttachmentRecord,
  updateTicketStatus,
  assignTicket,
  addClaimRecord,
  logAudit,
  listAuditLogs,
  getTicketStatusById,
  toggleUserNotifications,
};
