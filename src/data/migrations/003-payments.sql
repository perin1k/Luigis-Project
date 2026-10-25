-- Test-only financial storage. Provider verification and authorization are service responsibilities.
CREATE UNIQUE INDEX quotes_order_reference ON order_quotes(id, order_id);
CREATE UNIQUE INDEX lines_order_reference ON order_lines(id, order_id);
CREATE TABLE provider_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'stripe'),
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode = 'test'),
  provider_event_id TEXT NOT NULL CHECK (length(trim(provider_event_id)) > 0),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  verified_at TEXT,
  processed_at TEXT,
  processing_state TEXT NOT NULL DEFAULT 'pending' CHECK (processing_state IN ('pending', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 9007199254740991),
  sanitized_error_code TEXT,
  CHECK ((processing_state = 'processed') = (processed_at IS NOT NULL)),
  CHECK (processing_state != 'processed' OR verified_at IS NOT NULL),
  UNIQUE (provider, mode, provider_event_id),
  UNIQUE (id, provider, mode)
) STRICT;
CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  quote_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'stripe'),
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode = 'test'),
  provider_checkout_id TEXT,
  provider_payment_id TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'succeeded', 'failed', 'expired')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at TEXT, failed_at TEXT, evidence_event_id TEXT,
  CHECK ((state = 'succeeded') = (paid_at IS NOT NULL)),
  CHECK ((state = 'failed') = (failed_at IS NOT NULL)),
  CHECK (state != 'succeeded' OR (provider_payment_id IS NOT NULL AND evidence_event_id IS NOT NULL)),
  FOREIGN KEY (quote_id, order_id) REFERENCES order_quotes(id, order_id),
  FOREIGN KEY (evidence_event_id, provider, mode) REFERENCES provider_events(id, provider, mode),
  UNIQUE (provider, mode, provider_checkout_id),
  UNIQUE (provider, mode, provider_payment_id),
  UNIQUE (provider, mode, idempotency_key),
  UNIQUE (id, order_id)
) STRICT;
CREATE TABLE cancellation_requests (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  source TEXT NOT NULL CHECK (source IN ('customer', 'restaurant')),
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'denied')),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT, decided_by TEXT, decision_reason TEXT,
  CHECK ((state != 'pending') = (decided_at IS NOT NULL)),
  CHECK ((state != 'pending') = (decided_by IS NOT NULL)),
  CHECK (state = 'pending' OR length(trim(decided_by)) > 0),
  CHECK (state = 'pending' OR length(trim(coalesce(decision_reason, ''))) > 0),
  UNIQUE (id, order_id)
) STRICT;
CREATE UNIQUE INDEX one_pending_cancellation ON cancellation_requests(order_id) WHERE state = 'pending';
CREATE TABLE refunds (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  payment_attempt_id TEXT NOT NULL,
  cancellation_request_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode = 'test'),
  provider_refund_id TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'succeeded', 'failed')),
  requested_cents INTEGER NOT NULL CHECK (requested_cents BETWEEN 0 AND 9007199254740991),
  confirmed_cents INTEGER CHECK (confirmed_cents BETWEEN 0 AND 9007199254740991),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  confirmed_at TEXT, failed_at TEXT,
  approved_by TEXT NOT NULL CHECK (length(trim(approved_by)) > 0),
  policy_reference TEXT NOT NULL CHECK (policy_reference = 'demo-full-refund-v1'),
  evidence_event_id TEXT,
  CHECK ((state = 'succeeded') = (confirmed_at IS NOT NULL)),
  CHECK ((state = 'succeeded') = (confirmed_cents IS NOT NULL)),
  CHECK ((state = 'failed') = (failed_at IS NOT NULL)),
  CHECK (state != 'succeeded' OR (confirmed_cents = requested_cents AND provider_refund_id IS NOT NULL AND evidence_event_id IS NOT NULL)),
  FOREIGN KEY (payment_attempt_id, order_id) REFERENCES payment_attempts(id, order_id),
  FOREIGN KEY (cancellation_request_id, order_id) REFERENCES cancellation_requests(id, order_id),
  FOREIGN KEY (evidence_event_id, provider, mode) REFERENCES provider_events(id, provider, mode),
  UNIQUE (provider, mode, provider_refund_id),
  UNIQUE (provider, mode, idempotency_key),
  UNIQUE (id, payment_attempt_id, order_id)
) STRICT;
CREATE UNIQUE INDEX one_reserved_full_refund ON refunds(payment_attempt_id) WHERE state IN ('pending', 'succeeded');
CREATE TABLE financial_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  payment_attempt_id TEXT NOT NULL,
  refund_id TEXT,
  order_line_id TEXT,
  component TEXT NOT NULL CHECK (component IN ('item', 'tax', 'tip', 'processor_cost')),
  signed_cents INTEGER NOT NULL CHECK (signed_cents BETWEEN -9007199254740991 AND 9007199254740991 AND signed_cents != 0),
  effective_at TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) > 0),
  reversal_of_id TEXT UNIQUE REFERENCES financial_allocations(id),
  CHECK ((component = 'item') = (order_line_id IS NOT NULL)),
  CHECK ((refund_id IS NOT NULL) = (reversal_of_id IS NOT NULL)),
  CHECK ((refund_id IS NULL AND component != 'processor_cost' AND signed_cents > 0)
    OR (refund_id IS NULL AND component = 'processor_cost' AND signed_cents < 0)
    OR (refund_id IS NOT NULL AND component != 'processor_cost' AND signed_cents < 0)),
  FOREIGN KEY (payment_attempt_id, order_id) REFERENCES payment_attempts(id, order_id),
  FOREIGN KEY (refund_id, payment_attempt_id, order_id) REFERENCES refunds(id, payment_attempt_id, order_id),
  FOREIGN KEY (order_line_id, order_id) REFERENCES order_lines(id, order_id)
) STRICT;
CREATE UNIQUE INDEX allocation_line_source ON financial_allocations(payment_attempt_id, source_reference, component, order_line_id)
  WHERE order_line_id IS NOT NULL;
