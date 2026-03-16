import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.escalate');
  if (guard) return guard;

  const panels = await env.DB.prepare(
    'SELECT id, name, description, is_active, sort_order FROM ticket_panels WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
  ).all();

  return jsonResponse({ panels: panels.results || [] });
};

