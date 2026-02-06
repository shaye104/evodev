import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  if (body.is_default_open) {
    await env.DB.prepare('UPDATE ticket_statuses SET is_default_open = 0').run();
  }
  await env.DB.prepare(
    'UPDATE ticket_statuses SET name = ?, slug = ?, is_default_open = ?, is_closed = ?, sort_order = ? WHERE id = ?'
  )
    .bind(body.name || '', body.slug || '', body.is_default_open ? 1 : 0, body.is_closed ? 1 : 0, Number(body.sort_order || 0), params.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'status.update', 'status', String(params.id), nowIso())
    .run();

  return jsonResponse({ ok: true });
};
