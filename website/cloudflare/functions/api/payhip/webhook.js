import { jsonResponse, nowIso } from '../../_lib/utils.js';
import {
  sha256Hex,
  safeEqualHex,
  extractProductKeys,
  extractProductNames,
  extractDiscordIdFromPayload,
  isAllowedProduct,
  sendPaidWebhookEmbed,
} from '../../_lib/payhip.js';

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length === 0 ? null : str;
}

export const onRequestPost = async ({ env, request }) => {
  if (!env.PAYHIP_API_KEY) {
    return jsonResponse(
      { error: 'PAYHIP_API_KEY is not configured' },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const signature = String(body.signature || '').trim();
  const expected = await sha256Hex(env.PAYHIP_API_KEY);
  if (!safeEqualHex(signature, expected)) {
    return jsonResponse({ error: 'Invalid signature' }, { status: 401 });
  }

  if (body.type !== 'paid') {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!isAllowedProduct(env, body)) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const transactionId = String(body.id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!transactionId || !email) {
    return jsonResponse({ error: 'Missing transaction data' }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    'SELECT webhook_sent FROM purchases WHERE transaction_id = ? LIMIT 1'
  )
    .bind(transactionId)
    .first();
  const alreadySent = existing?.webhook_sent === 1;

  const productKeys = extractProductKeys(body);
  const productNames = extractProductNames(body);
  const createdAt =
    typeof body.date === 'number'
      ? new Date(body.date * 1000).toISOString()
      : nowIso();
  const discordId = extractDiscordIdFromPayload(env, body);

  const order = {
    transaction_id: transactionId,
    email,
    product_key: productKeys[0] || '',
    items_in_cart: productNames.join(', '),
    status: String(body.status || body.type || 'paid'),
    amount_gross:
      body.amount_gross ??
      body.gross_amount ??
      body.gross ??
      body.price ??
      '',
    amount_net: body.amount_net ?? body.net_amount ?? body.net ?? '',
    coupon_discount_amount:
      body.coupon_discount_amount ??
      body.discount_amount ??
      body.coupon_discount ??
      '',
    currency: body.currency || '',
    discord_id: discordId || '',
    created_at: createdAt,
    redeemed_at: null,
    discord_user_id: '',
    webhook_sent: alreadySent ? 1 : 0,
  };

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
      cleanValue(order.transaction_id),
      cleanValue(order.email),
      cleanValue(order.product_key),
      cleanValue(order.items_in_cart),
      cleanValue(order.status),
      cleanValue(order.amount_gross),
      cleanValue(order.coupon_discount_amount),
      cleanValue(order.amount_net),
      cleanValue(order.currency),
      cleanValue(order.discord_id),
      cleanValue(order.created_at),
      cleanValue(order.redeemed_at),
      cleanValue(order.discord_user_id),
      order.webhook_sent ? 1 : 0
    )
    .run();

  if (!alreadySent) {
    await sendPaidWebhookEmbed(env, order);
    await env.DB.prepare(
      'UPDATE purchases SET webhook_sent = 1 WHERE transaction_id = ?'
    )
      .bind(transactionId)
      .run();
  }

  return jsonResponse({ ok: true });
};
