import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiAdmin } from '../../_lib/api.js';
import { ensurePanelRoleAccessSchema, ensureRoleColorsSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  try {
    await ensurePanelRoleAccessSchema(env);
  } catch {
    // If schema cannot be ensured, return panels/roles only.
  }
  try {
    await ensureRoleColorsSchema(env);
  } catch {}

  const results = await env.DB.prepare(
    'SELECT * FROM ticket_panels ORDER BY sort_order ASC, name ASC'
  ).all();
  const roles = await env.DB.prepare('SELECT id, name, is_admin, color_bg, color_text FROM staff_roles ORDER BY name ASC').all();
  const accessRows = await env.DB.prepare('SELECT panel_id, role_id FROM ticket_panel_role_access').all().catch(() => ({ results: [] }));
  return jsonResponse({
    panels: results.results || [],
    roles: roles.results || [],
    panel_role_access: accessRows.results || [],
  });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  try {
    await ensurePanelRoleAccessSchema(env);
  } catch {
    // If schema cannot be ensured, we will create a panel without access rules.
  }
  const result = await env.DB.prepare(
    'INSERT INTO ticket_panels (name, description, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(body.name || '', body.description || '', body.is_active ? 1 : 0, Number(body.sort_order || 0), now, now)
    .run();

  const panelId = result.meta.last_row_id;
  const roleIds = Array.isArray(body.allowed_role_ids)
    ? body.allowed_role_ids.map((v) => Number(v || 0)).filter(Boolean)
    : null;
  if (roleIds && roleIds.length) {
    for (const roleId of roleIds) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO ticket_panel_role_access (panel_id, role_id, created_at) VALUES (?, ?, ?)'
      )
        .bind(panelId, roleId, now)
        .run();
    }
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'panel.create', 'panel', String(panelId), now)
    .run();

  return jsonResponse({ id: panelId });
};
