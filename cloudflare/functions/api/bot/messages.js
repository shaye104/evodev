import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const sinceId = Number(url.searchParams.get('since_id') || 0) || 0;

  const results = await env.DB.prepare(
    `
    SELECT tm.*, t.public_id, t.creator_discord_id
    FROM ticket_messages tm
    JOIN tickets t ON tm.ticket_id = t.id
    WHERE t.source = 'discord'
      AND tm.author_type = 'staff'
      AND tm.id > ?
    ORDER BY tm.id ASC
    LIMIT 200
    `
  )
    .bind(sinceId)
    .all();

  const messages = results.results || [];
  if (!messages.length) {
    return jsonResponse({ messages: [], attachments: [] });
  }

  const messageIds = messages.map((msg) => msg.id);
  const placeholders = messageIds.map(() => '?').join(',');
  const attachments = await env.DB.prepare(
    `SELECT * FROM ticket_attachments WHERE ticket_message_id IN (${placeholders})`
  )
    .bind(...messageIds)
    .all();

  return jsonResponse({
    messages,
    attachments: attachments.results || [],
  });
};
