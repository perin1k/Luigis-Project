-- Storage only: no account provisioning, authentication or external messaging.
CREATE UNIQUE INDEX events_order_reference ON order_events(id, order_id);
CREATE TABLE staff_users (
  id TEXT PRIMARY KEY NOT NULL,
  identity_subject TEXT NOT NULL UNIQUE CHECK (length(trim(identity_subject)) > 0),
  role TEXT NOT NULL CHECK (role IN ('employee', 'admin')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  disabled_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  CHECK ((state = 'disabled') = (disabled_at IS NOT NULL)),
  CHECK (disabled_at IS NULL OR disabled_at >= created_at)
) STRICT;
CREATE TABLE staff_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  session_token_digest TEXT NOT NULL UNIQUE CHECK (length(session_token_digest) = 64 AND session_token_digest NOT GLOB '*[^0-9a-f]*'),
  authenticated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  mfa_verified_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', authenticated_at, '+8 hours') IS expires_at),
  CHECK (last_activity_at >= authenticated_at AND last_activity_at < expires_at),
  CHECK (mfa_verified_at IS NULL OR (mfa_verified_at >= authenticated_at AND mfa_verified_at <= last_activity_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= last_activity_at)
) STRICT;
CREATE INDEX sessions_by_user ON staff_sessions(user_id, revoked_at);
CREATE TABLE mfa_references (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES staff_users(id),
  provider_reference TEXT NOT NULL UNIQUE CHECK (length(trim(provider_reference)) > 0),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked')),
  enrolled_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK ((state = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= enrolled_at)
) STRICT;
CREATE INDEX factors_by_user ON mfa_references(user_id, state);
CREATE TABLE tracking_grants (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT,
  revoked_at TEXT,
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) STRICT;
CREATE UNIQUE INDEX one_current_tracking_grant ON tracking_grants(order_id) WHERE revoked_at IS NULL;
CREATE INDEX tracking_by_expiry ON tracking_grants(expires_at);
CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  template_key TEXT NOT NULL CHECK (template_key IN ('confirmation', 'ready', 'cancellation', 'refund')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'previewed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  next_attempt_at TEXT,
  previewed_at TEXT,
  sanitized_error_code TEXT CHECK (sanitized_error_code IN ('render_failed', 'template_missing')),
  CHECK ((state = 'previewed') = (previewed_at IS NOT NULL)),
  CHECK (previewed_at IS NULL OR previewed_at >= created_at),
  CHECK (next_attempt_at IS NULL OR next_attempt_at >= created_at),
  FOREIGN KEY (source_event_id, order_id) REFERENCES order_events(id, order_id),
  UNIQUE (source_event_id, channel, template_key)
) STRICT;
CREATE INDEX preview_work_by_state ON notification_outbox(state, next_attempt_at);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES staff_users(id),
  action TEXT NOT NULL CHECK (action IN ('staff_change', 'session_revocation', 'mfa_change', 'tracking_replacement',
    'availability_change', 'menu_change', 'hours_change', 'cancellation_decision', 'refund_update',
    'notification_preview', 'fulfillment_change', 'retention_cleanup')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('staff_user', 'staff_session', 'mfa_reference', 'tracking_grant',
    'ingredient', 'catalog', 'service_day', 'cancellation_request', 'refund', 'notification', 'order', 'retention')),
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  reason_code TEXT CHECK (reason_code IN ('operator_request', 'security', 'business_rule', 'retention')),
  safe_change_summary TEXT NOT NULL CHECK (safe_change_summary IN ('Staff account changed', 'Session revoked',
    'MFA reference changed', 'Tracking grant replaced', 'Availability changed', 'Menu changed',
    'Hours changed', 'Cancellation decided', 'Refund recorded', 'Notification preview updated',
    'Order status changed', 'Record redacted'))
) STRICT;
CREATE INDEX audit_by_entity ON audit_events(entity_type, entity_id, occurred_at);

CREATE TRIGGER staff_role_sessions BEFORE UPDATE OF role ON staff_users
WHEN NEW.role != OLD.role AND EXISTS (SELECT 1 FROM staff_sessions WHERE user_id = OLD.id AND revoked_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'Revoke existing sessions before changing role'); END;
CREATE TRIGGER staff_disable_sessions AFTER UPDATE OF state ON staff_users WHEN NEW.state = 'disabled'
BEGIN UPDATE staff_sessions SET revoked_at = NEW.disabled_at WHERE user_id = NEW.id AND revoked_at IS NULL; END;
CREATE TRIGGER factor_revoke_sessions AFTER UPDATE OF state ON mfa_references WHEN NEW.state = 'revoked'
BEGIN UPDATE staff_sessions SET revoked_at = NEW.revoked_at
  WHERE user_id = NEW.user_id AND mfa_verified_at IS NOT NULL AND revoked_at IS NULL; END;
CREATE TRIGGER session_activity_monotonic BEFORE UPDATE ON staff_sessions
WHEN NEW.last_activity_at < OLD.last_activity_at
  OR NEW.last_activity_at >= strftime('%Y-%m-%dT%H:%M:%fZ', OLD.last_activity_at, '+30 minutes')
  OR (OLD.mfa_verified_at IS NOT NULL AND NEW.mfa_verified_at IS NOT OLD.mfa_verified_at)
BEGIN SELECT RAISE(ABORT, 'Session activity and MFA history cannot move backwards'); END;
CREATE TRIGGER session_initial_activity BEFORE INSERT ON staff_sessions
WHEN NEW.last_activity_at >= strftime('%Y-%m-%dT%H:%M:%fZ', NEW.authenticated_at, '+30 minutes')
BEGIN SELECT RAISE(ABORT, 'Session has exceeded its initial idle limit'); END;
CREATE TRIGGER session_revoked_fixed BEFORE UPDATE ON staff_sessions WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Revoked session is immutable'); END;
CREATE TRIGGER factor_revoked_fixed BEFORE UPDATE ON mfa_references WHEN OLD.state = 'revoked'
BEGIN SELECT RAISE(ABORT, 'Revoked MFA reference is immutable'); END;
CREATE TRIGGER tracking_revocation_fixed BEFORE UPDATE ON tracking_grants
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN SELECT RAISE(ABORT, 'Tracking revocation cannot be undone'); END;
CREATE TRIGGER audit_append_only BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
CREATE TRIGGER staff_users_time_insert BEFORE INSERT ON staff_users
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.disabled_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.disabled_at) IS NOT NEW.disabled_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER staff_users_time_update BEFORE UPDATE ON staff_users
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.disabled_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.disabled_at) IS NOT NEW.disabled_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER staff_sessions_time_insert BEFORE INSERT ON staff_sessions
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.authenticated_at) IS NOT NEW.authenticated_at)) OR ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.last_activity_at) IS NOT NEW.last_activity_at)) OR (NEW.mfa_verified_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.mfa_verified_at) IS NOT NEW.mfa_verified_at)) OR ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER staff_sessions_time_update BEFORE UPDATE ON staff_sessions
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.authenticated_at) IS NOT NEW.authenticated_at)) OR ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.last_activity_at) IS NOT NEW.last_activity_at)) OR (NEW.mfa_verified_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.mfa_verified_at) IS NOT NEW.mfa_verified_at)) OR ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER mfa_references_time_insert BEFORE INSERT ON mfa_references
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.enrolled_at) IS NOT NEW.enrolled_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER mfa_references_time_update BEFORE UPDATE ON mfa_references
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.enrolled_at) IS NOT NEW.enrolled_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER tracking_grants_time_insert BEFORE INSERT ON tracking_grants
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.expires_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER tracking_grants_time_update BEFORE UPDATE ON tracking_grants
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.expires_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at)) OR (NEW.revoked_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.revoked_at) IS NOT NEW.revoked_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER notification_outbox_time_insert BEFORE INSERT ON notification_outbox
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.next_attempt_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.next_attempt_at) IS NOT NEW.next_attempt_at)) OR (NEW.previewed_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.previewed_at) IS NOT NEW.previewed_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER notification_outbox_time_update BEFORE UPDATE ON notification_outbox
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at) IS NOT NEW.created_at)) OR (NEW.next_attempt_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.next_attempt_at) IS NOT NEW.next_attempt_at)) OR (NEW.previewed_at IS NOT NULL AND (strftime('%Y-%m-%dT%H:%M:%fZ', NEW.previewed_at) IS NOT NEW.previewed_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER audit_events_time_insert BEFORE INSERT ON audit_events
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.occurred_at) IS NOT NEW.occurred_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER audit_events_time_update BEFORE UPDATE ON audit_events
WHEN ((strftime('%Y-%m-%dT%H:%M:%fZ', NEW.occurred_at) IS NOT NEW.occurred_at))
BEGIN SELECT RAISE(ABORT, 'Use canonical UTC timestamps with milliseconds'); END;
CREATE TRIGGER staff_users_identity_fixed BEFORE UPDATE ON staff_users
WHEN NEW.id IS NOT OLD.id OR NEW.identity_subject IS NOT OLD.identity_subject OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER staff_sessions_identity_fixed BEFORE UPDATE ON staff_sessions
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.session_token_digest IS NOT OLD.session_token_digest OR NEW.authenticated_at IS NOT OLD.authenticated_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER mfa_references_identity_fixed BEFORE UPDATE ON mfa_references
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.provider_reference IS NOT OLD.provider_reference OR NEW.enrolled_at IS NOT OLD.enrolled_at
BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER tracking_grants_identity_fixed BEFORE UPDATE ON tracking_grants
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.token_digest IS NOT OLD.token_digest OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER notification_outbox_identity_fixed BEFORE UPDATE ON notification_outbox
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.source_event_id IS NOT OLD.source_event_id OR NEW.channel IS NOT OLD.channel OR NEW.template_key IS NOT OLD.template_key OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Record identity cannot change'); END;
CREATE TRIGGER staff_users_keep_history BEFORE DELETE ON staff_users
BEGIN SELECT RAISE(ABORT, 'Preserve access and audit history'); END;
CREATE TRIGGER staff_sessions_keep_history BEFORE DELETE ON staff_sessions
BEGIN SELECT RAISE(ABORT, 'Preserve access and audit history'); END;
CREATE TRIGGER mfa_references_keep_history BEFORE DELETE ON mfa_references
BEGIN SELECT RAISE(ABORT, 'Preserve access and audit history'); END;
CREATE TRIGGER audit_events_keep_history BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Preserve access and audit history'); END;
CREATE TRIGGER session_validate_insert BEFORE INSERT ON staff_sessions
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM staff_users WHERE id = NEW.user_id AND state = 'active')
    AND NEW.revoked_at IS NULL THEN RAISE(ABORT, 'Session requires active staff') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM staff_users WHERE id = NEW.user_id AND role = 'admin')
    AND NEW.mfa_verified_at IS NULL AND NEW.revoked_at IS NULL
    THEN RAISE(ABORT, 'Admin session requires verified MFA marker') END;
