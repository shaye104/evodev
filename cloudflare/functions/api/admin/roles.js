import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../_lib/api.js';
import { ensureRoleColorsSchema, ensureRoleSortSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.roles'));
  if (guard) return guard;

  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureRoleSortSchema(env);
  } catch {}

  const roles = await env.DB.prepare(
    'SELECT * FROM staff_roles ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ roles: roles.results || [], me: staff });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.roles'));
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  if (!staff.is_admin && body.is_admin) {
    return jsonResponse({ error: 'Cannot grant Admin access' }, { status: 403 });
  }
  const now = nowIso();
  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureRoleSortSchema(env);
  } catch {}

  // New roles start at the end of the list.
  const maxRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM staff_roles'
  ).first();
  const nextSort = (Number(maxRow?.max_sort || 0) || 0) + 1;
  const result = await env.DB.prepare(
    'INSERT INTO staff_roles (name, permissions, is_admin, color_bg, color_text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      body.name || '',
      JSON.stringify(body.permissions || []),
      body.is_admin ? 1 : 0,
      body.color_bg || null,
      body.color_text || null,
      nextSort,
      now
    )
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'role.create', 'role', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
