import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length === 0 ? null : str;
}

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const url = new URL(request.url);
  const discordId = url.searchParams.get('discord_id');
  if (!discordId) {
    return jsonResponse({ error: 'discord_id required' }, { status: 400 });
  }

  const results = await env.DB.prepare(
    'SELECT * FROM purchases WHERE discord_id = ? ORDER BY created_at DESC'
  )
    .bind(discordId)
    .all();

  return jsonResponse({ purchases: results.results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });

  const transactionId = String(body.transaction_id || '').trim();
  if (!transactionId) {
    return jsonResponse({ error: 'transaction_id required' }, { status: 400 });
  }

  await env.DB.prepare(
    `
    INSERT INTO purchases (
      transaction_id, email, product_key, items_in_cart, status,
      amount_gross, coupon_discount_amount, amount_net, currency,
      discord_id, created_at, redeemed_at, discord_user_id, webhook_sent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(transaction_id) DO UPDATE SET
      email = excluded.email,
      product_key = excluded.product_key,
      items_in_cart = excluded.items_in_cart,
      status = excluded.status,
      amount_gross = excluded.amount_gross,
      coupon_discount_amount = excluded.coupon_discount_amount,
      amount_net = excluded.amount_net,
      currency = excluded.currency,
      discord_id = excluded.discord_id,
      created_at = excluded.created_at,
      redeemed_at = excluded.redeemed_at,
      discord_user_id = excluded.discord_user_id,
      webhook_sent = excluded.webhook_sent
    `
  )
    .bind(
      cleanValue(body.transaction_id),
      cleanValue(body.email),
      cleanValue(body.product_key),
      cleanValue(body.items_in_cart),
      cleanValue(body.status),
      cleanValue(body.amount_gross),
      cleanValue(body.coupon_discount_amount),
      cleanValue(body.amount_net),
      cleanValue(body.currency),
      cleanValue(body.discord_id),
      cleanValue(body.created_at),
      cleanValue(body.redeemed_at),
      cleanValue(body.discord_user_id),
      body.webhook_sent ? 1 : 0
    )
    .run();

  return jsonResponse({ ok: true });
};
