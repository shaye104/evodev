const encoder = new TextEncoder();

function normalizeDiscordId(value) {
  const str = String(value || '').trim();
  const match = str.match(/\d{17,20}/);
  return match ? match[0] : '';
}

async function sha256Hex(value) {
  const data = encoder.encode(String(value || ''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqualHex(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

function extractProductKeys(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .map((item) => String(item.product_key || '').trim())
    .filter(Boolean);
}

function extractProductNames(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .map((item) => String(item.product_name || '').trim())
    .filter(Boolean);
}

function extractDiscordIdFromPayload(env, body) {
  const label = String(env.PAYHIP_DISCORD_FIELD_LABEL || '').trim();
  const candidates = [];

  const pushCandidate = (val) => {
    const id = normalizeDiscordId(val);
    if (id) candidates.push(id);
  };

  const fields =
    body.custom_fields ||
    body.custom_field_values ||
    body.custom_answers ||
    body.answers ||
    body.questions ||
    body.custom_fields_answers ||
    body.checkout_questions ||
    null;

  if (Array.isArray(fields)) {
    for (const entry of fields) {
      const key =
        entry.label || entry.name || entry.question || entry.field || '';
      const value =
        entry.value ||
        entry.answer ||
        entry.response ||
        entry.result ||
        '';
      if (label && key && key.toLowerCase().includes(label.toLowerCase())) {
        pushCandidate(value);
      }
      if (!label) {
        pushCandidate(value);
      }
    }
  } else if (fields && typeof fields === 'object') {
    for (const [key, value] of Object.entries(fields)) {
      if (label && key.toLowerCase().includes(label.toLowerCase())) {
        pushCandidate(value);
      }
      if (!label) {
        pushCandidate(value);
      }
    }
  }

  return candidates[0] || '';
}

function isAllowedProduct(env, body) {
  const allowed = String(env.PAYHIP_ALLOWED_PRODUCTS || '')
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const keys = extractProductKeys(body);
  if (keys.length === 0) return false;
  return keys.some((key) => allowed.includes(key));
}

function truncate(value, max = 256) {
  const str = String(value ?? '');
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function wrapCode(value) {
  return `\`${String(value ?? '').replace(/`/g, '')}\``;
}

function wrapSpoiler(value) {
  const clean = String(value ?? '').replace(/\|/g, '');
  return `||${clean}||`;
}

function toMoneyString(value, currency) {
  if (value === null || value === undefined || value === '') return '--';
  const raw = String(value).trim();
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return currency ? `${raw} ${currency}` : raw;
  }

  const hasDecimal = /[.,]/.test(raw);
  const normalized = hasDecimal ? num : num / 100;
  const formatted = normalized.toFixed(2);
  return currency ? `${formatted} ${currency}` : formatted;
}

async function sendPaidWebhookEmbed(env, order) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  const currency = order.currency || '';
  const embed = {
    title: 'New Purchase',
    color: 0x2ecc71,
    timestamp: order.created_at || new Date().toISOString(),
    fields: [
      {
        name: 'Purchased Products',
        value: wrapCode(truncate(order.items_in_cart || '--')),
        inline: true,
      },
      {
        name: 'Order ID',
        value: wrapCode(truncate(order.transaction_id || '--')),
        inline: true,
      },
      {
        name: 'Order Status',
        value: wrapCode(truncate(order.status || '--')),
        inline: true,
      },
      {
        name: 'Gross Amount',
        value: wrapCode(truncate(toMoneyString(order.amount_gross, currency))),
        inline: true,
      },
      {
        name: 'Coupon Discount',
        value: wrapCode(
          truncate(toMoneyString(order.coupon_discount_amount, currency))
        ),
        inline: true,
      },
      {
        name: 'Net Amount',
        value: wrapCode(truncate(toMoneyString(order.amount_net, currency))),
        inline: true,
      },
      {
        name: 'Discord ID',
        value: wrapCode(truncate(order.discord_id || '--')),
        inline: true,
      },
      {
        name: 'Email Address',
        value: wrapSpoiler(
          wrapCode(truncate(String(order.email || '').toLowerCase() || '--'))
        ),
        inline: true,
      },
    ],
    footer: { text: 'Purchased On' },
  };

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error(`[payhip] webhook log error: ${err.message}`);
  }
}

module.exports = {
  sha256Hex,
  safeEqualHex,
  extractProductKeys,
  extractProductNames,
  extractDiscordIdFromPayload,
  isAllowedProduct,
  sendPaidWebhookEmbed,
};
