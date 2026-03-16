import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';

// Returns new user messages on tickets that are currently claimed/assigned to a staff member.
// The Discord bot uses this to DM the claiming staff member when a user replies.
export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const sinceId = Number(url.searchParams.get('since_id') || 0) || 0;

  const results = await env.DB.prepare(
    `
    SELECT
      tm.*,
      t.public_id,
      t.assigned_staff_id,
      COALESCE(u.discord_username, u.email, t.creator_email, t.creator_discord_id, 'User') AS author_name,
      COALESCE(asg.discord_id, asu.discord_id) AS staff_discord_id,
      COALESCE(asm.nickname, asu.discord_username, asu.email, 'Staff') AS staff_name
    FROM ticket_messages tm
    JOIN tickets t ON tm.ticket_id = t.id
    LEFT JOIN users u ON u.id = tm.author_user_id
    LEFT JOIN staff_members asg ON asg.id = t.assigned_staff_id
    LEFT JOIN users asu ON asu.id = asg.user_id
    LEFT JOIN staff_members asm ON asm.user_id = asg.user_id
    WHERE tm.author_type = 'user'
      AND tm.id > ?
      AND t.assigned_staff_id IS NOT NULL
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

  const messageIds = messages.map((m) => m.id);
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
