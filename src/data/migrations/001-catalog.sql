-- Server-only demo catalog. Applied atomically by migrations.js.
CREATE TABLE catalog_versions (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL UNIQUE CHECK (revision BETWEEN 1 AND 9007199254740991),
  published_at TEXT,
  published_by TEXT
) STRICT;
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
) STRICT;
CREATE TABLE pizza_sizes (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  diameter_inches INTEGER NOT NULL CHECK (diameter_inches > 0),
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents BETWEEN 0 AND 9007199254740991),
  topping_price_cents INTEGER NOT NULL CHECK (topping_price_cents BETWEEN 0 AND 9007199254740991),
  marinara_quarter_cups INTEGER NOT NULL CHECK (marinara_quarter_cups > 0),
  UNIQUE (catalog_version_id, code),
  UNIQUE (id, catalog_version_id)
) STRICT;
CREATE TABLE crust_options (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (catalog_version_id, code),
  UNIQUE (id, catalog_version_id)
) STRICT;
CREATE TABLE toppings (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (catalog_version_id, code),
  UNIQUE (id, catalog_version_id)
) STRICT;
CREATE TABLE beverages (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (catalog_version_id, code),
  UNIQUE (id, catalog_version_id)
) STRICT;
CREATE TABLE drink_sizes (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 9007199254740991),
  UNIQUE (catalog_version_id, code),
  UNIQUE (id, catalog_version_id)
) STRICT;
CREATE TABLE catalog_ingredient_requirements (
  id TEXT PRIMARY KEY NOT NULL,
  catalog_version_id TEXT NOT NULL REFERENCES catalog_versions(id),
  pizza_size_id TEXT,
  crust_option_id TEXT,
  topping_id TEXT,
  beverage_id TEXT,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  CHECK ((pizza_size_id IS NOT NULL) + (crust_option_id IS NOT NULL) +
    (topping_id IS NOT NULL) + (beverage_id IS NOT NULL) = 1),
  FOREIGN KEY (pizza_size_id, catalog_version_id) REFERENCES pizza_sizes(id, catalog_version_id),
  FOREIGN KEY (crust_option_id, catalog_version_id) REFERENCES crust_options(id, catalog_version_id),
  FOREIGN KEY (topping_id, catalog_version_id) REFERENCES toppings(id, catalog_version_id),
  FOREIGN KEY (beverage_id, catalog_version_id) REFERENCES beverages(id, catalog_version_id)
) STRICT;
CREATE UNIQUE INDEX requirements_pizza ON catalog_ingredient_requirements (pizza_size_id, ingredient_id) WHERE pizza_size_id IS NOT NULL;
CREATE UNIQUE INDEX requirements_crust ON catalog_ingredient_requirements (crust_option_id, ingredient_id) WHERE crust_option_id IS NOT NULL;
CREATE UNIQUE INDEX requirements_topping ON catalog_ingredient_requirements (topping_id, ingredient_id) WHERE topping_id IS NOT NULL;
CREATE UNIQUE INDEX requirements_beverage ON catalog_ingredient_requirements (beverage_id, ingredient_id) WHERE beverage_id IS NOT NULL;
