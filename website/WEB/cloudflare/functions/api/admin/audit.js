import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.audit'));
  if (guard) return guard;

  const url = new URL(request.url);
  const clauses = [];
  const values = [];

  const action = String(url.searchParams.get('action') || '').trim();
  const actorDiscordId = String(url.searchParams.get('actor_discord_id') || '').trim();
  const entityType = String(url.searchParams.get('entity_type') || '').trim();
  const dateFrom = String(url.searchParams.get('date_from') || '').trim();
  const dateTo = String(url.searchParams.get('date_to') || '').trim();
  const limitRaw = Number(url.searchParams.get('limit') || 200) || 200;
  const limit = Math.max(1, Math.min(500, Math.floor(limitRaw)));

  if (action) {
    clauses.push('action LIKE ?');
    values.push(`%${action}%`);
  }
  if (actorDiscordId) {
    clauses.push('actor_discord_id = ?');
    values.push(actorDiscordId);
  }
  if (entityType) {
    clauses.push('entity_type = ?');
    values.push(entityType);
  }
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateFrom)) {
    clauses.push('created_at >= ?');
    values.push(`${dateFrom}T00:00:00.000Z`);
  }
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateTo)) {
    clauses.push('created_at <= ?');
    values.push(`${dateTo}T23:59:59.999Z`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const logs = await env.DB.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ${limit}`
  )
    .bind(...values)
    .all();
  return jsonResponse({ logs: logs.results || [] });
};
