import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import {
  staffCanAccessPanel,
  ensureTicketTranscriptsSchema,
  ensureRoleColorsSchema,
} from '../../../../_lib/db.js';
import { buildTicketTranscriptSnapshot } from '../../../../_lib/transcripts.js';

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.status');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const closedStatus = await env.DB.prepare(
    'SELECT id FROM ticket_statuses WHERE is_closed = 1 ORDER BY sort_order ASC, id ASC LIMIT 1'
  ).first();
  const closedStatusId = Number(closedStatus?.id || 0) || null;
  if (!closedStatusId) {
    return jsonResponse({ error: 'No closed status is configured' }, { status: 409 });
  }

  const now = nowIso();
  const shouldCreateTranscript = !ticket.closed_at;

  await env.DB.prepare('UPDATE tickets SET status_id = ?, updated_at = ?, closed_at = ? WHERE id = ?')
    .bind(closedStatusId, now, now, ticket.id)
    .run();

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
      'ticket.close',
      'ticket',
      ticket.public_id,
      JSON.stringify({ status_id: closedStatusId }),
      now
    )
    .run();

  if (shouldCreateTranscript) {
    try {
      await ensureRoleColorsSchema(env);
    } catch {}
    try {
      await ensureTicketTranscriptsSchema(env);
    } catch {}

    try {
      const snapshot = await buildTicketTranscriptSnapshot(env, ticket.public_id);
      if (snapshot) {
        await env.DB.prepare(
          `
          INSERT INTO ticket_transcripts (
            ticket_id, ticket_public_id, format, content, trigger,
            created_by_actor_type, created_by_user_id, created_by_staff_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
          .bind(
            ticket.id,
            ticket.public_id,
            'json',
            JSON.stringify(snapshot),
            'close',
            'staff',
            user.id,
            staff.id,
            now
          )
          .run();
      }
    } catch {
      // Avoid breaking closing if transcript generation fails.
    }
  }

  return jsonResponse({ ok: true });
};

