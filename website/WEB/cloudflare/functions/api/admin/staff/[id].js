import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext, hasPermission } from '../../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../../_lib/api.js';
import {
  ensureRoleSortSchema,
  ensureStaffNicknamesSchema,
  ensureStaffNotificationsSchema,
  ensureStaffPaySchema,
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
  const staffGuard = requireApiStaff(staff);
  if (staffGuard) return staffGuard;

  const canManageStaff = Boolean(staff && (staff.is_admin || hasPermission(staff, 'admin.staff')));
  const canManagePay = Boolean(staff && (staff.is_admin || hasPermission(staff, 'staff.manage_pay')));
  if (!canManageStaff && !canManagePay) return requireApiPermission(staff, 'admin.staff');

  try {
    await ensureRoleSortSchema(env);
  } catch {}
  try {
    await ensureStaffNicknamesSchema(env);
  } catch {}
  try {
    await ensureStaffPaySchema(env);
  } catch {}
  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  const existing = await env.DB.prepare(
    `
    SELECT sm.id, sm.role_id, sm.is_active, sm.pay_per_ticket, sm.nickname,
      sr.is_admin AS role_is_admin,
      sr.sort_order AS role_sort_order
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.id = ? LIMIT 1
    `
  )
    .bind(params.id)
    .first();
  if (!existing) return jsonResponse({ error: 'Not found' }, { status: 404 });

  // Discord-like hierarchy: you cannot manage staff with a role at/above your own.
  if (!staff.is_admin) {
    const actorPos = getActorPos(staff);
    const targetPos = toPos(existing.role_sort_order ?? 999999);
    if (existing.role_is_admin) {
      return jsonResponse({ error: 'Cannot manage Admin staff' }, { status: 403 });
    }
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot manage a staff member at or above your role' }, { status: 403 });
    }
  }

  const wantsRoleChange = Object.prototype.hasOwnProperty.call(body, 'role_id');
  const wantsActiveChange = Object.prototype.hasOwnProperty.call(body, 'is_active');
  const wantsNicknameChange = Object.prototype.hasOwnProperty.call(body, 'nickname');
  const wantsPayChange = Object.prototype.hasOwnProperty.call(body, 'pay_per_ticket');

  // Pay-only operators cannot change staff roles/suspension/nickname.
  if (!canManageStaff) {
    if (wantsRoleChange || wantsActiveChange || wantsNicknameChange) {
      return jsonResponse({ error: 'Permission denied' }, { status: 403 });
    }
  }

  if (wantsPayChange && !canManagePay) {
    return jsonResponse({ error: 'Permission denied' }, { status: 403 });
  }

  const nextRoleId = canManageStaff
    ? (wantsRoleChange ? (body.role_id || null) : (existing.role_id || null))
    : (existing.role_id || null);
  const nextIsActive = canManageStaff
    ? (wantsActiveChange ? (body.is_active ? 1 : 0) : (existing.is_active ? 1 : 0))
    : (existing.is_active ? 1 : 0);
  const nextNickname = canManageStaff
    ? (wantsNicknameChange ? (String(body.nickname || '').trim() || null) : (existing.nickname || null))
    : (existing.nickname || null);
  const nextPay = wantsPayChange
    ? (Number(body.pay_per_ticket || 0) || 0)
    : (Number(existing.pay_per_ticket || 0) || 0);

  // Non-admin staff can only assign roles below their own role.
  if (canManageStaff && !staff.is_admin && nextRoleId) {
    const actorPos = getActorPos(staff);
    const role = await env.DB.prepare('SELECT id, is_admin, sort_order FROM staff_roles WHERE id = ? LIMIT 1')
      .bind(nextRoleId)
      .first();
    if (role?.is_admin) return jsonResponse({ error: 'Cannot assign Admin role' }, { status: 403 });
    const rolePos = toPos(role?.sort_order ?? 999999);
    if (!(actorPos < rolePos)) {
      return jsonResponse({ error: 'Cannot assign a role at or above your role' }, { status: 403 });
    }
  }

  await env.DB.prepare('UPDATE staff_members SET role_id = ?, is_active = ?, nickname = ?, pay_per_ticket = ? WHERE id = ?')
    .bind(
      nextRoleId,
      nextIsActive,
      nextNickname,
      nextPay,
      params.id
    )
    .run();

  const now = nowIso();
  const oldPay = Number(existing.pay_per_ticket || 0) || 0;
  if (oldPay !== nextPay) {
    await env.DB.prepare(
      `
      INSERT INTO staff_notifications (staff_id, type, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    )
      .bind(
        existing.id,
        'pay.rate',
        `Your pay rate was updated to R$${nextPay} per ticket.`,
        JSON.stringify({ old_pay_per_ticket: oldPay, new_pay_per_ticket: nextPay }),
        now
      )
      .run();
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.discord_id, staff?.is_admin ? 'admin' : 'staff', 'staff.update', 'staff', String(params.id), now)
    .run();

  return jsonResponse({ ok: true });
};

export const onRequestDelete = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.staff'));
  if (guard) return guard;

  try {
    await ensureRoleSortSchema(env);
  } catch {}

  const existing = await env.DB.prepare(
    `
    SELECT sm.id, sm.discord_id, sm.user_id, sm.role_id,
      sr.is_admin AS role_is_admin,
      sr.sort_order AS role_sort_order
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.id = ? LIMIT 1
    `
  )
    .bind(params.id)
    .first();
  if (!existing) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (!staff.is_admin) {
    const actorPos = getActorPos(staff);
    const targetPos = toPos(existing.role_sort_order ?? 999999);
    if (existing.role_is_admin) {
      return jsonResponse({ error: 'Cannot remove Admin staff' }, { status: 403 });
    }
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot remove a staff member at or above your role' }, { status: 403 });
    }
  }

  // Immediately revoke access to prevent abuse while the delete completes.
  await env.DB.prepare('UPDATE staff_members SET is_active = 0 WHERE id = ?')
    .bind(existing.id)
    .run();

  // Unassign any tickets currently assigned to this staff member.
  await env.DB.prepare('UPDATE tickets SET assigned_staff_id = NULL WHERE assigned_staff_id = ?')
    .bind(existing.id)
    .run();

  // Remove the staff member record. (Keeps historical ticket_claims / messages for audit trail.)
  await env.DB.prepare('DELETE FROM staff_members WHERE id = ?')
    .bind(existing.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      user.id,
      user.discord_id,
      staff?.is_admin ? 'admin' : 'staff',
      'staff.remove',
      'staff',
      String(existing.id),
      JSON.stringify({ discord_id: existing.discord_id, user_id: existing.user_id || null }),
      nowIso()
    )
    .run();

  return jsonResponse({ ok: true });
};
