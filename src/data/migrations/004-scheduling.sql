-- Scheduling storage only. No slot generation, capacity calculation or expiry worker.
CREATE TABLE service_days (
  id TEXT PRIMARY KEY NOT NULL,
  service_date TEXT NOT NULL UNIQUE CHECK (date(service_date, '+0 days') IS service_date),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago' CHECK (timezone = 'America/Chicago'),
  opens_at TEXT, closes_at TEXT, cutoff_at TEXT, latest_pickup_at TEXT,
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  changed_by TEXT,
  CHECK ((opens_at IS NULL AND closes_at IS NULL AND cutoff_at IS NULL AND latest_pickup_at IS NULL AND is_closed = 1)
    OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND cutoff_at IS NOT NULL AND latest_pickup_at IS NOT NULL
      AND opens_at < closes_at AND cutoff_at < latest_pickup_at AND latest_pickup_at < closes_at
      AND strftime('%Y-%m-%dT%H:%M:%fZ', closes_at, '-30 minutes') IS cutoff_at
      AND strftime('%Y-%m-%dT%H:%M:%fZ', closes_at, '-10 minutes') IS latest_pickup_at)),
  CHECK (opens_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', opens_at) IS opens_at),
  CHECK (closes_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', closes_at) IS closes_at),
  CHECK (cutoff_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cutoff_at) IS cutoff_at),
  CHECK (latest_pickup_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', latest_pickup_at) IS latest_pickup_at)
) STRICT;
CREATE TABLE fulfillment_bookings (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  service_day_id TEXT NOT NULL REFERENCES service_days(id),
  selection_type TEXT NOT NULL CHECK (selection_type IN ('ASAP', 'scheduled')),
  promised_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', promised_at) IS promised_at),
  minimum_lead_minutes INTEGER NOT NULL CHECK (minimum_lead_minutes BETWEEN 20 AND 9007199254740991),
  capacity_policy_reference TEXT NOT NULL CHECK (capacity_policy_reference = 'demo-six-per-20m-v1'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  UNIQUE (id, service_day_id)
) STRICT;
CREATE TABLE capacity_windows (
  id TEXT PRIMARY KEY NOT NULL,
  service_day_id TEXT NOT NULL REFERENCES service_days(id),
  starts_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', starts_at) IS starts_at),
  ends_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', ends_at) IS ends_at),
  capacity_units INTEGER NOT NULL CHECK (capacity_units = 6),
  policy_reference TEXT NOT NULL CHECK (policy_reference = 'demo-six-per-20m-v1'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+20 minutes') IS ends_at),
  UNIQUE (id, service_day_id),
  UNIQUE (service_day_id, starts_at, ends_at)
) STRICT;
CREATE TABLE capacity_holds (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL,
  capacity_window_id TEXT NOT NULL,
  service_day_id TEXT NOT NULL,
  reserved_units INTEGER NOT NULL CHECK (reserved_units BETWEEN 1 AND 6),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'confirmed', 'released', 'expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  expires_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) IS expires_at),
  confirmed_at TEXT CHECK (confirmed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) IS confirmed_at),
  released_at TEXT CHECK (released_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', released_at) IS released_at),
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+30 minutes') IS expires_at),
  CHECK (confirmed_at IS NULL OR (confirmed_at >= created_at AND confirmed_at < expires_at)),
  CHECK (released_at IS NULL OR released_at >= coalesce(confirmed_at, created_at)),
  CHECK ((state = 'active' AND confirmed_at IS NULL AND released_at IS NULL)
    OR (state = 'confirmed' AND confirmed_at IS NOT NULL AND released_at IS NULL)
    OR (state = 'released' AND released_at IS NOT NULL)
    OR (state = 'expired' AND confirmed_at IS NULL AND released_at IS NOT NULL AND released_at >= expires_at)),
  FOREIGN KEY (booking_id, service_day_id) REFERENCES fulfillment_bookings(id, service_day_id),
  FOREIGN KEY (capacity_window_id, service_day_id) REFERENCES capacity_windows(id, service_day_id)
) STRICT;
CREATE UNIQUE INDEX one_consuming_hold_per_booking ON capacity_holds(booking_id) WHERE state IN ('active', 'confirmed');
CREATE INDEX holds_by_window_state ON capacity_holds(capacity_window_id, state);
CREATE INDEX holds_by_expiry ON capacity_holds(state, expires_at);
CREATE INDEX bookings_by_promise ON fulfillment_bookings(service_day_id, promised_at);
CREATE TABLE order_events (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  from_status TEXT CHECK (from_status IN ('Received', 'Preparing', 'Baking', 'Ready', 'Completed', 'Cancelled', 'Not collected')),
  to_status TEXT CHECK (to_status IN ('Received', 'Preparing', 'Baking', 'Ready', 'Completed', 'Cancelled', 'Not collected')),
  occurred_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at) IS occurred_at),
  actor_id TEXT, reason_code TEXT,
  UNIQUE (order_id, sequence)
) STRICT;
CREATE TABLE fulfillment_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('hours_change', 'inventory_change', 'late_payment')),
  trigger_reference TEXT NOT NULL CHECK (length(trim(trigger_reference)) > 0),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', opened_at) IS opened_at),
  resolved_at TEXT CHECK (resolved_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', resolved_at) IS resolved_at),
  resolved_by TEXT, resolution TEXT,
  CHECK ((state = 'open' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL)
    OR (state = 'resolved' AND resolved_at IS NOT NULL AND resolved_at >= opened_at
      AND length(trim(coalesce(resolved_by, ''))) > 0 AND length(trim(coalesce(resolution, ''))) > 0)),
  UNIQUE (order_id, trigger_type, trigger_reference)
) STRICT;
CREATE INDEX reviews_by_state ON fulfillment_reviews(state, opened_at);

