import { jsonResponse } from '../../../_lib/utils.js';
import { requireBotAuth } from '../../../_lib/bot.js';

export const onRequestGet = async ({ env, request, params }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const purchase = await env.DB.prepare(
    'SELECT * FROM purchases WHERE transaction_id = ? LIMIT 1'
  )
    .bind(params.transactionId)
    .first();

  if (!purchase) return jsonResponse({ error: 'Not found' }, { status: 404 });
  return jsonResponse({ purchase });
};
