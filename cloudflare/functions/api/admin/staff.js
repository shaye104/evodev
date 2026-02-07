import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiAdmin } from '../../_lib/api.js';
import { ensureRoleColorsSchema, ensureStaffPaySchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureStaffPaySchema(env);
  } catch {}

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

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  try {
    await ensureStaffPaySchema(env);
  } catch {}
  const discordId = String(body.discord_id || '').trim();
  const existingUser = discordId
    ? await env.DB.prepare('SELECT id FROM users WHERE discord_id = ? LIMIT 1')
        .bind(discordId)
        .first()
    : null;

  const result = await env.DB.prepare(
    'INSERT INTO staff_members (discord_id, role_id, is_active, pay_per_ticket, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(
      discordId,
      body.role_id || null,
      body.is_active ? 1 : 0,
      Number(body.pay_per_ticket || 0) || 0,
      now
    )
    .run();

  if (existingUser?.id) {
    await env.DB.prepare('UPDATE staff_members SET user_id = ? WHERE id = ?')
      .bind(existingUser.id, result.meta.last_row_id)
      .run();
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'staff.create', 'staff', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
