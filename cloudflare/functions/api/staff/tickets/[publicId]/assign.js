const { jsonResponse, nowIso } = require('../../../../_lib/utils');
const { getUserContext } = require('../../../../_lib/auth');
const { requireApiStaff, requireApiPermission } = require('../../../../_lib/api');

exports.onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.assign');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const staffId = Number(body.staff_id || 0) || null;
  const now = nowIso();

  await env.DB.prepare('UPDATE tickets SET assigned_staff_id = ?, updated_at = ? WHERE id = ?')
    .bind(staffId, now, ticket.id)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(user.id, user.discord_id, 'staff', 'ticket.assign', 'ticket', ticket.public_id, JSON.stringify({ staff_id: staffId }), now)
    .run();

  return jsonResponse({ ok: true });
};
