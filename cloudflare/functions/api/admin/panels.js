import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiAdmin } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const results = await env.DB.prepare(
    'SELECT * FROM ticket_panels ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ panels: results.results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  const result = await env.DB.prepare(
    'INSERT INTO ticket_panels (name, description, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(body.name || '', body.description || '', body.is_active ? 1 : 0, Number(body.sort_order || 0), now, now)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'panel.create', 'panel', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
