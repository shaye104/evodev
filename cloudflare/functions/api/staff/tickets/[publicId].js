const { jsonResponse } = require('../../../_lib/utils');
const { getUserContext } = require('../../../_lib/auth');
const { requireApiStaff } = require('../../../_lib/api');

exports.onRequestGet = async ({ env, request, params }) => {
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

  const messages = await env.DB.prepare(
    'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC'
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
