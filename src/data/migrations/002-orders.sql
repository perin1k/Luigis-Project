-- Order persistence only: no payment, pricing or fulfillment endpoint is enabled.
CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  public_reference TEXT NOT NULL UNIQUE,
  service_type TEXT NOT NULL CHECK (service_type IN ('carry-out', 'dine-in')),
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  accepted_quote_id TEXT,
  fulfillment_status TEXT CHECK (fulfillment_status IN ('Received', 'Preparing', 'Baking', 'Ready', 'Completed', 'Cancelled', 'Not collected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  received_at TEXT, preparing_at TEXT, baking_at TEXT, ready_at TEXT,
  completed_at TEXT, cancelled_at TEXT, not_collected_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  UNIQUE (id, catalog_version_id),
  FOREIGN KEY (accepted_quote_id, id, catalog_version_id)
    REFERENCES order_quotes(id, order_id, catalog_version_id)
) STRICT;
CREATE TABLE order_contacts (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
  customer_name TEXT, phone TEXT, email TEXT, redacted_at TEXT,
  CHECK (redacted_at IS NULL OR (customer_name IS NULL AND phone IS NULL AND email IS NULL))
) STRICT;
CREATE TABLE order_lines (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  catalog_version_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number BETWEEN 1 AND 9007199254740991),
  item_type TEXT NOT NULL CHECK (item_type IN ('pizza', 'drink')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10 AND (item_type != 'pizza' OR quantity <= 6)),
  display_name_snapshot TEXT NOT NULL CHECK (length(trim(display_name_snapshot)) > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents BETWEEN 0 AND 9007199254740991),
  line_subtotal_cents INTEGER NOT NULL CHECK (line_subtotal_cents BETWEEN 0 AND 9007199254740991),
  CHECK (line_subtotal_cents = unit_price_cents * quantity),
  UNIQUE (order_id, line_number),
  UNIQUE (id, catalog_version_id),
  FOREIGN KEY (order_id, catalog_version_id) REFERENCES orders(id, catalog_version_id)
) STRICT;
CREATE TABLE pizza_line_details (
  order_line_id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL,
  pizza_size_id TEXT NOT NULL,
  crust_option_id TEXT NOT NULL,
  size_name_snapshot TEXT NOT NULL,
  crust_name_snapshot TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents BETWEEN 0 AND 9007199254740991),
  topping_price_cents INTEGER NOT NULL CHECK (topping_price_cents BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (order_line_id, catalog_version_id) REFERENCES order_lines(id, catalog_version_id),
  FOREIGN KEY (pizza_size_id, catalog_version_id) REFERENCES pizza_sizes(id, catalog_version_id),
  FOREIGN KEY (crust_option_id, catalog_version_id) REFERENCES crust_options(id, catalog_version_id)
) STRICT;
CREATE TABLE pizza_line_toppings (
  order_line_id TEXT NOT NULL,
  catalog_version_id TEXT NOT NULL,
  topping_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (order_line_id, topping_id),
  FOREIGN KEY (order_line_id, catalog_version_id) REFERENCES order_lines(id, catalog_version_id),
  FOREIGN KEY (topping_id, catalog_version_id) REFERENCES toppings(id, catalog_version_id)
) STRICT;
CREATE TABLE drink_line_details (
  order_line_id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL,
  beverage_id TEXT NOT NULL,
  drink_size_id TEXT NOT NULL,
  beverage_name_snapshot TEXT NOT NULL,
  size_name_snapshot TEXT NOT NULL,
  FOREIGN KEY (order_line_id, catalog_version_id) REFERENCES order_lines(id, catalog_version_id),
  FOREIGN KEY (beverage_id, catalog_version_id) REFERENCES beverages(id, catalog_version_id),
  FOREIGN KEY (drink_size_id, catalog_version_id) REFERENCES drink_sizes(id, catalog_version_id)
) STRICT;
CREATE TABLE order_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  catalog_version_id TEXT NOT NULL,
  item_subtotal_cents INTEGER NOT NULL CHECK (item_subtotal_cents BETWEEN 0 AND 9007199254740991),
  tax_cents INTEGER NOT NULL CHECK (tax_cents BETWEEN 0 AND 9007199254740991),
  tip_cents INTEGER NOT NULL CHECK (tip_cents BETWEEN 0 AND 9007199254740991),
  total_cents INTEGER NOT NULL CHECK (total_cents BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  tax_policy_reference TEXT NOT NULL CHECK (length(trim(tax_policy_reference)) > 0),
  rounding_policy_reference TEXT NOT NULL CHECK (length(trim(rounding_policy_reference)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  CHECK (total_cents = item_subtotal_cents + tax_cents + tip_cents),
  UNIQUE (id, order_id, catalog_version_id),
  FOREIGN KEY (order_id, catalog_version_id) REFERENCES orders(id, catalog_version_id)
) STRICT;
CREATE UNIQUE INDEX one_accepted_quote_per_order ON order_quotes(order_id) WHERE accepted_at IS NOT NULL;
CREATE INDEX order_lines_by_order ON order_lines(order_id);
CREATE INDEX order_quotes_by_order ON order_quotes(order_id);
CREATE INDEX orders_by_status ON orders(fulfillment_status, created_at);

-- Insert a draft quote first, then accept it only after the nested draft is complete.
CREATE TRIGGER quotes_insert_draft BEFORE INSERT ON order_quotes
WHEN NEW.accepted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Insert a draft quote before acceptance'); END;
CREATE TRIGGER quote_identity_fixed BEFORE UPDATE OF id, order_id, catalog_version_id ON order_quotes
WHEN NEW.id != OLD.id OR NEW.order_id != OLD.order_id OR NEW.catalog_version_id != OLD.catalog_version_id
BEGIN SELECT RAISE(ABORT, 'Quote identity cannot change'); END;
CREATE TRIGGER quote_accepted_update BEFORE UPDATE ON order_quotes WHEN OLD.accepted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Accepted quote is immutable'); END;
CREATE TRIGGER quote_accepted_delete BEFORE DELETE ON order_quotes WHEN OLD.accepted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Accepted quote is immutable'); END;
CREATE TRIGGER order_insert_draft BEFORE INSERT ON orders WHEN NEW.accepted_quote_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Insert a draft order before quote acceptance'); END;
CREATE TRIGGER order_accept_reference BEFORE UPDATE OF accepted_quote_id ON orders
WHEN NEW.accepted_quote_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM order_quotes WHERE id = NEW.accepted_quote_id AND order_id = NEW.id
    AND catalog_version_id = NEW.catalog_version_id AND accepted_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'Order must reference its own accepted quote'); END;
CREATE TRIGGER order_snapshot_update BEFORE UPDATE ON orders
WHEN OLD.accepted_quote_id IS NOT NULL AND (
  NEW.id != OLD.id OR NEW.public_reference != OLD.public_reference OR NEW.service_type != OLD.service_type
  OR NEW.catalog_version_id != OLD.catalog_version_id OR NEW.accepted_quote_id IS NOT OLD.accepted_quote_id
)
BEGIN SELECT RAISE(ABORT, 'Accepted order snapshot is immutable'); END;
CREATE TRIGGER order_snapshot_delete BEFORE DELETE ON orders WHEN OLD.accepted_quote_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Accepted order snapshot is immutable'); END;
CREATE TRIGGER quote_accept_validate BEFORE UPDATE OF accepted_at ON order_quotes
WHEN NEW.accepted_at IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM order_contacts c JOIN orders o ON o.id = c.order_id
    WHERE o.id = NEW.order_id AND c.redacted_at IS NULL
      AND length(trim(coalesce(c.customer_name, ''))) > 0
      AND (length(trim(coalesce(c.phone, ''))) > 0 OR
        (o.service_type = 'dine-in' AND length(trim(coalesce(c.email, ''))) > 0))
  ) THEN RAISE(ABORT, 'Required order contact is missing') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM order_lines l WHERE l.order_id = NEW.order_id AND (
      (l.item_type = 'pizza' AND NOT EXISTS (SELECT 1 FROM pizza_line_details p WHERE p.order_line_id = l.id))
      OR (l.item_type = 'drink' AND NOT EXISTS (SELECT 1 FROM drink_line_details d WHERE d.order_line_id = l.id))
    )
  ) THEN RAISE(ABORT, 'Order line details are incomplete') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM order_lines l JOIN pizza_line_details p ON p.order_line_id = l.id
    WHERE l.order_id = NEW.order_id AND (
      l.unit_price_cents != p.base_price_cents + coalesce(
        (SELECT sum(t.unit_price_cents) FROM pizza_line_toppings t WHERE t.order_line_id = l.id), 0)
      OR EXISTS (SELECT 1 FROM pizza_line_toppings t WHERE t.order_line_id = l.id AND t.unit_price_cents != p.topping_price_cents)
    )
  ) THEN RAISE(ABORT, 'Pizza snapshot prices do not reconcile') END;
  SELECT CASE WHEN NEW.item_subtotal_cents != coalesce(
    (SELECT sum(line_subtotal_cents) FROM order_lines WHERE order_id = NEW.order_id), 0)
    THEN RAISE(ABORT, 'Quote subtotal does not match order lines') END;
