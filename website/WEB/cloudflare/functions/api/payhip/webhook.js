import { jsonResponse, nowIso } from '../../_lib/utils.js';
import {
  sha256Hex,
  safeEqualHex,
  extractProductKeys,
  extractProductNames,
  extractDiscordIdFromPayload,
  isAllowedProduct,
} from '../../_lib/payhip.js';

function cleanValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length === 0 ? null : str;
}

async function logWebhookAudit(env, metadata = {}) {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        null,
        null,
        'system',
        'payhip.webhook',
        'purchase',
        String(metadata.transaction_id || metadata.entity_id || ''),
        JSON.stringify(metadata),
        nowIso()
      )
      .run();
  } catch (err) {
    console.warn(`[payhip] webhook audit log failed: ${String(err?.message || err)}`);
  }
}

export const onRequestPost = async ({ env, request }) => {
  const requestId = String(request.headers.get('cf-ray') || '').trim();
  const payhipApiKey = String(env.PAYHIP_API_KEY || '').trim();

  if (!payhipApiKey) {
    await logWebhookAudit(env, {
      request_id: requestId,
      reason: 'missing_payhip_api_key',
    });
    return jsonResponse(
      { error: 'PAYHIP_API_KEY is not configured', debug: { reason: 'missing_payhip_api_key' } },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    await logWebhookAudit(env, {
      request_id: requestId,
      reason: 'invalid_json',
    });
    return jsonResponse(
      { error: 'Invalid JSON body', debug: { reason: 'invalid_json' } },
      { status: 400 }
    );
  }

  const eventType = String(body.type || '').trim().toLowerCase();
  const eventStatus = String(body.status || '').trim().toLowerCase();
  const transactionId = String(body.id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  const signature = String(body.signature || '').trim();
  const expected = await sha256Hex(payhipApiKey);
  if (!safeEqualHex(signature, expected)) {
    await logWebhookAudit(env, {
      request_id: requestId,
      transaction_id: transactionId,
      event_type: eventType,
      event_status: eventStatus,
      reason: 'invalid_signature',
    });
    return jsonResponse(
      {
        error: 'Invalid signature',
        debug: { reason: 'invalid_signature', event_type: eventType, event_status: eventStatus },
      },
      { status: 401 }
    );
  }

  const isPurchaseEvent =
    eventType === 'paid' ||
    eventType === 'free' ||
    eventType === 'free_purchase' ||
    eventType === 'purchase' ||
    eventStatus === 'paid' ||
    eventStatus === 'complete' ||
    eventStatus === 'completed' ||
    eventStatus === 'success';

  if (!isPurchaseEvent) {
    await logWebhookAudit(env, {
      request_id: requestId,
      transaction_id: transactionId,
      event_type: eventType,
      event_status: eventStatus,
      reason: 'ignored_event_type',
    });
    return jsonResponse({
      ok: true,
      ignored: true,
      debug: { reason: 'ignored_event_type', event_type: eventType, event_status: eventStatus },
    });
  }

  if (!isAllowedProduct(env, body)) {
    await logWebhookAudit(env, {
      request_id: requestId,
      transaction_id: transactionId,
      event_type: eventType,
      event_status: eventStatus,
      reason: 'ignored_product',
      product_keys: extractProductKeys(body),
    });
    return jsonResponse({
      ok: true,
      ignored: true,
      debug: { reason: 'ignored_product', product_keys: extractProductKeys(body) },
    });
  }

  if (!transactionId || !email) {
    await logWebhookAudit(env, {
      request_id: requestId,
      transaction_id: transactionId,
      event_type: eventType,
      event_status: eventStatus,
      reason: 'missing_transaction_data',
    });
    return jsonResponse(
      { error: 'Missing transaction data', debug: { reason: 'missing_transaction_data' } },
      { status: 400 }
    );
  }

  const existing = await env.DB.prepare(
    'SELECT transaction_id, webhook_sent FROM purchases WHERE transaction_id = ? LIMIT 1'
  )
    .bind(transactionId)
    .first();
  const existedBefore = Boolean(existing?.transaction_id);
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

  await logWebhookAudit(env, {
    request_id: requestId,
    transaction_id: transactionId,
    event_type: eventType,
    event_status: eventStatus,
    reason: existedBefore ? 'upserted_for_bot' : 'inserted_for_bot',
    webhook_already_sent: Boolean(alreadySent),
    product_keys: productKeys,
  });

  return jsonResponse({
    ok: true,
    debug: {
      reason: existedBefore ? 'upserted_for_bot' : 'inserted_for_bot',
      webhook_already_sent: Boolean(alreadySent),
      transaction_id: transactionId,
    },
  });
};
