import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import {
  ensureStaffNotificationsSchema,
  ensureStaffPayAdjustmentsSchema,
} from '../../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || ((staff && staff.is_admin) ? null : requireApiPermission(staff, 'staff.manage_pay'));
  if (guard) return guard;

  try {
    await ensureStaffPayAdjustmentsSchema(env);
  } catch {}
  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount || 0) || 0;
  const reason = String(body.reason || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonResponse({ error: 'Amount must be a positive number' }, { status: 400 });
  }
  if (amount > 1000000) {
    return jsonResponse({ error: 'Amount too large' }, { status: 400 });
  }

  const targetId = Number(params.id || 0) || 0;
  if (!targetId) return jsonResponse({ error: 'Invalid staff id' }, { status: 400 });

  const target = await env.DB.prepare('SELECT id FROM staff_members WHERE id = ? LIMIT 1')
    .bind(targetId)
    .first();
  if (!target) return jsonResponse({ error: 'Not found' }, { status: 404 });

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
    ? `Bonus added: R$${amount}. (${reason})`
    : `Bonus added: R$${amount}.`;
  await env.DB.prepare(
    `
    INSERT INTO staff_notifications (staff_id, type, message, metadata, created_at)
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      targetId,
      'pay.bonus',
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
      'staff.pay.bonus',
      'staff',
      String(targetId),
      JSON.stringify({ amount, reason: reason || null }),
      now
    )
    .run();

  return jsonResponse({ ok: true });
};
