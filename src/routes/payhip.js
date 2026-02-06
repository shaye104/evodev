const express = require('express');
const payhip = require('../payhip/service');
const { CONFIG } = require('../config');

function createPayhipRouter({ discord }) {
  const router = express.Router();

  router.post('/webhooks/payhip', async (req, res) => {
    console.log('[payhip] webhook received');
    if (!CONFIG.PAYHIP_API_KEY) {
      return res.status(500).send('Server missing Payhip API key.');
    }

    const body = req.body || {};
    const signature = String(body.signature || '').trim();
    const expected = payhip.sha256Hex(CONFIG.PAYHIP_API_KEY);

    if (!payhip.safeEqualHex(signature, expected)) {
      return res.status(401).send('Invalid signature.');
    }

    if (body.type !== 'paid') {
      console.log(`[payhip] ignored event type: ${body.type}`);
      return res.status(200).send('Ignored.');
    }

    const transactionId = String(body.id || '').trim();
    const email = String(body.email || '').trim().toLowerCase();

    if (!transactionId || !email) {
      return res.status(400).send('Missing transaction data.');
    }

    if (!payhip.isAllowedProduct(body)) {
      console.log('[payhip] ignored product');
      return res.status(200).send('Ignored product.');
    }

    const dbEnabled = payhip.isDbConfigured();
    const store = payhip.shouldWriteJson() ? payhip.loadStoreCached() : null;
    let order = null;

    if (dbEnabled) {
      try {
        await payhip.initPayhipDb();
        order = await payhip.dbGetPurchaseById(transactionId);
      } catch (err) {
        console.warn(`[db] Lookup failed: ${err.message}`);
      }
    }

    if (!order && store) {
      order = store.purchases[transactionId] || null;
    }

    if (!order) {
      const productKeys = payhip.extractProductKeys(body);
      const productNames = payhip.extractProductNames(body);
      const createdAt =
        typeof body.date === 'number'
          ? new Date(body.date * 1000).toISOString()
          : new Date().toISOString();
      const discordId = payhip.extractDiscordIdFromPayload(body);
      order = {
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
        webhook_sent: false,
      };
      if (store) {
        store.purchases[transactionId] = order;
      }
      if (dbEnabled) {
        await payhip.dbUpsertPurchase(order);
      }
    }

    if (!order.webhook_sent) {
      payhip
        .sendPaidWebhookEmbed(body)
        .then(async () => {
          order.webhook_sent = true;
          if (dbEnabled) {
            await payhip.dbUpsertPurchase(order);
          }
          if (store) {
            payhip.saveStoreCached(store);
          }
        })
        .catch((err) => {
          console.error(`[payhip] webhook log error: ${err.message}`);
        });
    } else if (store) {
      payhip.saveStoreCached(store);
    }

    if (order.discord_id && discord?.handleAutoRoleAndWelcome) {
      await discord.handleAutoRoleAndWelcome(order.discord_id);
    }

    return res.status(200).send('OK');
  });

  return router;
}

module.exports = { createPayhipRouter };
