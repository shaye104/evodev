import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.audit'));
  if (guard) return guard;

  const logs = await env.DB.prepare(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'
  ).all();
  return jsonResponse({ logs: logs.results || [] });
};
