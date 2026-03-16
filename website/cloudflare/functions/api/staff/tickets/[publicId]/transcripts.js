import { jsonResponse, nowIso } from '../../../../_lib/utils.js';
import { getUserContext } from '../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../_lib/api.js';
import {
  staffCanAccessPanel,
  ensureTicketTranscriptsSchema,
  ensureRoleColorsSchema,
} from '../../../../_lib/db.js';
import { buildTicketTranscriptSnapshot } from '../../../../_lib/transcripts.js';

export const onRequestGet = async ({ env, request, params }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.view');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT id, public_id, panel_id FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await ensureTicketTranscriptsSchema(env);
  } catch {}

  const transcripts = await env.DB.prepare(
    `
    SELECT id, ticket_id, ticket_public_id, format, trigger,
      created_by_actor_type, created_by_user_id, created_by_staff_id,
      created_at
    FROM ticket_transcripts
    WHERE ticket_id = ?
    ORDER BY created_at DESC, id DESC
    `
  )
    .bind(ticket.id)
    .all();

  return jsonResponse({ transcripts: transcripts.results || [] });
};

export const onRequestPost = async ({ env, request, params }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.view');
  if (guard) return guard;

  const ticket = await env.DB.prepare('SELECT id, public_id, panel_id FROM tickets WHERE public_id = ? LIMIT 1')
    .bind(params.publicId)
    .first();
  if (!ticket) return jsonResponse({ error: 'Not found' }, { status: 404 });
  if (!(await staffCanAccessPanel(env, staff, ticket.panel_id))) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const trigger = String(body.trigger || 'manual').trim() || 'manual';

  try {
    await ensureRoleColorsSchema(env);
  } catch {}
  try {
    await ensureTicketTranscriptsSchema(env);
  } catch {}

  const snapshot = await buildTicketTranscriptSnapshot(env, ticket.public_id);
  if (!snapshot) return jsonResponse({ error: 'Not found' }, { status: 404 });

  const now = nowIso();
  const result = await env.DB.prepare(
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
      trigger,
      'staff',
      user.id,
      staff.id,
      now
    )
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
};

