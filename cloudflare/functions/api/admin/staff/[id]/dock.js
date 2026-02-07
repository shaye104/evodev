import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import {
  ensureRoleSortSchema,
  ensureStaffNotificationsSchema,
  ensureStaffPayAdjustmentsSchema,
} from '../../../../_lib/db.js';

const toPos = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 999999;
};

const getActorPos = (staff) => {
  if (!staff || staff.is_admin) return -1;
  return toPos(staff.role_sort_order ?? staff.role_sort ?? staff.sort_order ?? 999999);
};

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin
      ? null
      : (requireApiPermission(staff, 'admin.staff') || requireApiPermission(staff, 'staff.manage_pay')));
  if (guard) return guard;

  try {
    await ensureRoleSortSchema(env);
  } catch {}
  try {
    await ensureStaffPayAdjustmentsSchema(env);
  } catch {}
  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  const amountRaw = Number(body.amount || 0) || 0;
  const reason = String(body.reason || '').trim();

  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return jsonResponse({ error: 'Amount must be a positive number' }, { status: 400 });
  }
  if (amountRaw > 1000000) {
    return jsonResponse({ error: 'Amount too large' }, { status: 400 });
  }

  const targetId = Number(params.id || 0) || 0;
  if (!targetId) return jsonResponse({ error: 'Invalid staff id' }, { status: 400 });

  const target = await env.DB.prepare(
    `
    SELECT sm.id,
      sr.is_admin AS role_is_admin,
      sr.sort_order AS role_sort_order
    FROM staff_members sm
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE sm.id = ? LIMIT 1
    `
  )
    .bind(targetId)
    .first();
  if (!target) return jsonResponse({ error: 'Not found' }, { status: 404 });

  if (!staff.is_admin) {
    const actorPos = getActorPos(staff);
    const targetPos = toPos(target.role_sort_order ?? 999999);
    if (target.role_is_admin) {
      return jsonResponse({ error: 'Cannot adjust pay for Admin staff' }, { status: 403 });
    }
    if (!(actorPos < targetPos)) {
      return jsonResponse({ error: 'Cannot adjust pay for a staff member at or above your role' }, { status: 403 });
    }
  }

  const amount = -Math.abs(amountRaw);
  const now = nowIso();

  await env.DB.prepare(
    `
    INSERT INTO staff_pay_adjustments (staff_id, amount, reason, created_by_user_id, created_by_staff_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `
  )
    .bind(targetId, amount, reason || null, user?.id || null, staff?.id || null, now)
    .run();

  const message = reason
    ? `Pay docked: R$${Math.abs(amount)}. (${reason})`
    : `Pay docked: R$${Math.abs(amount)}.`;
  await env.DB.prepare(
    `
    INSERT INTO staff_notifications (staff_id, type, message, metadata, created_at)
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      targetId,
      'pay.dock',
      message,
      JSON.stringify({ amount, reason: reason || null }),
      now
    )
    .run();

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      user?.id || null,
      user?.discord_id || null,
      staff?.is_admin ? 'admin' : 'staff',
      'staff.pay.dock',
      'staff',
      String(targetId),
      JSON.stringify({ amount, reason: reason || null }),
      now
    )
    .run();

  return jsonResponse({ ok: true });
};

