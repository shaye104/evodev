import { jsonResponse } from '../_lib/utils.js';
import { getUserContext } from '../_lib/auth.js';
import { getAccessiblePanelsForStaff } from '../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  if (staff) {
    const panels = await getAccessiblePanelsForStaff(env, staff);
    return jsonResponse({ panels });
  }

  const results = await env.DB.prepare(
    'SELECT * FROM ticket_panels WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ panels: results.results || [] });
};
