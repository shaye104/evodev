import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiUser } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiUser(user);
  if (guard) return guard;

  const attachment = await env.DB.prepare(
    'SELECT * FROM ticket_attachments WHERE id = ? LIMIT 1'
  )
    .bind(params.id)
    .first();
  if (!attachment) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (attachment.storage_url) {
    return new Response(null, { status: 302, headers: { Location: attachment.storage_url } });
  }

  const message = await env.DB.prepare(
    'SELECT * FROM ticket_messages WHERE id = ? LIMIT 1'
  )
    .bind(attachment.ticket_message_id)
    .first();
  if (!message) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const ticket = await env.DB.prepare(
    'SELECT * FROM tickets WHERE id = ? LIMIT 1'
  )
    .bind(message.ticket_id)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (!staff && ticket.creator_user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const obj = await env.R2.get(attachment.storage_path);
  if (!obj) return jsonResponse({ error: 'Not found' }, { status: 404 });
  const headers = new Headers();
  headers.set('Content-Type', attachment.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${attachment.filename}"`);
  return new Response(obj.body, { headers });
};
