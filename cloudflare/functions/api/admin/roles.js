import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiAdmin } from '../../_lib/api.js';
import { ensureRoleColorsSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  try {
    await ensureRoleColorsSchema(env);
  } catch {}

  const roles = await env.DB.prepare('SELECT * FROM staff_roles ORDER BY name ASC').all();
  return jsonResponse({ roles: roles.results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  const result = await env.DB.prepare(
    'INSERT INTO staff_roles (name, permissions, is_admin, color_bg, color_text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      body.name || '',
      JSON.stringify(body.permissions || []),
      body.is_admin ? 1 : 0,
      body.color_bg || null,
      body.color_text || null,
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
