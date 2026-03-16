import { jsonResponse } from '../../../_lib/utils.js';
import { requireBotAuth } from '../../../_lib/bot.js';
import { ensureTicketNotificationStateSchema } from '../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  await ensureTicketNotificationStateSchema(env);

  const ticketId = Number(params.ticketId || 0) || 0;
  if (!ticketId) return jsonResponse({ error: 'Invalid ticket id' }, { status: 400 });

  // Acknowledge by clearing the request timestamp.
  await env.DB.prepare(
    'UPDATE ticket_notification_state SET last_request_response_at = NULL WHERE ticket_id = ?'
  )
    .bind(ticketId)
    .run();

  return jsonResponse({ ok: true });
};

