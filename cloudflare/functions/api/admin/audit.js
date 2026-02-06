const { jsonResponse } = require('../../_lib/utils');
const { getUserContext } = require('../../_lib/auth');
const { requireApiAdmin } = require('../../_lib/api');

exports.onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiAdmin(staff);
  if (guard) return guard;

  const logs = await env.DB.prepare(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'
  ).all();
  return jsonResponse({ logs: logs.results || [] });
};
