import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const sinceId = Number(url.searchParams.get('since_id') || 0) || 0;
  const limitRaw = Number(url.searchParams.get('limit') || 200) || 200;
  const limit = Math.max(1, Math.min(500, limitRaw));

  const rows = await env.DB.prepare(
    `
    SELECT
      al.id,
      al.created_at AS event_created_at,
      al.entity_id AS transaction_id,
      al.metadata,
      p.email,
      p.status,
      p.product_key,
      p.items_in_cart,
      p.amount_gross,
      p.amount_net,
      p.coupon_discount_amount,
      p.currency,
      p.discord_id,
      p.created_at,
      p.webhook_sent
    FROM audit_logs al
    LEFT JOIN purchases p ON p.transaction_id = al.entity_id
    WHERE al.id > ?
      AND al.action = 'payhip.webhook'
      AND al.entity_type = 'purchase'
      AND COALESCE(json_extract(al.metadata, '$.reason'), '') IN (
        'inserted_for_bot',
        'upserted_for_bot',
        'inserted_and_notified',
        'upserted_existing'
      )
    ORDER BY al.id ASC
    LIMIT ?
    `
  )
    .bind(sinceId, limit)
    .all();

  const events = (rows.results || []).map((row) => {
    let meta = {};
    try {
      meta = row.metadata ? JSON.parse(row.metadata) : {};
    } catch {
      meta = {};
    }

    return {
      id: Number(row.id || 0) || 0,
      action: 'purchase.upserted',
      created_at: row.event_created_at,
      transaction_id: String(row.transaction_id || '').trim(),
      reason: String(meta.reason || '').trim(),
      webhook_already_sent: Boolean(meta.webhook_already_sent),
      purchase: {
        transaction_id: String(row.transaction_id || '').trim(),
        email: row.email || '',
        status: row.status || '',
        product_key: row.product_key || '',
        items_in_cart: row.items_in_cart || '',
        amount_gross: row.amount_gross || '',
        coupon_discount_amount: row.coupon_discount_amount || '',
        amount_net: row.amount_net || '',
        currency: row.currency || '',
        discord_id: row.discord_id || '',
        created_at: row.created_at || null,
        webhook_sent: Number(row.webhook_sent || 0) === 1,
      },
    };
  });

  return jsonResponse({ events });
};