END;
CREATE TRIGGER quote_accept_link AFTER UPDATE OF accepted_at ON order_quotes WHEN NEW.accepted_at IS NOT NULL
BEGIN UPDATE orders SET accepted_quote_id = NEW.id WHERE id = NEW.order_id; END;

-- Child rows remain editable only while the order has no accepted quote.
CREATE TRIGGER order_lines_snapshot_insert BEFORE INSERT ON order_lines
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = NEW.order_id AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER order_lines_snapshot_update BEFORE UPDATE ON order_lines
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = OLD.order_id AND accepted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM order_quotes WHERE order_id = NEW.order_id AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER order_lines_snapshot_delete BEFORE DELETE ON order_lines
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = OLD.order_id AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_details_snapshot_insert BEFORE INSERT ON pizza_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_details_snapshot_update BEFORE UPDATE ON pizza_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_details_snapshot_delete BEFORE DELETE ON pizza_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_details_type_insert BEFORE INSERT ON pizza_line_details
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'pizza'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER pizza_line_details_type_update BEFORE UPDATE ON pizza_line_details
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'pizza'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER pizza_line_toppings_snapshot_insert BEFORE INSERT ON pizza_line_toppings
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_toppings_snapshot_update BEFORE UPDATE ON pizza_line_toppings
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_toppings_snapshot_delete BEFORE DELETE ON pizza_line_toppings
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER pizza_line_toppings_type_insert BEFORE INSERT ON pizza_line_toppings
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'pizza'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER pizza_line_toppings_type_update BEFORE UPDATE ON pizza_line_toppings
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'pizza'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER drink_line_details_snapshot_insert BEFORE INSERT ON drink_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER drink_line_details_snapshot_update BEFORE UPDATE ON drink_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = NEW.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER drink_line_details_snapshot_delete BEFORE DELETE ON drink_line_details
WHEN EXISTS (SELECT 1 FROM order_quotes WHERE order_id = (SELECT order_id FROM order_lines WHERE id = OLD.order_line_id) AND accepted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Accepted order lines are immutable'); END;
CREATE TRIGGER drink_line_details_type_insert BEFORE INSERT ON drink_line_details
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'drink'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER drink_line_details_type_update BEFORE UPDATE ON drink_line_details
WHEN (SELECT item_type FROM order_lines WHERE id = NEW.order_line_id) != 'drink'
BEGIN SELECT RAISE(ABORT, 'Line detail type mismatch'); END;
CREATE TRIGGER line_identity_fixed BEFORE UPDATE OF id, catalog_version_id, item_type ON order_lines
WHEN NEW.id != OLD.id OR NEW.catalog_version_id != OLD.catalog_version_id OR NEW.item_type != OLD.item_type
BEGIN SELECT RAISE(ABORT, 'Line identity and type cannot change'); END;
CREATE TRIGGER line_quantity_insert BEFORE INSERT ON order_lines
WHEN NEW.quantity + coalesce((SELECT sum(quantity) FROM order_lines
  WHERE order_id = NEW.order_id AND item_type = NEW.item_type ), 0)
  > CASE NEW.item_type WHEN 'pizza' THEN 6 ELSE 10 END
BEGIN SELECT RAISE(ABORT, 'Aggregate quantity exceeds demo limit'); END;
CREATE TRIGGER line_quantity_update BEFORE UPDATE ON order_lines
WHEN NEW.quantity + coalesce((SELECT sum(quantity) FROM order_lines
  WHERE order_id = NEW.order_id AND item_type = NEW.item_type AND id != OLD.id), 0)
  > CASE NEW.item_type WHEN 'pizza' THEN 6 ELSE 10 END
BEGIN SELECT RAISE(ABORT, 'Aggregate quantity exceeds demo limit'); END;
