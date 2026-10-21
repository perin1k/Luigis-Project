-- Transient authentication controls; no credentials or raw source addresses.
CREATE TABLE login_limits (
  bucket_digest TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_digest) = 64),
  window_start_ms INTEGER NOT NULL CHECK(window_start_ms >= 0),
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 30)
) STRICT;
-- Invalidate even a disable/re-enable or role change that restores old values.
CREATE TABLE login_identity_versions (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES staff_users(id),
  epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch BETWEEN 1 AND 9007199254740991)
) STRICT;
INSERT INTO login_identity_versions (user_id) SELECT id FROM staff_users;
CREATE TRIGGER login_identity_created AFTER INSERT ON staff_users
BEGIN INSERT INTO login_identity_versions (user_id) VALUES (NEW.id); END;
CREATE TRIGGER login_identity_changed AFTER UPDATE ON staff_users
BEGIN
  UPDATE login_identity_versions SET epoch = epoch + 1 WHERE user_id = NEW.id;
  DELETE FROM login_challenges WHERE user_id = NEW.id;
END;
CREATE TRIGGER login_credential_changed AFTER UPDATE ON staff_credentials
BEGIN
  UPDATE login_identity_versions SET epoch = epoch + 1 WHERE user_id = NEW.user_id;
  DELETE FROM login_challenges WHERE user_id = NEW.user_id;
END;
CREATE TABLE login_challenges (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK(length(token_digest) = 64),
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  credential_revision INTEGER NOT NULL CHECK(credential_revision > 0),
  user_revision INTEGER NOT NULL CHECK(user_revision > 0),
  factor_id TEXT NOT NULL REFERENCES mfa_references(id),
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  created_ms INTEGER NOT NULL CHECK(created_ms >= 0),
  expires_ms INTEGER NOT NULL CHECK(expires_ms = created_ms + 300000),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0, 1))
) STRICT;
