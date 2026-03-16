import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff } from '../../_lib/api.js';
import { ensureStaffNotificationsSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const rows = await env.DB.prepare(
    `
    SELECT id, type, message, metadata, created_at
    FROM staff_notifications
    WHERE staff_id = ?
      AND (read_at IS NULL OR read_at = '')
    ORDER BY created_at DESC, id DESC
    LIMIT 10
    `
  )
    .bind(staff.id)
    .all();

  return jsonResponse({ notifications: rows.results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff);
  if (guard) return guard;

  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((v) => Number(v || 0)).filter(Boolean) : [];
  if (!ids.length) return jsonResponse({ ok: true });

  const now = nowIso();
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(
    `UPDATE staff_notifications SET read_at = ? WHERE staff_id = ? AND id IN (${placeholders})`
  )
    .bind(now, staff.id, ...ids)
    .run();

  return jsonResponse({ ok: true });
};

