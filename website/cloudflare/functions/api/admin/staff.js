import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext, hasPermission } from '../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../_lib/api.js';
import {
  ensureRoleColorsSchema,
  ensureRoleSortSchema,
  ensureStaffNicknamesSchema,
  ensureStaffPaySchema,
} from '../../_lib/db.js';

const toPos = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 999999;
};

const getActorPos = (staff) => {
  if (!staff || staff.is_admin) return -1;
  return toPos(staff.role_sort_order ?? staff.role_sort ?? staff.sort_order ?? 999999);
};

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const staffGuard = requireApiStaff(staff);
  if (staffGuard) return staffGuard;

  // Allow either staff management or pay management roles to view the staff list.
  // Pay-only roles can use this to grant bonuses/docks without being able to change roles/suspension.
  const canView =
    Boolean(staff && staff.is_admin) ||
    Boolean(staff && (hasPermission(staff, 'admin.staff') || hasPermission(staff, 'staff.manage_pay')));
  if (!canView) return requireApiPermission(staff, 'admin.staff');

  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureRoleSortSchema(env);
  } catch {}
  try {
    await ensureStaffNicknamesSchema(env);
  } catch {}
  try {
    await ensureStaffPaySchema(env);
  } catch {}

  let staffMembers = null;
  try {
    staffMembers = await env.DB.prepare(
      `
      SELECT sm.*, sr.name AS role_name, sr.is_admin, sr.sort_order AS role_sort_order,
        sr.color_bg, sr.color_text, u.discord_username
      FROM staff_members sm
      LEFT JOIN staff_roles sr ON sm.role_id = sr.id
      LEFT JOIN users u ON sm.user_id = u.id
      ORDER BY sm.created_at DESC
      `
    ).all();
  } catch {
    staffMembers = await env.DB.prepare(
      `
      SELECT sm.*, sr.name AS role_name, sr.is_admin, sr.id AS role_sort_order,
        NULL AS color_bg, NULL AS color_text, u.discord_username
      FROM staff_members sm
      LEFT JOIN staff_roles sr ON sm.role_id = sr.id
      LEFT JOIN users u ON sm.user_id = u.id
      ORDER BY sm.created_at DESC
      `
    ).all();
  }

  let roles = null;
  try {
    roles = await env.DB.prepare('SELECT * FROM staff_roles ORDER BY sort_order ASC, name ASC').all();
  } catch {
    // Legacy fallback if sort_order doesn't exist yet.
    roles = await env.DB.prepare('SELECT *, id AS sort_order FROM staff_roles ORDER BY id ASC, name ASC').all();
  }

  return jsonResponse({ staff: staffMembers.results || [], roles: roles.results || [], me: staff });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.staff'));
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const now = nowIso();
  try {
    await ensureStaffNicknamesSchema(env);
  } catch {}
  try {
    await ensureStaffPaySchema(env);
  } catch {}
  try {
    await ensureRoleSortSchema(env);
  } catch {}
  const canManagePay = Boolean(staff && (staff.is_admin || hasPermission(staff, 'staff.manage_pay')));
  const discordId = String(body.discord_id || '').trim();
  const existingUser = discordId
    ? await env.DB.prepare('SELECT id FROM users WHERE discord_id = ? LIMIT 1')
        .bind(discordId)
        .first()
    : null;

  // Discord-like hierarchy: you can only assign roles below your own role.
  if (!staff.is_admin && body.role_id) {
    const actorPos = getActorPos(staff);
    const role = await env.DB.prepare('SELECT id, is_admin, sort_order FROM staff_roles WHERE id = ? LIMIT 1')
      .bind(body.role_id)
      .first();
    if (role?.is_admin) return jsonResponse({ error: 'Cannot assign Admin role' }, { status: 403 });
    const targetPos = toPos(role?.sort_order ?? 999999);
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot assign a role at or above your role' }, { status: 403 });
    }
  }

  const nextPay = canManagePay ? Number(body.pay_per_ticket || 0) || 0 : 0;
  const result = await env.DB.prepare(
    'INSERT INTO staff_members (discord_id, role_id, is_active, nickname, pay_per_ticket, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      discordId,
      body.role_id || null,
      body.is_active ? 1 : 0,
      String(body.nickname || '').trim() || null,
      nextPay,
      now
    )
    .run();

  if (existingUser?.id) {
    await env.DB.prepare('UPDATE staff_members SET user_id = ? WHERE id = ?')
      .bind(existingUser.id, result.meta.last_row_id)
      .run();
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, 'admin', 'staff.create', 'staff', String(result.meta.last_row_id), now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};
