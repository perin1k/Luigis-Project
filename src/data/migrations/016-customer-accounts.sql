-- Customers have no staff role and no access to staff credentials/sessions.
CREATE TABLE customer_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 username TEXT NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 64 AND username=lower(username) AND username NOT GLOB '*[^a-z0-9_.-]*'),
 password_hash TEXT NOT NULL CHECK(length(password_hash)=182),
 customer_name TEXT NOT NULL DEFAULT '' CHECK(length(customer_name)<=100),
 phone TEXT NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 email TEXT NOT NULL DEFAULT '' CHECK(length(email)<=254),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at) IS created_at)
) STRICT;
CREATE TABLE customer_sessions (
 token_digest TEXT PRIMARY KEY NOT NULL CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^a-f0-9]*'),
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 authenticated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',authenticated_at) IS authenticated_at),
 last_activity_at TEXT NOT NULL CHECK(last_activity_at>=authenticated_at),
 expires_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',expires_at,'-8 hours') IS authenticated_at)
) STRICT;
CREATE INDEX customer_sessions_by_account ON customer_sessions(customer_id);
CREATE TABLE customer_recovery_codes (
 code_digest TEXT PRIMARY KEY NOT NULL CHECK(length(code_digest)=64 AND code_digest NOT GLOB '*[^a-f0-9]*'),
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE
) STRICT;
CREATE TABLE customer_order_links (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX customer_orders_by_account ON customer_order_links(customer_id,order_id);
CREATE TRIGGER customer_order_owner_immutable BEFORE UPDATE ON customer_order_links
BEGIN SELECT RAISE(ABORT,'Customer order ownership cannot be reassigned'); END;
