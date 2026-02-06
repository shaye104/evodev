const { jsonResponse, nowIso } = require('../../../../_lib/utils');
const { getUserContext } = require('../../../../_lib/auth');
const { requireApiStaff, requireApiPermission } = require('../../../../_lib/api');

exports.onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.status');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const statusId = Number(body.status_id || 0) || null;
  if (!statusId) return jsonResponse({ error: 'status_id required' }, { status: 400 });

  const status = await env.DB.prepare('SELECT * FROM ticket_statuses WHERE id = ? LIMIT 1')
    .bind(statusId)
    .first();
  const now = nowIso();

  await env.DB.prepare('UPDATE tickets SET status_id = ?, updated_at = ?, closed_at = ? WHERE id = ?')
    .bind(statusId, now, status?.is_closed ? now : null, ticket.id)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(user.id, user.discord_id, 'staff', 'ticket.status', 'ticket', ticket.public_id, JSON.stringify({ status_id: statusId }), now)
    .run();

  return jsonResponse({ ok: true });
};
