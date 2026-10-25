-- Add only sanitized privacy evidence; existing audit history/migrations stay intact.
CREATE TABLE privacy_actions (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES staff_users(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  action TEXT NOT NULL CHECK(action IN ('contact_corrected','copy_reviewed')),
  order_revision INTEGER NOT NULL CHECK(order_revision BETWEEN 1 AND 9007199254740991),
  occurred_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',occurred_at) IS occurred_at)
) STRICT;
CREATE INDEX privacy_actions_by_order ON privacy_actions(order_id,occurred_at);
CREATE TRIGGER privacy_actions_update BEFORE UPDATE ON privacy_actions
BEGIN SELECT RAISE(ABORT,'Privacy actions are append-only'); END;
CREATE TRIGGER privacy_actions_delete BEFORE DELETE ON privacy_actions
BEGIN SELECT RAISE(ABORT,'Privacy actions are append-only'); END;
CREATE TRIGGER privacy_actions_replace BEFORE INSERT ON privacy_actions
WHEN EXISTS(SELECT 1 FROM privacy_actions WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Privacy actions are append-only'); END;
CREATE TRIGGER privacy_actions_actor BEFORE INSERT ON privacy_actions
WHEN NOT EXISTS(SELECT 1 FROM staff_users WHERE id=NEW.actor_id AND role='admin' AND state='active')
BEGIN SELECT RAISE(ABORT,'Active administrative actor required'); END;
