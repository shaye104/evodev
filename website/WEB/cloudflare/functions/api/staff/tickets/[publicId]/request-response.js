import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import { staffCanAccessPanel, ensureTicketNotificationStateSchema } from '../../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) || requireApiPermission(staff, 'tickets.request_response');
  if (guard) return guard;

  await ensureTicketNotificationStateSchema(env);

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const creatorDiscordId = String(ticket.creator_discord_id || '').trim();
  if (!creatorDiscordId) {
    return jsonResponse({ error: 'Ticket has no Discord recipient' }, { status: 400 });
  }

  const now = nowIso();
  const cooldownMs = 30 * 60 * 1000;
  const state = await env.DB.prepare(
    `
    SELECT last_request_response_at
    FROM ticket_notification_state
    WHERE ticket_id = ? AND recipient_discord_id = ?
    LIMIT 1
    `
  )
    .bind(ticket.id, creatorDiscordId)
    .first();

  const lastAt = state?.last_request_response_at ? Date.parse(state.last_request_response_at) : 0;
  const nowMs = Date.now();
  if (lastAt && nowMs - lastAt < cooldownMs) {
    const retryAfterSeconds = Math.ceil((cooldownMs - (nowMs - lastAt)) / 1000);
    return jsonResponse(
      { error: 'Request response is on cooldown', retry_after_seconds: retryAfterSeconds },
      { status: 429 }
    );
  }

  // Update state so the bot can pick it up, and so cooldown is enforced without migrations.
  await env.DB.prepare(
    `
    INSERT INTO ticket_notification_state (
      ticket_id, recipient_discord_id, recipient_user_id,
      last_request_response_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(ticket_id, recipient_discord_id) DO UPDATE SET
      recipient_user_id = excluded.recipient_user_id,
      last_request_response_at = excluded.last_request_response_at
    `
  )
    .bind(ticket.id, creatorDiscordId, ticket.creator_user_id || null, now)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      user.id,
      user.discord_id,
      'staff',
      'ticket.request_response',
      'ticket',
      ticket.public_id,
      JSON.stringify({ by_staff_id: staff.id }),
      now
    )
    .run();

  return jsonResponse({ ok: true });
};

