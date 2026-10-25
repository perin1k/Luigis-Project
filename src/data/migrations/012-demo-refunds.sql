-- Separate demonstration accounting: never represents Stripe or a real transfer.
CREATE UNIQUE INDEX demo_payment_order_reference ON demo_payment_attempts(id,order_id);
CREATE TABLE demo_refund_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  cancellation_request_id TEXT NOT NULL,
  adapter TEXT NOT NULL CHECK(adapter='luigis-demo-v1'),
  policy_reference TEXT NOT NULL CHECK(policy_reference='demo-full-refund-v1'),
  state TEXT NOT NULL CHECK(state IN ('pending','succeeded','failed')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK(currency='USD'),
  approved_by TEXT NOT NULL REFERENCES staff_users(id),
  requested_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',requested_at) IS requested_at),
  confirmed_at TEXT, failed_at TEXT, evidence_id TEXT UNIQUE,
  CHECK ((state='succeeded')=(confirmed_at IS NOT NULL)),
  CHECK ((state='failed')=(failed_at IS NOT NULL)),
  CHECK ((state='succeeded')=(evidence_id IS NOT NULL)),
  CHECK (confirmed_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',confirmed_at) IS confirmed_at AND confirmed_at>=requested_at)),
  CHECK (failed_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',failed_at) IS failed_at AND failed_at>=requested_at)),
  UNIQUE(id,payment_id),
  FOREIGN KEY(payment_id,order_id) REFERENCES demo_payment_attempts(id,order_id),
  FOREIGN KEY(cancellation_request_id,order_id) REFERENCES cancellation_requests(id,order_id)
) STRICT;
CREATE UNIQUE INDEX one_successful_demo_refund ON demo_refund_attempts(payment_id) WHERE state='succeeded';
CREATE UNIQUE INDEX one_pending_demo_refund ON demo_refund_attempts(payment_id) WHERE state='pending';
CREATE INDEX demo_refunds_by_order ON demo_refund_attempts(order_id,requested_at);
CREATE TRIGGER demo_refund_insert_guard BEFORE INSERT ON demo_refund_attempts
WHEN NEW.state!='pending' OR EXISTS(SELECT 1 FROM demo_refund_attempts r WHERE r.payment_id=NEW.payment_id AND r.state='succeeded') OR NOT EXISTS (
  SELECT 1 FROM demo_payment_attempts p JOIN orders o ON o.id=p.order_id
  JOIN cancellation_requests c ON c.id=NEW.cancellation_request_id AND c.order_id=o.id
  JOIN staff_users u ON u.id=NEW.approved_by
  WHERE p.id=NEW.payment_id AND p.state='succeeded' AND p.amount_cents=NEW.amount_cents
    AND o.fulfillment_status='Cancelled' AND c.state='approved' AND u.role='admin' AND u.state='active'
    AND NEW.requested_at>=p.paid_at AND NEW.requested_at>=c.decided_at)
BEGIN SELECT RAISE(ABORT,'Full demo refund requires confirmed payment, approved cancellation and active admin'); END;
CREATE TRIGGER demo_refund_update_guard BEFORE UPDATE ON demo_refund_attempts
WHEN OLD.state!='pending' OR NEW.state NOT IN ('succeeded','failed') OR NEW.id IS NOT OLD.id
  OR NEW.payment_id IS NOT OLD.payment_id OR NEW.order_id IS NOT OLD.order_id
  OR NEW.cancellation_request_id IS NOT OLD.cancellation_request_id OR NEW.amount_cents IS NOT OLD.amount_cents
  OR NEW.currency IS NOT OLD.currency OR NEW.adapter IS NOT OLD.adapter OR NEW.policy_reference IS NOT OLD.policy_reference
  OR NEW.approved_by IS NOT OLD.approved_by OR NEW.requested_at IS NOT OLD.requested_at
BEGIN SELECT RAISE(ABORT,'Preserve demo refund request and final outcome'); END;
CREATE TRIGGER demo_refund_keep_history BEFORE DELETE ON demo_refund_attempts
BEGIN SELECT RAISE(ABORT,'Preserve demo refund history'); END;
CREATE TABLE demo_financial_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL REFERENCES demo_payment_attempts(id),
  refund_id TEXT,
  component TEXT NOT NULL CHECK(component IN ('item','tax','tip')),
  signed_cents INTEGER NOT NULL CHECK(signed_cents BETWEEN -9007199254740991 AND 9007199254740991),
  effective_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',effective_at) IS effective_at),
  FOREIGN KEY(refund_id,payment_id) REFERENCES demo_refund_attempts(id,payment_id)
) STRICT;
CREATE UNIQUE INDEX demo_payment_component ON demo_financial_allocations(payment_id,component) WHERE refund_id IS NULL;
CREATE UNIQUE INDEX demo_refund_component ON demo_financial_allocations(refund_id,component) WHERE refund_id IS NOT NULL;
CREATE INDEX demo_allocations_by_date ON demo_financial_allocations(effective_at);
CREATE TRIGGER demo_allocation_guard BEFORE INSERT ON demo_financial_allocations
WHEN NOT EXISTS(SELECT 1 FROM demo_payment_attempts p JOIN order_quotes q ON q.id=p.quote_id
  WHERE p.id=NEW.payment_id AND p.state='succeeded' AND
  ((NEW.refund_id IS NULL AND NEW.effective_at=p.paid_at AND NEW.signed_cents=CASE NEW.component WHEN 'item' THEN q.item_subtotal_cents WHEN 'tax' THEN q.tax_cents ELSE q.tip_cents END)
  OR EXISTS(SELECT 1 FROM demo_refund_attempts r WHERE r.id=NEW.refund_id AND r.payment_id=p.id AND r.state='succeeded'
    AND NEW.effective_at=r.confirmed_at AND NEW.signed_cents=-CASE NEW.component WHEN 'item' THEN q.item_subtotal_cents WHEN 'tax' THEN q.tax_cents ELSE q.tip_cents END)))
BEGIN SELECT RAISE(ABORT,'Demo allocation must match its confirmed component and effective date'); END;
CREATE TRIGGER demo_allocation_immutable BEFORE UPDATE ON demo_financial_allocations
BEGIN SELECT RAISE(ABORT,'Demo allocations are append-only'); END;
CREATE TRIGGER demo_allocation_keep_history BEFORE DELETE ON demo_financial_allocations
BEGIN SELECT RAISE(ABORT,'Preserve demo allocations'); END;
-- Non-destructive backfill uses the original successful payment and quote times/amounts.
INSERT INTO demo_financial_allocations(id,payment_id,component,signed_cents,effective_at)
SELECT p.id||':'||x.component,p.id,x.component,
  CASE x.component WHEN 'item' THEN q.item_subtotal_cents WHEN 'tax' THEN q.tax_cents ELSE q.tip_cents END,p.paid_at
FROM demo_payment_attempts p JOIN order_quotes q ON q.id=p.quote_id
CROSS JOIN (SELECT 'item' AS component UNION ALL SELECT 'tax' UNION ALL SELECT 'tip') x WHERE p.state='succeeded';
