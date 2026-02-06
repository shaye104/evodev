const { jsonResponse } = require('../../_lib/utils');
const { getUserContext } = require('../../_lib/auth');
const { requireApiStaff } = require('../../_lib/api');

exports.onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  const url = new URL(request.url);
  const statusId = url.searchParams.get('status_id');
  const panelId = url.searchParams.get('panel_id');
  const assignedId = url.searchParams.get('assigned_staff_id');

  const clauses = [];
  const values = [];
  if (statusId) {
    clauses.push('t.status_id = ?');
    values.push(statusId);
  }
  if (panelId) {
    clauses.push('t.panel_id = ?');
    values.push(panelId);
  }
  if (assignedId) {
    clauses.push('t.assigned_staff_id = ?');
    values.push(assignedId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const query = `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed,
      sm.discord_id AS assigned_discord_id,
      u.discord_username AS assigned_username
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    ${where}
    ORDER BY t.last_message_at DESC
  `;

  const results = await env.DB.prepare(query).bind(...values).all();
  return jsonResponse({ tickets: results.results || [] });
};
