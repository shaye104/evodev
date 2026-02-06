const { jsonResponse, nowIso } = require('../../_lib/utils');
const { getUserContext } = require('../../_lib/auth');
const { requireApiAdmin } = require('../../_lib/api');

exports.onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const results = await env.DB.prepare(
    'SELECT * FROM ticket_statuses ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ statuses: results.results || [] });
};

exports.onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  if (body.is_default_open) {
    await env.DB.prepare('UPDATE ticket_statuses SET is_default_open = 0').run();
  }
  const result = await env.DB.prepare(
    'INSERT INTO ticket_statuses (name, slug, is_default_open, is_closed, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(body.name || '', body.slug || '', body.is_default_open ? 1 : 0, body.is_closed ? 1 : 0, Number(body.sort_order || 0), now)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'status.create', 'status', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
