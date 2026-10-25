-- Local demonstration outcomes only. No Stripe event, signature, live charge or card input.
CREATE TABLE demo_payment_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  quote_id TEXT NOT NULL,
  adapter TEXT NOT NULL CHECK (adapter = 'luigis-demo-v1'),
  method TEXT NOT NULL CHECK (method IN ('card','apple-pay')),
  state TEXT NOT NULL CHECK (state IN ('succeeded','failed')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  evidence_id TEXT NOT NULL UNIQUE,
  synthetic_last_four TEXT NOT NULL CHECK (length(synthetic_last_four)=4 AND synthetic_last_four NOT GLOB '*[^0-9]*'),
  created_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',created_at) IS created_at),
  paid_at TEXT, failed_at TEXT,
  CHECK ((state='succeeded')=(paid_at IS NOT NULL)),
  CHECK ((state='failed')=(failed_at IS NOT NULL)),
  CHECK ((state='succeeded' AND paid_at=created_at AND failed_at IS NULL)
    OR (state='failed' AND failed_at=created_at AND paid_at IS NULL)),
  FOREIGN KEY (quote_id,order_id) REFERENCES order_quotes(id,order_id)
) STRICT;
CREATE UNIQUE INDEX one_successful_demo_payment ON demo_payment_attempts(order_id) WHERE state='succeeded';
CREATE INDEX demo_payments_by_order ON demo_payment_attempts(order_id,created_at);
CREATE TABLE demo_payment_secrets (
  payment_id TEXT PRIMARY KEY NOT NULL REFERENCES demo_payment_attempts(id),
  key_id TEXT NOT NULL,
  nonce_hex TEXT NOT NULL CHECK (length(nonce_hex)=24 AND nonce_hex NOT GLOB '*[^0-9a-f]*'),
  ciphertext_hex TEXT NOT NULL CHECK (length(ciphertext_hex)=32 AND ciphertext_hex NOT GLOB '*[^0-9a-f]*'),
  tag_hex TEXT NOT NULL CHECK (length(tag_hex)=32 AND tag_hex NOT GLOB '*[^0-9a-f]*'),
  expires_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ',expires_at) IS expires_at)
) STRICT;
CREATE INDEX demo_secrets_by_expiry ON demo_payment_secrets(expires_at);
CREATE TRIGGER demo_payment_matches_quote BEFORE INSERT ON demo_payment_attempts
WHEN NOT EXISTS (SELECT 1 FROM order_quotes q JOIN orders o ON o.id=q.order_id
  WHERE q.id=NEW.quote_id AND q.order_id=NEW.order_id AND q.accepted_at IS NOT NULL
    AND o.accepted_quote_id=q.id AND q.total_cents=NEW.amount_cents AND q.currency=NEW.currency)
BEGIN SELECT RAISE(ABORT,'Demo payment must match its accepted quote'); END;
CREATE TRIGGER demo_success_requires_hold BEFORE INSERT ON demo_payment_attempts
WHEN NEW.state='succeeded' AND NOT EXISTS (SELECT 1 FROM fulfillment_bookings b JOIN capacity_holds h ON h.booking_id=b.id
  WHERE b.order_id=NEW.order_id AND h.state='confirmed' AND h.confirmed_at=NEW.paid_at AND h.expires_at>NEW.paid_at)
BEGIN SELECT RAISE(ABORT,'Demo success requires its confirmed unexpired hold'); END;
CREATE TRIGGER demo_payment_immutable_update BEFORE UPDATE ON demo_payment_attempts
BEGIN SELECT RAISE(ABORT,'Demo payment history is immutable'); END;
CREATE TRIGGER demo_payment_immutable_delete BEFORE DELETE ON demo_payment_attempts
BEGIN SELECT RAISE(ABORT,'Preserve demo payment history'); END;
