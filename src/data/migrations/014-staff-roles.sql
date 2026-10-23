-- Additive effective Owner role: preserve existing staff foreign keys and history.
CREATE TABLE staff_ownership (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  user_id TEXT NOT NULL UNIQUE REFERENCES staff_users(id),
  designated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',designated_at) IS designated_at)
) STRICT;
CREATE TRIGGER owner_validate BEFORE INSERT ON staff_ownership
WHEN NOT EXISTS(SELECT 1 FROM staff_users WHERE id=NEW.user_id AND role='admin' AND state='active' AND created_at<=NEW.designated_at)
BEGIN SELECT RAISE(ABORT,'Owner must be an active administrative identity'); END;
CREATE TRIGGER owner_immutable BEFORE UPDATE ON staff_ownership
BEGIN SELECT RAISE(ABORT,'Owner designation is immutable'); END;
CREATE TRIGGER owner_keep BEFORE DELETE ON staff_ownership
BEGIN SELECT RAISE(ABORT,'Preserve owner designation'); END;
CREATE TRIGGER owner_protected BEFORE UPDATE OF role,state ON staff_users
WHEN EXISTS(SELECT 1 FROM staff_ownership WHERE user_id=OLD.id) AND (NEW.role!='admin' OR NEW.state!='active')
BEGIN SELECT RAISE(ABORT,'Owner cannot be demoted or deactivated'); END;
CREATE VIEW staff_role_view AS SELECT u.id,CASE WHEN o.user_id IS NOT NULL THEN 'owner' ELSE u.role END AS effective_role
FROM staff_users u LEFT JOIN staff_ownership o ON o.user_id=u.id;

-- An owner-authorized promotion/invitation allows password-proven first MFA setup.
-- It never grants a session; ordinary admin/owner sessions still require MFA.
CREATE TABLE staff_mfa_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES staff_users(id),
  created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at) IS created_at)
) STRICT;
-- Preserve the legacy coordinator method while explicitly recording the proof purpose.
ALTER TABLE recovery_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT 'recovery' CHECK(purpose IN('recovery','first_mfa'));
CREATE TRIGGER recovery_purpose_fixed BEFORE UPDATE OF purpose ON recovery_requests
WHEN NEW.purpose IS NOT OLD.purpose
BEGIN SELECT RAISE(ABORT,'Preserve authentication proof purpose'); END;
CREATE TRIGGER first_mfa_authorized BEFORE INSERT ON recovery_requests
WHEN NEW.purpose='first_mfa' AND (NEW.method!='password_and_code' OR NOT EXISTS(
 SELECT 1 FROM staff_mfa_enrollments e JOIN staff_users u ON u.id=e.user_id
 WHERE e.user_id=NEW.user_id AND u.role='admin' AND u.state='active' AND e.created_at<=NEW.created_at)
 OR EXISTS(SELECT 1 FROM mfa_references WHERE user_id=NEW.user_id AND state='active'))
BEGIN SELECT RAISE(ABORT,'First MFA requires an approved enrollment without an active factor'); END;
ALTER TABLE staff_invitations ADD COLUMN requested_role TEXT NOT NULL DEFAULT 'employee' CHECK(requested_role IN('employee','admin'));
CREATE TRIGGER invitation_admin_owner BEFORE INSERT ON staff_invitations
WHEN NEW.requested_role='admin' AND NOT EXISTS(SELECT 1 FROM staff_ownership WHERE user_id=NEW.issued_by)
BEGIN SELECT RAISE(ABORT,'Only owner may invite admins'); END;
CREATE TRIGGER invitation_role_fixed BEFORE UPDATE OF requested_role ON staff_invitations
WHEN NEW.requested_role IS NOT OLD.requested_role
BEGIN SELECT RAISE(ABORT,'Invitation role is immutable'); END;
DROP TRIGGER invitation_accept_employee;
CREATE TRIGGER invitation_accept_employee BEFORE UPDATE ON staff_invitations
WHEN NEW.state='accepted' AND NOT EXISTS(
 SELECT 1 FROM staff_users u JOIN staff_credentials c ON c.user_id=u.id
 WHERE u.id=NEW.accepted_user_id AND u.role=OLD.requested_role AND u.state='active' AND c.username=OLD.username)
BEGIN SELECT RAISE(ABORT,'Invitation must enroll its named role and identity'); END;
