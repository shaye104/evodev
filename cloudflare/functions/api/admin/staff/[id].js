import { jsonResponse, nowIso } from '../../../_lib/utils.js';
import { getUserContext } from '../../../_lib/auth.js';
import { requireApiAdmin } from '../../../_lib/api.js';
import { ensureStaffNotificationsSchema, ensureStaffPaySchema } from '../../../_lib/db.js';

export const onRequestPut = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  try {
    await ensureStaffPaySchema(env);
  } catch {}
  try {
    await ensureStaffNotificationsSchema(env);
  } catch {}

  const body = await request.json().catch(() => ({}));
  const existing = await env.DB.prepare(
    'SELECT id, role_id, is_active, pay_per_ticket FROM staff_members WHERE id = ? LIMIT 1'
  )
    .bind(params.id)
    .first();
  if (!existing) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const nextRoleId = body.role_id || null;
  const nextIsActive = body.is_active ? 1 : 0;
  const nextPay = Number(body.pay_per_ticket || 0) || 0;

  await env.DB.prepare('UPDATE staff_members SET role_id = ?, is_active = ?, pay_per_ticket = ? WHERE id = ?')
    .bind(
      nextRoleId,
      nextIsActive,
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
    .bind(user.id, user.discord_id, 'admin', 'staff.update', 'staff', String(params.id), now)
    .run();

  return jsonResponse({ ok: true });
};

export const onRequestDelete = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const existing = await env.DB.prepare('SELECT id, discord_id, user_id FROM staff_members WHERE id = ? LIMIT 1')
    .bind(params.id)
    .first();
  if (!existing) return jsonResponse({ error: 'Not found' }, { status: 404 });

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
      'admin',
      'staff.remove',
      'staff',
      String(existing.id),
      JSON.stringify({ discord_id: existing.discord_id, user_id: existing.user_id || null }),
      nowIso()
    )
    .run();

  return jsonResponse({ ok: true });
};
