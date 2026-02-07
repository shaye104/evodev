import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext, hasPermission } from '../../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../../_lib/api.js';
import {
  ensurePanelRoleAccessSchema,
  ensureRoleColorsSchema,
  ensureRoleSortSchema,
} from '../../../_lib/db.js';

const toPos = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 999999;
};

const getActorPos = (staff) => {
  if (!staff || staff.is_admin) return -1;
  return toPos(staff.role_sort_order ?? staff.role_sort ?? staff.sort_order ?? 999999);
};

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.roles'));
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureRoleSortSchema(env);
  } catch {}

  const existing = await env.DB.prepare(
    'SELECT id, name, permissions, is_admin, sort_order FROM staff_roles WHERE id = ? LIMIT 1'
  )
    .bind(params.id)
    .first();
  if (!existing) return jsonResponse({ error: 'Not found' }, { status: 404 });

  // Non-admins cannot add permissions they don't already have themselves.
  if (!staff.is_admin) {
    const requested = Array.isArray(body.permissions) ? body.permissions : [];
    let existingPerms = [];
    try {
      const parsed = JSON.parse(existing.permissions || '[]');
      if (Array.isArray(parsed)) existingPerms = parsed.map((v) => String(v || '').trim()).filter(Boolean);
    } catch {
      existingPerms = String(existing.permissions || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }

    const nextPerms = requested.map((v) => String(v || '').trim()).filter(Boolean);
    const oldSet = new Set(existingPerms);
    const added = nextPerms.filter((p) => !oldSet.has(p));
    const denied = added.filter((p) => !hasPermission(staff, p));
    if (denied.length) {
      return jsonResponse(
        { error: `Cannot grant permission(s): ${denied.join(', ')}` },
        { status: 403 }
      );
    }
  }

  // Discord-like hierarchy: non-admin staff cannot manage roles at/above their own role.
  if (!staff.is_admin) {
    const actorPos = getActorPos(staff);
    const targetPos = toPos(existing.sort_order ?? 999999);
    if (existing.is_admin) {
      return jsonResponse({ error: 'Cannot modify Admin role' }, { status: 403 });
    }
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot modify a role at or above your role' }, { status: 403 });
    }
    if (body.is_admin) {
      return jsonResponse({ error: 'Cannot grant Admin access' }, { status: 403 });
    }
    const nextPos = Object.prototype.hasOwnProperty.call(body, 'sort_order')
      ? toPos(body.sort_order ?? 999999)
      : targetPos;
    if (!(actorPos < nextPos)) {
      return jsonResponse({ error: 'Cannot move a role to be at or above your role' }, { status: 403 });
    }
  }

  await env.DB.prepare(
    'UPDATE staff_roles SET name = ?, permissions = ?, is_admin = ?, color_bg = ?, color_text = ?, sort_order = ? WHERE id = ?'
  )
    .bind(
      body.name || '',
      JSON.stringify(body.permissions || []),
      body.is_admin ? 1 : 0,
      body.color_bg || null,
      body.color_text || null,
      Number(body.sort_order || 0) || 0,
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
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.roles'));
  if (guard) return guard;

  try {
    await ensureRoleSortSchema(env);
  } catch {}

  const role = await env.DB.prepare('SELECT id, name, is_admin, sort_order FROM staff_roles WHERE id = ? LIMIT 1')
    .bind(params.id)
    .first();
  if (!role) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (role.is_admin || String(role.name || '').trim().toLowerCase() === 'admin') {
    return jsonResponse({ error: 'Admin role cannot be deleted.' }, { status: 403 });
  }

  if (!staff.is_admin) {
    const actorPos = getActorPos(staff);
    const targetPos = toPos(role.sort_order ?? 999999);
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot delete a role at or above your role' }, { status: 403 });
    }
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