CREATE UNIQUE INDEX allocation_order_source ON financial_allocations(payment_attempt_id, source_reference, component)
  WHERE order_line_id IS NULL;
CREATE INDEX payments_by_order ON payment_attempts(order_id, state);
CREATE INDEX refunds_by_order ON refunds(order_id, state);
CREATE INDEX allocations_by_payment ON financial_allocations(payment_attempt_id, component);
CREATE INDEX allocations_by_date ON financial_allocations(effective_at, component);

CREATE TRIGGER cancellation_insert_pending BEFORE INSERT ON cancellation_requests WHEN NEW.state != 'pending'
BEGIN SELECT RAISE(ABORT, 'Create pending cancellation before recording a decision'); END;
CREATE TRIGGER cancellation_customer_cutoff BEFORE INSERT ON cancellation_requests
WHEN NEW.source = 'customer' AND coalesce((SELECT fulfillment_status FROM orders WHERE id = NEW.order_id), 'Received') != 'Received'
BEGIN SELECT RAISE(ABORT, 'Customer cancellation is unavailable after preparation'); END;
CREATE TRIGGER cancellation_hold_preparation BEFORE UPDATE OF fulfillment_status ON orders
WHEN NEW.fulfillment_status IN ('Preparing', 'Baking', 'Ready', 'Completed') AND EXISTS (
  SELECT 1 FROM cancellation_requests WHERE order_id = OLD.id AND state = 'pending')
BEGIN SELECT RAISE(ABORT, 'Pending cancellation holds preparation'); END;
CREATE TRIGGER cancellation_decision_fixed BEFORE UPDATE ON cancellation_requests WHEN OLD.state != 'pending'
BEGIN SELECT RAISE(ABORT, 'Cancellation decision is immutable'); END;
CREATE TRIGGER event_verified_fixed BEFORE UPDATE ON provider_events
WHEN OLD.verified_at IS NOT NULL AND NEW.verified_at IS NOT OLD.verified_at
  AND EXISTS (SELECT 1 FROM payment_attempts WHERE evidence_event_id = OLD.id AND state = 'succeeded'
    UNION ALL SELECT 1 FROM refunds WHERE evidence_event_id = OLD.id AND state = 'succeeded')
BEGIN SELECT RAISE(ABORT, 'Confirmed financial evidence cannot be revoked'); END;
CREATE TRIGGER event_processed_fixed BEFORE UPDATE ON provider_events WHEN OLD.processing_state = 'processed'
BEGIN SELECT RAISE(ABORT, 'Processed event is immutable'); END;
CREATE TRIGGER payment_provider_references_fixed BEFORE UPDATE ON payment_attempts
WHEN (OLD.provider_checkout_id IS NOT NULL AND NEW.provider_checkout_id IS NOT OLD.provider_checkout_id)
  OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS NOT OLD.provider_payment_id)
