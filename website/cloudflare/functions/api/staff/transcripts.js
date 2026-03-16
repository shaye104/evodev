import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../_lib/api.js';
import { ensurePanelRoleAccessSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.view');
  if (guard) return guard;

  const url = new URL(request.url);
  const panelId = url.searchParams.get('panel_id');
  const trigger = url.searchParams.get('trigger');

  const clauses = [];
  const values = [];

  // Panel access restrictions (same logic as staff tickets list).
  if (!staff.is_admin) {
    try {
      await ensurePanelRoleAccessSchema(env);
      clauses.push(
        `(
          NOT EXISTS (
            SELECT 1 FROM ticket_panel_role_access a
            WHERE a.panel_id = t.panel_id
          )
          OR EXISTS (
            SELECT 1 FROM ticket_panel_role_access a
            WHERE a.panel_id = t.panel_id AND a.role_id = ?
          )
        )`
      );
      values.push(staff.role_id);
    } catch {
      // If schema can't be ensured, fall back to showing all transcripts.
    }
  }

  if (panelId) {
    clauses.push('t.panel_id = ?');
    values.push(panelId);
  }
  if (trigger) {
    clauses.push('tt.trigger = ?');
    values.push(trigger);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const res = await env.DB.prepare(
    `
    SELECT
      tt.id,
      tt.ticket_id,
      tt.ticket_public_id,
      tt.trigger,
      tt.created_at,
      t.subject,
      t.panel_id,
      p.name AS panel_name,
      s.name AS status_name,
      s.is_closed
    FROM ticket_transcripts tt
    JOIN tickets t ON t.id = tt.ticket_id
    LEFT JOIN ticket_panels p ON p.id = t.panel_id
    LEFT JOIN ticket_statuses s ON s.id = t.status_id
    ${where}
    ORDER BY tt.created_at DESC, tt.id DESC
    LIMIT 250
    `
  )
    .bind(...values)
    .all();

  return jsonResponse({ transcripts: res.results || [] });
};

