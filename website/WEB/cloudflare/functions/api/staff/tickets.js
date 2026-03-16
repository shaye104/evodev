import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff } from '../../_lib/api.js';
import {
  ensurePanelRoleAccessSchema,
  ensureStaffNicknamesSchema,
  ensureTicketReadsSchema,
} from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  const url = new URL(request.url);
  const statusId = url.searchParams.get('status_id');
  const panelId = url.searchParams.get('panel_id');
  const assignedId = url.searchParams.get('assigned_staff_id');

  try {
    await ensureStaffNicknamesSchema(env);
  } catch {}
  try {
    await ensureTicketReadsSchema(env);
  } catch {}

  const clauses = [];
  const values = [staff.id];
  if (!staff.is_admin) {
    try {
      await ensurePanelRoleAccessSchema(env);
      clauses.push(
        `(
          NOT EXISTS (
            SELECT 1 FROM ticket_panel_role_access a
            WHERE a.panel_id = t.panel_id
          )
          OR EXISTS (
            SELECT 1 FROM ticket_panel_role_access a
            WHERE a.panel_id = t.panel_id AND a.role_id = ?
          )
        )`
      );
      values.push(staff.role_id);
    } catch {
      // If schema can't be ensured, fall back to showing all tickets.
    }
  }
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
      u.discord_username AS assigned_username,
      COALESCE(sm.nickname, u.discord_username, sm.discord_id) AS assigned_display_name,
      lm.last_message_id,
      tm_last.author_type AS last_message_author_type,
      tr.last_read_message_id AS staff_last_read_message_id,
      CASE
        WHEN tm_last.author_type = 'user'
          AND (tr.last_read_message_id IS NULL OR tr.last_read_message_id < lm.last_message_id)
        THEN 1
        ELSE 0
      END AS unread_for_staff
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN (
      SELECT ticket_id, MAX(id) AS last_message_id
      FROM ticket_messages
      GROUP BY ticket_id
    ) lm ON lm.ticket_id = t.id
    LEFT JOIN ticket_messages tm_last ON tm_last.id = lm.last_message_id
    LEFT JOIN ticket_reads tr
      ON tr.ticket_id = t.id
      AND tr.reader_type = 'staff'
      AND tr.reader_id = ?
    ${where}
    ORDER BY t.last_message_at DESC
  `;

  const results = await env.DB.prepare(query).bind(...values).all();
  return jsonResponse({ tickets: results.results || [] });
};
