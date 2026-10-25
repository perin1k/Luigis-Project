CREATE TABLE staff_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL CHECK(length(username) BETWEEN 3 AND 64 AND username NOT GLOB '*[^a-z0-9._-]*'),
  token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  issued_by TEXT NOT NULL REFERENCES staff_users(id),
  issuer_epoch INTEGER NOT NULL CHECK(issuer_epoch > 0),
  created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  expires_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+24 hours') IS expires_at),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'accepted', 'revoked', 'expired')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
  closed_at TEXT CHECK(closed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', closed_at) IS closed_at),
  revoked_by TEXT REFERENCES staff_users(id),
  accepted_user_id TEXT UNIQUE REFERENCES staff_users(id),
  CHECK((state = 'pending' AND closed_at IS NULL AND revoked_by IS NULL AND accepted_user_id IS NULL)
    OR (state = 'accepted' AND closed_at IS NOT NULL AND closed_at >= created_at AND closed_at < expires_at AND revoked_by IS NULL AND accepted_user_id IS NOT NULL)
    OR (state = 'revoked' AND closed_at IS NOT NULL AND closed_at >= created_at AND revoked_by IS NOT NULL AND accepted_user_id IS NULL)
    OR (state = 'expired' AND closed_at IS NOT NULL AND closed_at >= expires_at AND revoked_by IS NULL AND accepted_user_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX one_pending_staff_invitation ON staff_invitations(username) WHERE state = 'pending';
CREATE TRIGGER invitation_insert_pending BEFORE INSERT ON staff_invitations
WHEN NEW.state != 'pending' OR NEW.attempt_count != 0 OR NOT EXISTS (
  SELECT 1 FROM staff_users u JOIN login_identity_versions v ON v.user_id = u.id
  WHERE u.id = NEW.issued_by AND u.role = 'admin' AND u.state = 'active' AND v.epoch = NEW.issuer_epoch)
BEGIN SELECT RAISE(ABORT, 'Invitations require a current admin and start pending'); END;
CREATE TRIGGER invitation_identity_fixed BEFORE UPDATE ON staff_invitations
WHEN NEW.id IS NOT OLD.id OR NEW.username IS NOT OLD.username OR NEW.token_digest IS NOT OLD.token_digest
  OR NEW.issued_by IS NOT OLD.issued_by OR NEW.issuer_epoch IS NOT OLD.issuer_epoch
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
  OR OLD.state != 'pending' OR NEW.attempt_count < OLD.attempt_count
BEGIN SELECT RAISE(ABORT, 'Preserve invitation identity and terminal history'); END;
CREATE TRIGGER invitation_accept_employee BEFORE UPDATE ON staff_invitations
WHEN NEW.state = 'accepted' AND NOT EXISTS (
  SELECT 1 FROM staff_users u JOIN staff_credentials c ON c.user_id = u.id
  WHERE u.id = NEW.accepted_user_id AND u.role = 'employee' AND u.state = 'active' AND c.username = OLD.username)
BEGIN SELECT RAISE(ABORT, 'Invitation may enroll only its named employee'); END;
CREATE TRIGGER invitation_keep_history BEFORE DELETE ON staff_invitations
BEGIN SELECT RAISE(ABORT, 'Preserve invitation history'); END;
