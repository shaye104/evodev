import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiAdmin } from '../../_lib/api.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const logs = await env.DB.prepare(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'
  ).all();
  return jsonResponse({ logs: logs.results || [] });
};
