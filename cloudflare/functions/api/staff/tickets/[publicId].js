import { jsonResponse } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiStaff } from '../../../_lib/api.js';
import { staffCanAccessPanel } from '../../../_lib/db.js';

export const onRequestGet = async ({ env, request, params }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  const ticket = await env.DB.prepare(
    `
    SELECT t.*, p.name AS panel_name, s.name AS status_name, s.is_closed,
      sm.discord_id AS assigned_discord_id,
      u.discord_username AS assigned_username
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE t.public_id = ?
    LIMIT 1
    `
  )
    .bind(params.publicId)
    .first();

  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const messages = await env.DB.prepare(
    `
    SELECT tm.*, u.discord_username AS author_username, u.discord_avatar AS author_avatar,
      sm.id AS author_staff_id, sr.name AS author_role_name, sr.is_admin AS author_is_admin
    FROM ticket_messages tm
    LEFT JOIN users u ON tm.author_user_id = u.id
    LEFT JOIN staff_members sm ON sm.user_id = u.id AND sm.is_active = 1
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
    `
  )
    .bind(ticket.id)
    .all();

  const attachments = await env.DB.prepare(
    'SELECT * FROM ticket_attachments WHERE ticket_message_id IN (SELECT id FROM ticket_messages WHERE ticket_id = ?)'
  )
    .bind(ticket.id)
    .all();

  return jsonResponse({ ticket, messages: messages.results || [], attachments: attachments.results || [] });
};
