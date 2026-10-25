-- Credential storage only. No user, password, bootstrap or recovery value is seeded.
CREATE TABLE staff_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES staff_users(id),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (
    length(username) BETWEEN 3 AND 64 AND username NOT GLOB '*[^a-z0-9._-]*'),
  password_hash TEXT NOT NULL CHECK (
    length(password_hash) = 182 AND substr(password_hash, 1, 21) = 'scrypt-v1$131072$8$1$'
    AND substr(password_hash, 22, 32) NOT GLOB '*[^0-9a-f]*'
    AND substr(password_hash, 54, 1) = '$'
    AND substr(password_hash, 55, 128) NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  password_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', password_changed_at) IS password_changed_at),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  CHECK (password_changed_at >= created_at)
) STRICT;
CREATE TRIGGER credentials_identity_fixed BEFORE UPDATE ON staff_credentials
WHEN NEW.user_id IS NOT OLD.user_id OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Credential owner and creation time cannot change'); END;
CREATE TRIGGER credentials_revision BEFORE UPDATE ON staff_credentials
WHEN NEW.revision != OLD.revision + 1 OR NEW.password_changed_at < OLD.password_changed_at
BEGIN SELECT RAISE(ABORT, 'Credential changes require a new revision and nondecreasing timestamp'); END;
CREATE TRIGGER credentials_revoke_sessions AFTER UPDATE ON staff_credentials
WHEN NEW.password_hash IS NOT OLD.password_hash OR NEW.username IS NOT OLD.username
BEGIN
  UPDATE staff_sessions SET revoked_at = NEW.password_changed_at
    WHERE user_id = NEW.user_id AND revoked_at IS NULL;
END;
CREATE TRIGGER credentials_no_replace BEFORE DELETE ON staff_credentials
BEGIN SELECT RAISE(ABORT, 'Disable staff or explicitly revise credentials; do not replace credential rows'); END;
