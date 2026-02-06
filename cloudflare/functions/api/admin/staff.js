const { jsonResponse, nowIso } = require('../../_lib/utils');
const { getUserContext } = require('../../_lib/auth');
const { requireApiAdmin } = require('../../_lib/api');

exports.onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const staffMembers = await env.DB.prepare(
    `
    SELECT sm.*, sr.name AS role_name, sr.is_admin, u.discord_username
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    LEFT JOIN users u ON sm.user_id = u.id
    ORDER BY sm.created_at DESC
    `
  ).all();
  const roles = await env.DB.prepare('SELECT * FROM staff_roles ORDER BY name ASC').all();

  return jsonResponse({ staff: staffMembers.results || [], roles: roles.results || [] });
};

exports.onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  const result = await env.DB.prepare(
    'INSERT INTO staff_members (discord_id, role_id, is_active, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(body.discord_id || '', body.role_id || null, body.is_active ? 1 : 0, now)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'staff.create', 'staff', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
