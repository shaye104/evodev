import { jsonResponse } from '../_lib/utils.js';

export const onRequestGet = async ({ env }) => {
  const results = await env.DB.prepare(
    'SELECT * FROM ticket_panels WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
  ).all();
  return jsonResponse({ panels: results.results || [] });
};
