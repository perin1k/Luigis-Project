-- Encrypted local TOTP material; no key, factor or real enrollment is provisioned.
CREATE UNIQUE INDEX mfa_reference_owner ON mfa_references(id, user_id);
CREATE TABLE mfa_secrets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  mfa_reference_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'revoked', 'expired')),
  key_id TEXT NOT NULL CHECK (length(key_id) BETWEEN 1 AND 32 AND key_id NOT GLOB '*[^a-z0-9_-]*'),
  ciphertext BLOB,
  iv BLOB,
  auth_tag BLOB,
  created_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  enrollment_expires_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', enrollment_expires_at) IS enrollment_expires_at),
  confirmed_at TEXT CHECK (confirmed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', confirmed_at) IS confirmed_at),
  last_verified_at TEXT CHECK (last_verified_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', last_verified_at) IS last_verified_at),
  last_counter INTEGER CHECK (last_counter BETWEEN 0 AND 9007199254740991),
  revoked_at TEXT CHECK (revoked_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at) IS revoked_at),
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+10 minutes') IS enrollment_expires_at),
  CHECK ((state IN ('pending', 'active') AND ciphertext IS NOT NULL AND length(ciphertext) = 20
    AND iv IS NOT NULL AND length(iv) = 12 AND auth_tag IS NOT NULL AND length(auth_tag) = 16)
    OR (state IN ('revoked', 'expired') AND ciphertext IS NULL AND iv IS NULL AND auth_tag IS NULL)),
  CHECK ((state IN ('pending', 'expired') AND mfa_reference_id IS NULL AND confirmed_at IS NULL
    AND last_counter IS NULL AND last_verified_at IS NULL AND revoked_at IS NULL)
    OR (state IN ('active', 'revoked') AND mfa_reference_id IS NOT NULL AND confirmed_at IS NOT NULL
      AND confirmed_at >= created_at AND confirmed_at < enrollment_expires_at
      AND last_counter IS NOT NULL AND last_verified_at IS NOT NULL AND last_verified_at >= confirmed_at
      AND ((state = 'active' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL AND revoked_at >= last_verified_at)))),
  FOREIGN KEY (mfa_reference_id, user_id) REFERENCES mfa_references(id, user_id)
) STRICT;
CREATE UNIQUE INDEX one_live_totp_per_user ON mfa_secrets(user_id) WHERE state IN ('pending', 'active');
CREATE TRIGGER mfa_secret_insert_pending BEFORE INSERT ON mfa_secrets WHEN NEW.state != 'pending'
BEGIN SELECT RAISE(ABORT, 'Create pending encrypted factor before confirmation'); END;
CREATE TRIGGER mfa_secret_identity_fixed BEFORE UPDATE ON mfa_secrets
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.key_id IS NOT OLD.key_id
  OR NEW.created_at IS NOT OLD.created_at OR NEW.enrollment_expires_at IS NOT OLD.enrollment_expires_at
  OR (OLD.mfa_reference_id IS NOT NULL AND NEW.mfa_reference_id IS NOT OLD.mfa_reference_id)
  OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS NOT OLD.confirmed_at)
BEGIN SELECT RAISE(ABORT, 'Encrypted factor identity cannot change'); END;
CREATE TRIGGER mfa_secret_payload_fixed BEFORE UPDATE ON mfa_secrets
WHEN NEW.state IN ('pending', 'active') AND
  (NEW.ciphertext IS NOT OLD.ciphertext OR NEW.iv IS NOT OLD.iv OR NEW.auth_tag IS NOT OLD.auth_tag)
BEGIN SELECT RAISE(ABORT, 'Encrypted factor payload cannot be replaced'); END;
CREATE TRIGGER mfa_secret_progress BEFORE UPDATE ON mfa_secrets
WHEN NOT ((OLD.state = 'pending' AND NEW.state IN ('active', 'expired'))
  OR (OLD.state = 'active' AND NEW.state IN ('active', 'revoked')))
  OR (OLD.last_counter IS NOT NULL AND (NEW.last_counter IS NULL OR NEW.last_counter < OLD.last_counter))
  OR (OLD.last_verified_at IS NOT NULL AND (NEW.last_verified_at IS NULL OR NEW.last_verified_at < OLD.last_verified_at))
BEGIN SELECT RAISE(ABORT, 'Factor history and consumed counters cannot move backwards'); END;
CREATE TRIGGER mfa_secret_keep_history BEFORE DELETE ON mfa_secrets
BEGIN SELECT RAISE(ABORT, 'Revoke or expire factors rather than replacing their history'); END;
CREATE TRIGGER mfa_reference_secret_revoke AFTER UPDATE OF state ON mfa_references WHEN NEW.state = 'revoked'
BEGIN
  UPDATE mfa_secrets SET state = 'revoked', revoked_at = NEW.revoked_at, ciphertext = NULL, iv = NULL, auth_tag = NULL
    WHERE mfa_reference_id = NEW.id AND state = 'active';
END;
