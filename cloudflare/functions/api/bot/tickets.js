const { jsonResponse, nowIso } = require('../../_lib/utils');
const { requireBotAuth } = require('../../_lib/bot');
const { getDefaultStatusId, generatePublicId } = require('../../_lib/db');

async function ensureUser(env, discordId) {
  const existing = await env.DB.prepare('SELECT * FROM users WHERE discord_id = ? LIMIT 1')
    .bind(discordId)
    .first();
  if (existing) return existing;
  const now = nowIso();
  await env.DB.prepare(
    'INSERT INTO users (discord_id, created_at, updated_at) VALUES (?, ?, ?)'
  )
    .bind(discordId, now, now)
    .run();
  return env.DB.prepare('SELECT * FROM users WHERE discord_id = ? LIMIT 1')
    .bind(discordId)
    .first();
}

exports.onRequestPost = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const discordId = body.discord_id;
  const panelId = Number(body.panel_id || 0) || null;
  const message = String(body.message || '').trim();
  if (!discordId || !panelId || !message) {
    return jsonResponse({ error: 'discord_id, panel_id, message required' }, { status: 400 });
  }

  const user = await ensureUser(env, discordId);
  const now = nowIso();
  const publicId = await generatePublicId(env);
  const statusId = await getDefaultStatusId(env);

  const ticketResult = await env.DB.prepare(
    `
    INSERT INTO tickets (
      public_id, panel_id, status_id, creator_user_id, creator_discord_id,
      creator_email, subject, source, assigned_staff_id, created_at, updated_at,
      last_message_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(publicId, panelId, statusId, user?.id || null, discordId, body.email || '', body.subject || 'Discord ticket', 'discord', null, now, now, now)
    .run();

  const ticketId = ticketResult.meta.last_row_id;

  await env.DB.prepare(
    `
    INSERT INTO ticket_messages (
      ticket_id, author_type, author_user_id, author_discord_id, body,
      source, created_at, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(ticketId, 'user', user?.id || null, discordId, message, 'discord', now, null)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user?.id || null, discordId, 'user', 'ticket.created', 'ticket', publicId, JSON.stringify({ source: 'discord' }), now)
    .run();

  return jsonResponse({ public_id: publicId });
};
