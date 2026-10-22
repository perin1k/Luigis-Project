CREATE TABLE recovery_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  code_digest TEXT NOT NULL UNIQUE CHECK(length(code_digest)=64 AND code_digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','used','revoked')),
  closed_at TEXT,
  CHECK((state='active' AND closed_at IS NULL) OR (state!='active' AND closed_at IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ',closed_at) IS closed_at AND closed_at>=created_at))
) STRICT;
CREATE INDEX recovery_codes_owner ON recovery_codes(user_id,state);
CREATE TRIGGER recovery_code_initial BEFORE INSERT ON recovery_codes WHEN NEW.state!='active'
BEGIN SELECT RAISE(ABORT,'Recovery codes start active'); END;
CREATE TRIGGER recovery_code_history BEFORE UPDATE ON recovery_codes
WHEN OLD.state!='active' OR NEW.state='active' OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id
  OR NEW.code_digest IS NOT OLD.code_digest OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'Preserve recovery code history'); END;
CREATE TRIGGER recovery_code_keep BEFORE DELETE ON recovery_codes
BEGIN SELECT RAISE(ABORT,'Preserve recovery code history'); END;
CREATE TABLE recovery_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  method TEXT NOT NULL CHECK(method IN ('password_and_code','brody_in_person')),
  created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at) IS created_at),
  expires_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+10 minutes') IS expires_at),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','cancelled','expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  closed_at TEXT,
  CHECK((state='pending' AND closed_at IS NULL) OR (state!='pending' AND closed_at IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ',closed_at) IS closed_at AND closed_at>=created_at)),
  CHECK(state!='completed' OR closed_at<expires_at),
  UNIQUE(id,user_id)
) STRICT;
CREATE TRIGGER recovery_request_initial BEFORE INSERT ON recovery_requests WHEN NEW.state!='pending' OR NEW.attempts!=0
BEGIN SELECT RAISE(ABORT,'Recovery requests start pending'); END;
CREATE TRIGGER recovery_request_history BEFORE UPDATE ON recovery_requests
WHEN OLD.state!='pending' OR NEW.attempts<OLD.attempts OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id
  OR NEW.token_digest IS NOT OLD.token_digest OR NEW.method IS NOT OLD.method
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT,'Preserve recovery request history'); END;
CREATE TRIGGER recovery_request_keep BEFORE DELETE ON recovery_requests
BEGIN SELECT RAISE(ABORT,'Preserve recovery request history'); END;
CREATE TABLE recovery_locks (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES staff_users(id),
  request_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY(request_id,user_id) REFERENCES recovery_requests(id,user_id)
) STRICT;
CREATE TRIGGER recovery_session_block BEFORE INSERT ON staff_sessions
WHEN NEW.revoked_at IS NULL AND EXISTS(SELECT 1 FROM recovery_locks WHERE user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'Recovery must complete before sign-in'); END;
