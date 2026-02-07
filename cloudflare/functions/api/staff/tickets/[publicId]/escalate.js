import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import { staffCanAccessPanel } from '../../../../_lib/db.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.escalate');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const toPanelId = Number(body.panel_id || 0) || null;
  if (!toPanelId) return jsonResponse({ error: 'panel_id required' }, { status: 400 });

  const panel = await env.DB.prepare('SELECT * FROM ticket_panels WHERE id = ? LIMIT 1')
    .bind(toPanelId)
    .first();
  if (!panel) return jsonResponse({ error: 'Panel not found' }, { status: 404 });
  if (!panel.is_active) return jsonResponse({ error: 'Panel is not active' }, { status: 409 });

  // Allow staff to escalate into panels they might not have access to.
  // If the staff member cannot access the target panel, we unassign them and instruct the UI to redirect.
  const canAccessNewPanel = await staffCanAccessPanel(env, staff, toPanelId);

  const now = nowIso();
  const shouldUnassign = !canAccessNewPanel && Number(ticket.assigned_staff_id || 0) === Number(staff.id || 0);

  if (shouldUnassign) {
    await env.DB.prepare('UPDATE tickets SET panel_id = ?, assigned_staff_id = NULL, updated_at = ? WHERE id = ?')
      .bind(toPanelId, now, ticket.id)
      .run();
  } else {
    await env.DB.prepare('UPDATE tickets SET panel_id = ?, updated_at = ? WHERE id = ?')
      .bind(toPanelId, now, ticket.id)
      .run();
  }

  await env.DB.prepare(
    `
    INSERT INTO audit_logs (
      actor_user_id, actor_discord_id, actor_type, action,
      entity_type, entity_id, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      user.id,
      user.discord_id,
      'staff',
      'ticket.escalate',
      'ticket',
      ticket.public_id,
      JSON.stringify({ from_panel_id: ticket.panel_id, to_panel_id: toPanelId }),
      now
    )
    .run();

  return jsonResponse({ ok: true, can_access: Boolean(canAccessNewPanel) });
};
