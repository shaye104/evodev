import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  await env.DB.prepare(
    'UPDATE ticket_panels SET name = ?, description = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?'
  )
    .bind(body.name || '', body.description || '', body.is_active ? 1 : 0, Number(body.sort_order || 0), now, params.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'panel.update', 'panel', String(params.id), now)
    .run();

  return jsonResponse({ ok: true });
};
