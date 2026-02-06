const { jsonResponse, parseFormData, nowIso } = require('../_lib/utils');
const { getUserContext } = require('../_lib/auth');
const { requireApiUser } = require('../_lib/api');
const { getDefaultStatusId, generatePublicId } = require('../_lib/db');
const { storeAttachments } = require('../_lib/attachments');

exports.onRequestGet = async ({ env, request }) => {
  const { user } = await getUserContext(env, request);
  const guard = requireApiUser(user);
  if (guard) return guard;

  const tickets = await env.DB.prepare(
    `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    WHERE t.creator_user_id = ?
    ORDER BY t.last_message_at DESC
    `
  )
    .bind(user.id)
    .all();

  return jsonResponse({ tickets: tickets.results || [] });
};

exports.onRequestPost = async ({ env, request }) => {
  const { user } = await getUserContext(env, request);
  const guard = requireApiUser(user);
  if (guard) return guard;

  const form = await parseFormData(request);
  if (!form) {
    return jsonResponse({ error: 'Expected form data' }, { status: 400 });
  }

  const panelId = Number(form.get('panel_id') || 0) || null;
  const subject = String(form.get('subject') || '').trim();
  const email = String(form.get('email') || '').trim();
  const message = String(form.get('message') || '').trim();
  const notifications = form.get('notifications_enabled') === '1';

  if (!panelId || !subject || !email || !message) {
    return jsonResponse({ error: 'Missing fields' }, { status: 400 });
  }

  const now = nowIso();
  const publicId = await generatePublicId(env);
  const statusId = await getDefaultStatusId(env);

  const result = await env.DB.prepare(
    `
    INSERT INTO tickets (
      public_id, panel_id, status_id, creator_user_id, creator_discord_id,
      creator_email, subject, source, assigned_staff_id, created_at, updated_at,
      last_message_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      publicId,
      panelId,
      statusId,
      user.id,
      user.discord_id,
      email,
      subject,
      'web',
      null,
      now,
      now,
      now
    )
    .run();

  const ticketId = result.meta.last_row_id;

  const msgResult = await env.DB.prepare(
    `
    INSERT INTO ticket_messages (
      ticket_id, author_type, author_user_id, author_discord_id, body,
      source, created_at, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(ticketId, 'user', user.id, user.discord_id, message, 'web', now, null)
    .run();

  const files = form.getAll('attachments').filter((file) => file && file.size);
  await storeAttachments(env, publicId, msgResult.meta.last_row_id, files);

  await env.DB.prepare(
    'UPDATE users SET notifications_enabled = ?, updated_at = ? WHERE id = ?'
  )
    .bind(notifications ? 1 : 0, now, user.id)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(user.id, user.discord_id, 'user', 'ticket.created', 'ticket', publicId, JSON.stringify({ source: 'web' }), now)
    .run();

  return jsonResponse({ public_id: publicId });
};
