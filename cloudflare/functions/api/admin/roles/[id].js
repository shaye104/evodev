const { jsonResponse, nowIso } = require('../../../_lib/utils');
const { getUserContext } = require('../../../_lib/auth');
const { requireApiAdmin } = require('../../../_lib/api');

exports.onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  await env.DB.prepare(
    'UPDATE staff_roles SET name = ?, permissions = ?, is_admin = ? WHERE id = ?'
  )
    .bind(body.name || '', JSON.stringify(body.permissions || []), body.is_admin ? 1 : 0, params.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'role.update', 'role', String(params.id), nowIso())
    .run();

  return jsonResponse({ ok: true });
};
