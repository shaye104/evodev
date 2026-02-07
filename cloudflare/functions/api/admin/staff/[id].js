import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';
import { ensureStaffPaySchema } from '../../../_lib/db.js';

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  try {
    await ensureStaffPaySchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  await env.DB.prepare('UPDATE staff_members SET role_id = ?, is_active = ?, pay_per_ticket = ? WHERE id = ?')
    .bind(
      body.role_id || null,
      body.is_active ? 1 : 0,
      Number(body.pay_per_ticket || 0) || 0,
      params.id
    )
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'staff.update', 'staff', String(params.id), nowIso())
    .run();

  return jsonResponse({ ok: true });
};
