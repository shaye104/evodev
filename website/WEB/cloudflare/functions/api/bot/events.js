import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const sinceId = Number(url.searchParams.get('since_id') || 0) || 0;

  const rows = await env.DB.prepare(
    `
    SELECT
      al.id,
      al.action,
      al.entity_id AS public_id,
      al.metadata,
      al.created_at,
      t.panel_id AS current_panel_id,
      p.name AS current_panel_name,
      t.creator_discord_id,
      COALESCE(ou.discord_username, ou.email, t.creator_email, t.creator_discord_id, 'User') AS opened_by_name,
      COALESCE(sm.nickname, su.discord_username, su.email, 'Staff') AS actor_name,
      COALESCE(asm.nickname, asu.discord_username, asu.email, NULL) AS claimed_by_name,
      tp_to.name AS to_panel_name
    FROM audit_logs al
    LEFT JOIN tickets t ON t.public_id = al.entity_id
    LEFT JOIN ticket_panels p ON p.id = t.panel_id
    LEFT JOIN users ou ON ou.id = t.creator_user_id
    LEFT JOIN users su ON su.id = al.actor_user_id
    LEFT JOIN staff_members sm ON sm.user_id = al.actor_user_id
    LEFT JOIN staff_members asg ON asg.id = t.assigned_staff_id
    LEFT JOIN users asu ON asu.id = asg.user_id
    LEFT JOIN staff_members asm ON asm.user_id = asg.user_id
    LEFT JOIN ticket_panels tp_to ON tp_to.id = CAST(json_extract(al.metadata, '$.to_panel_id') AS INTEGER)
    WHERE al.id > ?
      AND al.entity_type = 'ticket'
      AND al.action IN ('ticket.created', 'ticket.escalate', 'ticket.claim', 'ticket.unclaim')
    ORDER BY al.id ASC
    LIMIT 200
    `
  )
    .bind(sinceId)
    .all();

  const events = (rows.results || []).map((r) => {
    const claimedBy = r.claimed_by_name ? String(r.claimed_by_name) : 'Nobody';
    return {
      id: Number(r.id || 0) || 0,
      action: r.action,
      public_id: r.public_id,
      created_at: r.created_at,
      creator_discord_id: r.creator_discord_id || null,
      opened_by_name: r.opened_by_name,
      actor_name: r.actor_name,
      panel_name: r.current_panel_name,
      claimed_by_name: claimedBy,
      to_panel_name: r.to_panel_name || null,
    };
  });

  return jsonResponse({ events });
};
