import { jsonResponse, parseFormData, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import { storeAttachments } from '../../../../_lib/attachments.js';
import { staffCanAccessPanel } from '../../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.reply');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await parseFormData(request);
  if (!form) return jsonResponse({ error: 'Expected form data' }, { status: 400 });
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
    .bind(ticket.id, 'staff', user.id, user.discord_id, message, 'web', now, null)
    .run();

  await env.DB.prepare('UPDATE tickets SET updated_at = ?, last_message_at = ? WHERE id = ?')
    .bind(now, now, ticket.id)
    .run();

  const files = form.getAll('attachments').filter((file) => file && file.size);
  await storeAttachments(env, ticket.public_id, result.meta.last_row_id, files);

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(user.id, user.discord_id, 'staff', 'ticket.reply', 'ticket', ticket.public_id, null, now)
    .run();

  return jsonResponse({ ok: true });
};
