import { jsonResponse } from '../_lib/utils.js';

export const onRequestGet = async ({ env }) => {
  const results = await env.DB.prepare(
    'SELECT * FROM ticket_statuses ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ statuses: results.results || [] });
};
