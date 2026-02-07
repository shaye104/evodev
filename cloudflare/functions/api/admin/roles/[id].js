import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';
import { ensureRoleColorsSchema } from '../../../_lib/db.js';

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  await env.DB.prepare(
    'UPDATE staff_roles SET name = ?, permissions = ?, is_admin = ?, color_bg = ?, color_text = ? WHERE id = ?'
  )
    .bind(
      body.name || '',
      JSON.stringify(body.permissions || []),
      body.is_admin ? 1 : 0,
      body.color_bg || null,
      body.color_text || null,
      params.id
    )
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'role.update', 'role', String(params.id), nowIso())
    .run();

  return jsonResponse({ ok: true });
};