CREATE TRIGGER holds_insert_active BEFORE INSERT ON capacity_holds WHEN NEW.state != 'active'
BEGIN SELECT RAISE(ABORT, 'Create an active hold before recording its outcome'); END;
CREATE TRIGGER holds_window_insert BEFORE INSERT ON capacity_holds
WHEN NOT EXISTS (SELECT 1 FROM fulfillment_bookings b JOIN capacity_windows w ON w.id = NEW.capacity_window_id
  WHERE b.id = NEW.booking_id AND b.service_day_id = NEW.service_day_id AND w.service_day_id = NEW.service_day_id
    AND b.promised_at >= w.starts_at AND b.promised_at < w.ends_at)
BEGIN SELECT RAISE(ABORT, 'Hold must match booking day and half-open window'); END;
CREATE TRIGGER holds_transition BEFORE UPDATE ON capacity_holds
WHEN NOT ((OLD.state = 'active' AND NEW.state IN ('active', 'confirmed', 'released', 'expired'))
  OR (OLD.state = 'confirmed' AND NEW.state IN ('confirmed', 'released')))
BEGIN SELECT RAISE(ABORT, 'Released or expired holds cannot reopen'); END;
CREATE TRIGGER holds_confirmation_fixed BEFORE UPDATE ON capacity_holds
WHEN OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS NOT OLD.confirmed_at
BEGIN SELECT RAISE(ABORT, 'Preserve hold confirmation timestamp'); END;
CREATE TRIGGER booking_promise_fixed BEFORE UPDATE ON fulfillment_bookings
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.service_day_id IS NOT OLD.service_day_id
  OR NEW.selection_type IS NOT OLD.selection_type OR NEW.promised_at IS NOT OLD.promised_at
  OR NEW.minimum_lead_minutes IS NOT OLD.minimum_lead_minutes OR NEW.capacity_policy_reference IS NOT OLD.capacity_policy_reference
BEGIN SELECT RAISE(ABORT, 'Preserve original fulfillment promise'); END;
CREATE TRIGGER window_history_fixed BEFORE UPDATE ON capacity_windows
WHEN NEW.id IS NOT OLD.id OR NEW.service_day_id IS NOT OLD.service_day_id OR NEW.starts_at IS NOT OLD.starts_at
  OR NEW.ends_at IS NOT OLD.ends_at OR NEW.capacity_units IS NOT OLD.capacity_units OR NEW.policy_reference IS NOT OLD.policy_reference
BEGIN SELECT RAISE(ABORT, 'Preserve capacity window history'); END;
CREATE TRIGGER service_day_identity_fixed BEFORE UPDATE ON service_days
WHEN NEW.id IS NOT OLD.id OR NEW.service_date IS NOT OLD.service_date OR NEW.timezone IS NOT OLD.timezone
BEGIN SELECT RAISE(ABORT, 'Service day identity cannot change'); END;
CREATE TRIGGER holds_identity_fixed BEFORE UPDATE ON capacity_holds
WHEN NEW.id IS NOT OLD.id OR NEW.booking_id IS NOT OLD.booking_id OR NEW.capacity_window_id IS NOT OLD.capacity_window_id
  OR NEW.service_day_id IS NOT OLD.service_day_id OR NEW.reserved_units IS NOT OLD.reserved_units
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'Hold reservation identity cannot change'); END;
CREATE TRIGGER events_append_only BEFORE UPDATE ON order_events
BEGIN SELECT RAISE(ABORT, 'Order events are append-only'); END;
CREATE TRIGGER reviews_insert_open BEFORE INSERT ON fulfillment_reviews WHEN NEW.state != 'open'
BEGIN SELECT RAISE(ABORT, 'Create open review before resolving'); END;
CREATE TRIGGER reviews_resolved_fixed BEFORE UPDATE ON fulfillment_reviews WHEN OLD.state = 'resolved'
BEGIN SELECT RAISE(ABORT, 'Resolved review is immutable'); END;
CREATE TRIGGER reviews_identity_fixed BEFORE UPDATE ON fulfillment_reviews
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.trigger_type IS NOT OLD.trigger_type
  OR NEW.trigger_reference IS NOT OLD.trigger_reference OR NEW.opened_at IS NOT OLD.opened_at
BEGIN SELECT RAISE(ABORT, 'Preserve review trigger and opening time'); END;
CREATE TRIGGER fulfillment_bookings_keep_history BEFORE DELETE ON fulfillment_bookings
BEGIN SELECT RAISE(ABORT, 'Preserve scheduling history'); END;
CREATE TRIGGER capacity_windows_keep_history BEFORE DELETE ON capacity_windows
BEGIN SELECT RAISE(ABORT, 'Preserve scheduling history'); END;
CREATE TRIGGER capacity_holds_keep_history BEFORE DELETE ON capacity_holds
BEGIN SELECT RAISE(ABORT, 'Preserve scheduling history'); END;
CREATE TRIGGER order_events_keep_history BEFORE DELETE ON order_events
BEGIN SELECT RAISE(ABORT, 'Preserve scheduling history'); END;
CREATE TRIGGER fulfillment_reviews_keep_history BEFORE DELETE ON fulfillment_reviews
BEGIN SELECT RAISE(ABORT, 'Preserve scheduling history'); END;
