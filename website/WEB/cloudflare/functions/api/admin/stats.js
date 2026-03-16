import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext, hasPermission } from '../../_lib/auth.js';
import { requireApiStaff } from '../../_lib/api.js';
import {
  ensureStaffPayAdjustmentsSchema,
  ensureStaffPaySchema,
} from '../../_lib/db.js';

const parsePermissions = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  }
};

const hasAdminUiAccess = (staff) => {
  if (!staff) return false;
  if (staff.is_admin) return true;
  const perms = parsePermissions(staff.permissions);
  if (perms.includes('*')) return true;
  if (perms.includes('staff.manage_pay')) return true;
  return perms.some((p) => String(p || '').startsWith('admin.'));
};

const safeJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;
  if (!hasAdminUiAccess(staff)) return jsonResponse({ error: 'Forbidden' }, { status: 403 });

  try {
    await ensureStaffPaySchema(env);
  } catch {}
  try {
    await ensureStaffPayAdjustmentsSchema(env);
  } catch {}

  const month = new Date().toISOString().slice(0, 7);

  const ticketsTotals = await env.DB.prepare(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN s.is_closed = 0 THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN s.is_closed = 1 THEN 1 ELSE 0 END) AS closed,
      SUM(CASE WHEN strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS created_month,
      SUM(CASE WHEN t.closed_at IS NOT NULL AND strftime('%Y-%m', t.closed_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) AS closed_month
    FROM tickets t
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    `
  ).first();

  const byStatus = await env.DB.prepare(
    `
    SELECT
      s.id AS status_id,
      s.name AS status_name,
      s.is_closed AS is_closed,
      COUNT(t.id) AS total
    FROM ticket_statuses s
    LEFT JOIN tickets t ON t.status_id = s.id
    GROUP BY s.id
    ORDER BY s.sort_order ASC, s.id ASC
    `
  ).all();

  const byPanel = await env.DB.prepare(
    `
    SELECT
      p.id AS panel_id,
      p.name AS panel_name,
      p.is_active AS panel_active,
      COUNT(t.id) AS total,
      SUM(CASE WHEN s.is_closed = 0 THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN s.is_closed = 1 THEN 1 ELSE 0 END) AS closed
    FROM ticket_panels p
    LEFT JOIN tickets t ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    GROUP BY p.id
    ORDER BY open DESC, total DESC, panel_name ASC
    `
  ).all();

  const escalationRows = await env.DB.prepare(
    `
    SELECT entity_id AS ticket_public_id, metadata, created_at
    FROM audit_logs
    WHERE action = 'ticket.escalate'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    ORDER BY created_at ASC
    `
  ).all();

  const escalationByTo = new Map();
  const escalationByFrom = new Map();
  const escalationRoutes = new Map();
  const escalatedTicketsSet = new Set();

  (escalationRows.results || []).forEach((row) => {
    if (row?.ticket_public_id) escalatedTicketsSet.add(String(row.ticket_public_id));
    const meta = safeJson(row?.metadata) || {};
    const fromId = Number(meta.from_panel_id || 0) || null;
    const toId = Number(meta.to_panel_id || 0) || null;
    if (toId) escalationByTo.set(toId, (escalationByTo.get(toId) || 0) + 1);
    if (fromId) escalationByFrom.set(fromId, (escalationByFrom.get(fromId) || 0) + 1);
    if (fromId && toId) {
      const key = `${fromId}->${toId}`;
      escalationRoutes.set(key, (escalationRoutes.get(key) || 0) + 1);
    }
  });

  const escalationRoutesList = Array.from(escalationRoutes.entries())
    .map(([key, count]) => {
      const [fromId, toId] = key.split('->').map((v) => Number(v || 0) || 0);
      return { from_panel_id: fromId, to_panel_id: toId, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const panelNameById = new Map((byPanel.results || []).map((p) => [Number(p.panel_id), p.panel_name]));
  const escalationRoutesTop = escalationRoutesList.map((r) => ({
    ...r,
    from_panel_name: panelNameById.get(Number(r.from_panel_id)) || `Panel ${r.from_panel_id}`,
    to_panel_name: panelNameById.get(Number(r.to_panel_id)) || `Panel ${r.to_panel_id}`,
  }));

  const byPanelWithEscalations = (byPanel.results || []).map((p) => {
    const id = Number(p.panel_id || 0) || 0;
    return {
      ...p,
      escalations_in_month: escalationByTo.get(id) || 0,
      escalations_out_month: escalationByFrom.get(id) || 0,
    };
  });

  const staffCounts = await env.DB.prepare(
    `
    SELECT
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS suspended,
      COUNT(*) AS total
    FROM staff_members
    `
  ).first();

  const staffRows = await env.DB.prepare(
    `
    SELECT
      sm.id AS staff_id,
      sm.discord_id AS discord_id,
      sm.is_active AS is_active,
      sm.pay_per_ticket AS pay_per_ticket,
      COALESCE(sm.nickname, u.discord_username, sm.discord_id) AS display_name,
      sr.name AS role_name,
      sr.is_admin AS role_is_admin,
      sr.sort_order AS role_sort_order
    FROM staff_members sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    ORDER BY sm.is_active DESC, (sr.sort_order IS NULL) ASC, sr.sort_order ASC, display_name ASC
    `
  ).all();

  // Claims and replies for the current month.
  const claims = await env.DB.prepare(
    `
    SELECT staff_id, COUNT(DISTINCT ticket_id) AS claimed_tickets
    FROM ticket_claims
    WHERE action = 'claim'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    GROUP BY staff_id
    `
  ).all();
  const claimsByStaff = new Map((claims.results || []).map((r) => [Number(r.staff_id), Number(r.claimed_tickets || 0) || 0]));

  const replies = await env.DB.prepare(
    `
    SELECT
      sm.id AS staff_id,
      COUNT(DISTINCT tm.ticket_id) AS answered_tickets
    FROM staff_members sm
    LEFT JOIN ticket_messages tm
      ON tm.author_type = 'staff'
      AND strftime('%Y-%m', tm.created_at) = strftime('%Y-%m', 'now')
      AND (
        (sm.user_id IS NOT NULL AND tm.author_user_id = sm.user_id)
        OR (tm.author_discord_id IS NOT NULL AND tm.author_discord_id = sm.discord_id)
      )
    GROUP BY sm.id
    `
  ).all();
  const repliesByStaff = new Map((replies.results || []).map((r) => [Number(r.staff_id), Number(r.answered_tickets || 0) || 0]));

  const adjustments = await env.DB.prepare(
    `
    SELECT staff_id, COALESCE(SUM(amount), 0) AS adjustment_total
    FROM staff_pay_adjustments
    WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    GROUP BY staff_id
    `
  ).all();
  const adjustmentsByStaff = new Map((adjustments.results || []).map((r) => [Number(r.staff_id), Number(r.adjustment_total || 0) || 0]));

  const staffByStaff = (staffRows.results || []).map((row) => {
    const staffId = Number(row.staff_id || 0) || 0;
    const payPerTicket = Number(row.pay_per_ticket || 0) || 0;
    const claimed = claimsByStaff.get(staffId) || 0;
    const answered = repliesByStaff.get(staffId) || 0;
    const adj = adjustmentsByStaff.get(staffId) || 0;
    const due = claimed * payPerTicket + adj;
    return {
      ...row,
      claimed_month: claimed,
      answered_month: answered,
      adjustment_month: adj,
      due_month: due,
    };
  });

  const payrollTotals = staffByStaff.reduce(
    (acc, r) => {
      acc.claimed_month += Number(r.claimed_month || 0) || 0;
      acc.answered_month += Number(r.answered_month || 0) || 0;
      acc.adjustment_month += Number(r.adjustment_month || 0) || 0;
      acc.due_month += Number(r.due_month || 0) || 0;
      return acc;
    },
    { claimed_month: 0, answered_month: 0, adjustment_month: 0, due_month: 0 }
  );

  const canSeePayrollBreakdown =
    Boolean(staff && (staff.is_admin || hasPermission(staff, 'staff.manage_pay')));

  return jsonResponse({
    month,
    tickets: {
      totals: {
        total: Number(ticketsTotals?.total || 0) || 0,
        open: Number(ticketsTotals?.open || 0) || 0,
        closed: Number(ticketsTotals?.closed || 0) || 0,
        created_month: Number(ticketsTotals?.created_month || 0) || 0,
        closed_month: Number(ticketsTotals?.closed_month || 0) || 0,
      },
      by_status: byStatus.results || [],
      by_panel: byPanelWithEscalations,
      escalations_month: {
        events: (escalationRows.results || []).length,
        unique_tickets: escalatedTicketsSet.size,
        top_routes: escalationRoutesTop,
      },
    },
    staff: {
      totals: {
        total: Number(staffCounts?.total || 0) || 0,
        active: Number(staffCounts?.active || 0) || 0,
        suspended: Number(staffCounts?.suspended || 0) || 0,
      },
      month: {
        claimed_tickets: payrollTotals.claimed_month,
        answered_tickets: payrollTotals.answered_month,
        adjustment_total: payrollTotals.adjustment_month,
        due_total: payrollTotals.due_month,
        currency: 'R$',
      },
      by_staff: canSeePayrollBreakdown ? staffByStaff : [],
      can_view_payroll: canSeePayrollBreakdown,
    },
  });
};

