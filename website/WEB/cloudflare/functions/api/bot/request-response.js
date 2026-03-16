import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';
import { ensureTicketNotificationStateSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  await ensureTicketNotificationStateSchema(env);

  // Requests are signaled by ticket_notification_state.last_request_response_at.
  // We return those that have not yet been "acknowledged" by the bot.
  // This is intentionally simple and migration-free.
  const url = new URL(request.url);
  const since = String(url.searchParams.get('since') || '').trim();

  // If since is provided, only return requests after that timestamp.
  const rows = since
    ? await env.DB.prepare(
        `
        SELECT
          ns.ticket_id,
          ns.recipient_discord_id,
          ns.last_request_response_at,
          t.public_id,
          t.creator_discord_id,
          (
            SELECT MAX(created_at)
            FROM ticket_messages tm
            WHERE tm.ticket_id = t.id AND tm.author_type = 'user'
          ) AS last_user_message_at,
          (
            SELECT COALESCE(sm.nickname, u.discord_username, u.email, 'Staff')
            FROM audit_logs al
            LEFT JOIN staff_members sm
              ON sm.id = CAST(json_extract(al.metadata, '$.by_staff_id') AS INTEGER)
            LEFT JOIN users u ON u.id = sm.user_id
            WHERE al.action = 'ticket.request_response'
              AND al.entity_type = 'ticket'
              AND al.entity_id = t.public_id
            ORDER BY al.created_at DESC
            LIMIT 1
          ) AS requested_by_name
        FROM ticket_notification_state ns
        JOIN tickets t ON t.id = ns.ticket_id
        WHERE ns.last_request_response_at IS NOT NULL
          AND ns.last_request_response_at > ?
        ORDER BY ns.last_request_response_at ASC
        LIMIT 100
        `
      )
        .bind(since)
        .all()
    : await env.DB.prepare(
        `
        SELECT
          ns.ticket_id,
          ns.recipient_discord_id,
          ns.last_request_response_at,
          t.public_id,
          t.creator_discord_id,
          (
            SELECT MAX(created_at)
            FROM ticket_messages tm
            WHERE tm.ticket_id = t.id AND tm.author_type = 'user'
          ) AS last_user_message_at,
          (
            SELECT COALESCE(sm.nickname, u.discord_username, u.email, 'Staff')
            FROM audit_logs al
            LEFT JOIN staff_members sm
              ON sm.id = CAST(json_extract(al.metadata, '$.by_staff_id') AS INTEGER)
            LEFT JOIN users u ON u.id = sm.user_id
            WHERE al.action = 'ticket.request_response'
              AND al.entity_type = 'ticket'
              AND al.entity_id = t.public_id
            ORDER BY al.created_at DESC
            LIMIT 1
          ) AS requested_by_name
        FROM ticket_notification_state ns
        JOIN tickets t ON t.id = ns.ticket_id
        WHERE ns.last_request_response_at IS NOT NULL
        ORDER BY ns.last_request_response_at ASC
        LIMIT 100
        `
      ).all();

  return jsonResponse({ requests: rows.results || [] });
};