BEGIN SELECT RAISE(ABORT, 'Provider payment references cannot be replaced'); END;
CREATE TRIGGER refund_provider_reference_fixed BEFORE UPDATE ON refunds
WHEN OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS NOT OLD.provider_refund_id
BEGIN SELECT RAISE(ABORT, 'Provider refund reference cannot be replaced'); END;
CREATE TRIGGER allocation_append_only BEFORE UPDATE ON financial_allocations
BEGIN SELECT RAISE(ABORT, 'Financial allocations are append-only'); END;
CREATE TRIGGER allocation_verified BEFORE INSERT ON financial_allocations
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_attempts WHERE id = NEW.payment_attempt_id AND state = 'succeeded')
    THEN RAISE(ABORT, 'Allocations require confirmed payment') END;
  SELECT CASE WHEN NEW.refund_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM refunds WHERE id = NEW.refund_id AND state = 'succeeded')
    THEN RAISE(ABORT, 'Reversals require confirmed refund') END;
  SELECT CASE WHEN NEW.reversal_of_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM financial_allocations a WHERE a.id = NEW.reversal_of_id
      AND a.refund_id IS NULL AND a.payment_attempt_id = NEW.payment_attempt_id
      AND a.order_id = NEW.order_id AND a.component = NEW.component
      AND a.order_line_id IS NEW.order_line_id AND a.signed_cents = -NEW.signed_cents
  ) THEN RAISE(ABORT, 'Refund must reverse its own captured component exactly') END;
  SELECT CASE WHEN NEW.refund_id IS NULL AND NEW.component != 'processor_cost' AND
    NEW.signed_cents + coalesce((SELECT sum(signed_cents) FROM financial_allocations
      WHERE payment_attempt_id = NEW.payment_attempt_id AND refund_id IS NULL AND component = NEW.component
        AND order_line_id IS NEW.order_line_id), 0)
    > CASE NEW.component
      WHEN 'item' THEN (SELECT line_subtotal_cents FROM order_lines WHERE id = NEW.order_line_id)
      WHEN 'tax' THEN (SELECT q.tax_cents FROM order_quotes q JOIN payment_attempts p ON p.quote_id = q.id WHERE p.id = NEW.payment_attempt_id)
      WHEN 'tip' THEN (SELECT q.tip_cents FROM order_quotes q JOIN payment_attempts p ON p.quote_id = q.id WHERE p.id = NEW.payment_attempt_id)
    END THEN RAISE(ABORT, 'Allocation exceeds captured component') END;
END;
CREATE TRIGGER provider_events_identity_fixed BEFORE UPDATE ON provider_events
WHEN NEW.id IS NOT OLD.id OR NEW.provider IS NOT OLD.provider OR NEW.mode IS NOT OLD.mode OR NEW.provider_event_id IS NOT OLD.provider_event_id OR NEW.event_type IS NOT OLD.event_type OR NEW.occurred_at IS NOT OLD.occurred_at OR NEW.received_at IS NOT OLD.received_at
BEGIN SELECT RAISE(ABORT, 'Financial record identity is immutable'); END;
CREATE TRIGGER payment_attempts_identity_fixed BEFORE UPDATE ON payment_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.quote_id IS NOT OLD.quote_id OR NEW.provider IS NOT OLD.provider OR NEW.mode IS NOT OLD.mode OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.currency IS NOT OLD.currency OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Financial record identity is immutable'); END;
CREATE TRIGGER cancellation_requests_identity_fixed BEFORE UPDATE ON cancellation_requests
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.source IS NOT OLD.source OR NEW.reason_code IS NOT OLD.reason_code OR NEW.requested_at IS NOT OLD.requested_at
BEGIN SELECT RAISE(ABORT, 'Financial record identity is immutable'); END;
CREATE TRIGGER refunds_identity_fixed BEFORE UPDATE ON refunds
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.payment_attempt_id IS NOT OLD.payment_attempt_id OR NEW.cancellation_request_id IS NOT OLD.cancellation_request_id OR NEW.provider IS NOT OLD.provider OR NEW.mode IS NOT OLD.mode OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.requested_cents IS NOT OLD.requested_cents OR NEW.approved_by IS NOT OLD.approved_by OR NEW.policy_reference IS NOT OLD.policy_reference OR NEW.requested_at IS NOT OLD.requested_at
BEGIN SELECT RAISE(ABORT, 'Financial record identity is immutable'); END;
CREATE TRIGGER provider_events_keep_history BEFORE DELETE ON provider_events
BEGIN SELECT RAISE(ABORT, 'Preserve financial history'); END;
CREATE TRIGGER payment_attempts_keep_history BEFORE DELETE ON payment_attempts
BEGIN SELECT RAISE(ABORT, 'Preserve financial history'); END;
CREATE TRIGGER cancellation_requests_keep_history BEFORE DELETE ON cancellation_requests
BEGIN SELECT RAISE(ABORT, 'Preserve financial history'); END;
CREATE TRIGGER refunds_keep_history BEFORE DELETE ON refunds
BEGIN SELECT RAISE(ABORT, 'Preserve financial history'); END;
CREATE TRIGGER financial_allocations_keep_history BEFORE DELETE ON financial_allocations
BEGIN SELECT RAISE(ABORT, 'Preserve financial history'); END;
CREATE TRIGGER payment_attempts_success_fixed BEFORE UPDATE ON payment_attempts WHEN OLD.state = 'succeeded'
BEGIN SELECT RAISE(ABORT, 'Confirmed financial record is immutable'); END;
CREATE TRIGGER payment_validate_insert BEFORE INSERT ON payment_attempts
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM order_quotes q JOIN orders o ON o.id = q.order_id
    WHERE q.id = NEW.quote_id AND q.order_id = NEW.order_id AND q.accepted_at IS NOT NULL
      AND o.accepted_quote_id = q.id AND q.total_cents = NEW.amount_cents AND q.currency = NEW.currency)
    THEN RAISE(ABORT, 'Payment must match its accepted order quote') END;
  SELECT CASE WHEN NEW.state = 'succeeded' AND NOT EXISTS (
    SELECT 1 FROM provider_events WHERE id = NEW.evidence_event_id AND verified_at IS NOT NULL
      AND provider = NEW.provider AND mode = NEW.mode)
    THEN RAISE(ABORT, 'Payment success requires verified provider evidence') END;
