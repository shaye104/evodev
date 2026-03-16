import { jsonResponse, parseFormData, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiUser } from '../../../_lib/api.js';
import { storeAttachments } from '../../../_lib/attachments.js';
import { ensureTicketReadsSchema, staffCanAccessPanel } from '../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiUser(user);
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!staff && ticket.creator_user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }
  if (staff && !(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }
  if (!staff) {
    // Users cannot reply once a ticket is closed.
    const status = await env.DB.prepare(
      'SELECT is_closed FROM ticket_statuses WHERE id = ? LIMIT 1'
    )
      .bind(ticket.status_id)
      .first()
      .catch(() => null);
    const isClosed = Boolean(ticket.closed_at) || Boolean(status?.is_closed);
    if (isClosed) {
      return jsonResponse({ error: 'Ticket is closed' }, { status: 409 });
    }
  }

  const form = await parseFormData(request);
  if (!form) {
    return jsonResponse({ error: 'Expected form data' }, { status: 400 });
  }
  const message = String(form.get('message') || '').trim();
  if (!message) return jsonResponse({ error: 'Message required' }, { status: 400 });

  const now = nowIso();
  const result = await env.DB.prepare(
    `
    INSERT INTO ticket_messages (
      ticket_id, author_type, author_user_id, author_discord_id, body,
      source, created_at, parent_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(ticket.id, staff ? 'staff' : 'user', user.id, user.discord_id, message, 'web', now, null)
    .run();

  await env.DB.prepare('UPDATE tickets SET updated_at = ?, last_message_at = ? WHERE id = ?')
    .bind(now, now, ticket.id)
    .run();

  // If the user is replying, they must have seen the thread.
  // Update read state so staff-side read receipts and bot DM cooldown logic behave correctly.
  if (!staff) {
    try {
      await ensureTicketReadsSchema(env);
      await env.DB.prepare(
        `
        INSERT INTO ticket_reads (ticket_id, reader_type, reader_id, last_read_message_id, last_read_at)
        VALUES (?, 'user', ?, ?, ?)
        ON CONFLICT(ticket_id, reader_type, reader_id)
        DO UPDATE SET last_read_message_id = excluded.last_read_message_id, last_read_at = excluded.last_read_at
        `
      )
        .bind(ticket.id, user.id, Number(result?.meta?.last_row_id || 0) || null, now)
        .run();
    } catch {}
  }

  try {
    const files = form.getAll('attachments').filter((file) => file && file.size);
    await storeAttachments(env, ticket.public_id, result.meta.last_row_id, files);
  } catch (err) {
    if (err && err.name === 'AttachmentValidationError') {
      return jsonResponse(
        {
          error: 'One or more attachments were rejected.',
          attachments: err.errors || [],
        },
        { status: 400 }
      );
    }
    throw err;
  }

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(user.id, user.discord_id, staff ? 'staff' : 'user', 'ticket.reply', 'ticket', ticket.public_id, null, now)
    .run();

  return jsonResponse({ ok: true });
};
