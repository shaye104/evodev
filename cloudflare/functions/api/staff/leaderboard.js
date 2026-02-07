import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../_lib/api.js';
import { ensureStaffPaySchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.view');
  if (guard) return guard;

  try {
    await ensureStaffPaySchema(env);
  } catch {}

  // "Same group" is interpreted as staff with the same role.
  const roleId = staff.role_id || null;

  const rows = await env.DB.prepare(
    `
    SELECT
      sm.id AS staff_id,
      sm.discord_id AS discord_id,
      sm.role_id AS role_id,
      sm.pay_per_ticket AS pay_per_ticket,
      COALESCE(u.discord_username, sm.discord_id) AS display_name,
      COUNT(DISTINCT tm.ticket_id) AS answered_tickets
    FROM staff_members sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN ticket_messages tm
      ON tm.author_type = 'staff'
      AND strftime('%Y-%m', tm.created_at) = strftime('%Y-%m', 'now')
      AND (
        (sm.user_id IS NOT NULL AND tm.author_user_id = sm.user_id)
        OR (tm.author_discord_id IS NOT NULL AND tm.author_discord_id = sm.discord_id)
      )
    WHERE sm.is_active = 1
      AND (? IS NULL OR sm.role_id = ?)
    GROUP BY sm.id
    ORDER BY answered_tickets DESC, display_name ASC
    `
  )
    .bind(roleId, roleId)
    .all();

  const myAnswered = rows.results?.find((r) => String(r.staff_id) === String(staff.id))?.answered_tickets || 0;

  const myClaimsRow = await env.DB.prepare(
    `
    SELECT COUNT(DISTINCT tc.ticket_id) AS claimed_tickets
    FROM ticket_claims tc
    WHERE tc.staff_id = ?
      AND tc.action = 'claim'
      AND strftime('%Y-%m', tc.created_at) = strftime('%Y-%m', 'now')
    `
  )
    .bind(staff.id)
    .first();

  const claimedTickets = Number(myClaimsRow?.claimed_tickets || 0) || 0;
  const payPerTicket = Number(staff.pay_per_ticket || 0) || 0;
  const earnings = claimedTickets * payPerTicket;

  return jsonResponse({
    month: new Date().toISOString().slice(0, 7),
    group: { role_id: roleId },
    leaderboard: rows.results || [],
    me: {
      staff_id: staff.id,
      display_name: staff.discord_username || staff.discord_id || 'You',
      pay_per_ticket: payPerTicket,
      claimed_tickets: claimedTickets,
      answered_tickets: Number(myAnswered) || 0,
      earnings,
      currency: 'R$',
    },
  });
};

