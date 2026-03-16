import { jsonResponse } from '../../../../../_lib/utils.js';
import { getUserContext } from '../../../../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../../../../_lib/api.js';
import { staffCanAccessPanel, ensureTicketTranscriptsSchema } from '../../../../../_lib/db.js';
import { renderTranscriptHtml } from '../../../../../_lib/transcripts.js';

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

  const row = await env.DB.prepare(
    'SELECT * FROM ticket_transcripts WHERE id = ? AND ticket_id = ? LIMIT 1'
  )
    .bind(params.id, ticket.id)
    .first();

  if (!row) return jsonResponse({ error: 'Not found' }, { status: 404 });

  let snapshot = null;
  try {
    snapshot = JSON.parse(row.content || 'null');
  } catch {}

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'html').toLowerCase();

  if (format === 'json') {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set(
      'Content-Disposition',
      `attachment; filename="ticket_${ticket.public_id}_transcript_${row.id}.json"`
    );
    return new Response(row.content || '{}', { headers });
  }

  const html = renderTranscriptHtml(snapshot || { ticket, messages: [], claims: [], audit_logs: [], generated_at: row.created_at });
  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set(
    'Content-Disposition',
    `attachment; filename="ticket_${ticket.public_id}_transcript_${row.id}.html"`
  );
  return new Response(html, { headers });
};