END;
CREATE TRIGGER tracking_deadline_insert BEFORE INSERT ON tracking_grants
WHEN EXISTS (SELECT 1 FROM tracking_grants WHERE order_id = NEW.order_id AND expires_at IS NOT NULL
  AND (NEW.expires_at IS NULL OR NEW.expires_at > expires_at))
BEGIN SELECT RAISE(ABORT, 'Tracking replacement cannot extend established expiry'); END;
CREATE TRIGGER session_validate_update BEFORE UPDATE ON staff_sessions
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM staff_users WHERE id = NEW.user_id AND state = 'active')
    AND NEW.revoked_at IS NULL THEN RAISE(ABORT, 'Session requires active staff') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM staff_users WHERE id = NEW.user_id AND role = 'admin')
    AND NEW.mfa_verified_at IS NULL AND NEW.revoked_at IS NULL
    THEN RAISE(ABORT, 'Admin session requires verified MFA marker') END;
END;
CREATE TRIGGER tracking_deadline_update BEFORE UPDATE ON tracking_grants
WHEN EXISTS (SELECT 1 FROM tracking_grants WHERE order_id = NEW.order_id AND expires_at IS NOT NULL
  AND (NEW.expires_at IS NULL OR NEW.expires_at > expires_at))
BEGIN SELECT RAISE(ABORT, 'Tracking replacement cannot extend established expiry'); END;
