import { jsonResponse } from '../../../_lib/utils.js';
import { requireBotAuth } from '../../../_lib/bot.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const discordId = url.searchParams.get('discord_id');
  if (!discordId) return jsonResponse({ error: 'discord_id required' }, { status: 400 });

  const results = await env.DB.prepare(
    `
    SELECT t.*, s.is_closed
    FROM tickets t
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    WHERE t.creator_discord_id = ? AND t.source = 'discord' AND (s.is_closed = 0 OR s.is_closed IS NULL)
    ORDER BY t.last_message_at DESC
    `
  )
    .bind(discordId)
    .all();

  return jsonResponse({ tickets: results.results || [] });
};
