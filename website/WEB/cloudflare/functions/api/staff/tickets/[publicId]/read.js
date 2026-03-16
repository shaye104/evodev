import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff } from '../../../../_lib/api.js';
import { ensureTicketReadsSchema, staffCanAccessPanel } from '../../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT id, panel_id FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await ensureTicketReadsSchema(env);
  } catch {}

  const latest = await env.DB.prepare(
    'SELECT MAX(id) AS last_message_id FROM ticket_messages WHERE ticket_id = ?'
  )
    .bind(ticket.id)
    .first();
  const lastMessageId = Number(latest?.last_message_id || 0) || 0;

  const now = nowIso();
  await env.DB.prepare(
    `
    INSERT INTO ticket_reads (ticket_id, reader_type, reader_id, last_read_message_id, last_read_at)
    VALUES (?, 'staff', ?, ?, ?)
    ON CONFLICT(ticket_id, reader_type, reader_id)
    DO UPDATE SET last_read_message_id = excluded.last_read_message_id, last_read_at = excluded.last_read_at
    `
  )
    .bind(ticket.id, staff.id, lastMessageId || null, now)
    .run();

  return jsonResponse({ ok: true });
};

