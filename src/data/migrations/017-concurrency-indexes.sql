-- Selective lookups observed in scheduling, order review and refund query plans.
-- Indexes only: preserve every application record and the existing business rules.
CREATE INDEX holds_by_booking_state ON capacity_holds(booking_id, state, created_at DESC);
CREATE INDEX reviews_by_order_state ON fulfillment_reviews(order_id, state, trigger_type);
CREATE INDEX demo_allocations_by_payment ON demo_financial_allocations(payment_id, refund_id, component);
