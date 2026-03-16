CREATE TABLE IF NOT EXISTS purchases (
  transaction_id TEXT PRIMARY KEY,
  email TEXT,
  product_key TEXT,
  items_in_cart TEXT,
  status TEXT,
  amount_gross TEXT,
  coupon_discount_amount TEXT,
  amount_net TEXT,
  currency TEXT,
  discord_id TEXT,
  created_at TEXT,
  redeemed_at TEXT,
  discord_user_id TEXT,
  webhook_sent INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchases_discord_id ON purchases (discord_id);
