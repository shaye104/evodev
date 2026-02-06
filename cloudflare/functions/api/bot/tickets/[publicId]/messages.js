const { jsonResponse, nowIso } = require('../../../../_lib/utils');
const { requireBotAuth } = require('../../../../_lib/bot');

exports.onRequestPost = async ({ env, request, params }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const discordId = body.discord_id;
  const message = String(body.message || '').trim();
  if (!discordId || !message) {
    return jsonResponse({ error: 'discord_id and message required' }, { status: 400 });
  }

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const user = await env.DB.prepare('SELECT * FROM users WHERE discord_id = ? LIMIT 1')
    .bind(discordId)
    .first();
  const now = nowIso();

  const result = await env.DB.prepare(
    `
    INSERT INTO ticket_messages (
      ticket_id, author_type, author_user_id, author_discord_id, body,
      source, created_at, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(ticket.id, 'user', user?.id || null, discordId, message, 'discord', now, null)
    .run();

  await env.DB.prepare('UPDATE tickets SET updated_at = ?, last_message_at = ? WHERE id = ?')
    .bind(now, now, ticket.id)
    .run();

  if (Array.isArray(body.attachments)) {
    for (const attachment of body.attachments) {
      await env.DB.prepare(
        `
        INSERT INTO ticket_attachments (
          ticket_message_id, filename, storage_url, mime_type, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        `
      )
        .bind(
          result.meta.last_row_id,
          attachment.filename || 'attachment',
          attachment.url || '',
          attachment.mime_type || '',
          attachment.size_bytes || 0,
          now
        )
        .run();
    }
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user?.id || null, discordId, 'user', 'ticket.reply', 'ticket', ticket.public_id, JSON.stringify({ source: 'discord' }), now)
    .run();

  return jsonResponse({ ok: true });
};
