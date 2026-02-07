import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';
import { ensurePanelRoleAccessSchema } from '../../../_lib/db.js';

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

  // Update role access rules (null/undefined => no change, [] => clear rules, [ids...] => replace rules).
  if (Object.prototype.hasOwnProperty.call(body, 'allowed_role_ids')) {
    try {
      await ensurePanelRoleAccessSchema(env);
    } catch {
      // If schema cannot be ensured, skip access updates.
      // Panel updates still succeed.
      // eslint-disable-next-line no-empty
    }

    const roleIds = Array.isArray(body.allowed_role_ids)
      ? body.allowed_role_ids.map((v) => Number(v || 0)).filter(Boolean)
      : [];
    try {
      await env.DB.prepare('DELETE FROM ticket_panel_role_access WHERE panel_id = ?')
        .bind(params.id)
        .run();
      for (const roleId of roleIds) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO ticket_panel_role_access (panel_id, role_id, created_at) VALUES (?, ?, ?)'
        )
          .bind(params.id, roleId, now)
          .run();
      }
    } catch {
      // Ignore access-rule update errors.
    }
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'panel.update', 'panel', String(params.id), now)
    .run();

  return jsonResponse({ ok: true });
};