END;
CREATE TRIGGER payment_validate_update BEFORE UPDATE ON payment_attempts
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM order_quotes q JOIN orders o ON o.id = q.order_id
    WHERE q.id = NEW.quote_id AND q.order_id = NEW.order_id AND q.accepted_at IS NOT NULL
      AND o.accepted_quote_id = q.id AND q.total_cents = NEW.amount_cents AND q.currency = NEW.currency)
    THEN RAISE(ABORT, 'Payment must match its accepted order quote') END;
  SELECT CASE WHEN NEW.state = 'succeeded' AND NOT EXISTS (
    SELECT 1 FROM provider_events WHERE id = NEW.evidence_event_id AND verified_at IS NOT NULL
      AND provider = NEW.provider AND mode = NEW.mode)
    THEN RAISE(ABORT, 'Payment success requires verified provider evidence') END;
END;
CREATE TRIGGER refunds_success_fixed BEFORE UPDATE ON refunds WHEN OLD.state = 'succeeded'
BEGIN SELECT RAISE(ABORT, 'Confirmed financial record is immutable'); END;
CREATE TRIGGER refund_validate_insert BEFORE INSERT ON refunds
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_attempts p
    JOIN cancellation_requests c ON c.id = NEW.cancellation_request_id AND c.order_id = p.order_id
    WHERE p.id = NEW.payment_attempt_id AND p.order_id = NEW.order_id AND p.state = 'succeeded'
      AND p.amount_cents = NEW.requested_cents AND c.state = 'approved')
    THEN RAISE(ABORT, 'Full demo refund requires matching paid order and approved cancellation') END;
  SELECT CASE WHEN NEW.state = 'succeeded' AND NOT EXISTS (
    SELECT 1 FROM provider_events WHERE id = NEW.evidence_event_id AND verified_at IS NOT NULL
      AND provider = NEW.provider AND mode = NEW.mode)
    THEN RAISE(ABORT, 'Refund success requires verified provider evidence') END;
END;
CREATE TRIGGER refund_validate_update BEFORE UPDATE ON refunds
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_attempts p
    JOIN cancellation_requests c ON c.id = NEW.cancellation_request_id AND c.order_id = p.order_id
    WHERE p.id = NEW.payment_attempt_id AND p.order_id = NEW.order_id AND p.state = 'succeeded'
      AND p.amount_cents = NEW.requested_cents AND c.state = 'approved')
    THEN RAISE(ABORT, 'Full demo refund requires matching paid order and approved cancellation') END;
  SELECT CASE WHEN NEW.state = 'succeeded' AND NOT EXISTS (
    SELECT 1 FROM provider_events WHERE id = NEW.evidence_event_id AND verified_at IS NOT NULL
      AND provider = NEW.provider AND mode = NEW.mode)
    THEN RAISE(ABORT, 'Refund success requires verified provider evidence') END;
END;
