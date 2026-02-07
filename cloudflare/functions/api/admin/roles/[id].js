import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';
import { ensurePanelRoleAccessSchema, ensureRoleColorsSchema } from '../../../_lib/db.js';

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

export const onRequestDelete = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const role = await env.DB.prepare('SELECT id, name, is_admin FROM staff_roles WHERE id = ? LIMIT 1')
    .bind(params.id)
    .first();
  if (!role) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (role.is_admin || String(role.name || '').trim().toLowerCase() === 'admin') {
    return jsonResponse({ error: 'Admin role cannot be deleted.' }, { status: 403 });
  }

  // Prevent deleting roles that are still referenced.
  const usedByStaff = await env.DB.prepare(
    'SELECT 1 FROM staff_members WHERE role_id = ? LIMIT 1'
  )
    .bind(params.id)
    .first();
  if (usedByStaff) {
    return jsonResponse(
      { error: 'Role is in use by staff members. Reassign staff before deleting.' },
      { status: 409 }
    );
  }

  let usedByPanels = null;
  try {
    await ensurePanelRoleAccessSchema(env);
    usedByPanels = await env.DB.prepare(
      'SELECT 1 FROM ticket_panel_role_access WHERE role_id = ? LIMIT 1'
    )
      .bind(params.id)
      .first();
  } catch {
    usedByPanels = null;
  }
  if (usedByPanels) {
    return jsonResponse(
      { error: 'Role is used by panel visibility rules. Remove it from panels before deleting.' },
      { status: 409 }
    );
  }

  // Clean up any access rows just in case.
  try {
    await env.DB.prepare('DELETE FROM ticket_panel_role_access WHERE role_id = ?')
      .bind(params.id)
      .run();
  } catch {}

  await env.DB.prepare('DELETE FROM staff_roles WHERE id = ?').bind(params.id).run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'role.delete', 'role', String(params.id), nowIso())
    .run();

  return jsonResponse({ ok: true });
};
