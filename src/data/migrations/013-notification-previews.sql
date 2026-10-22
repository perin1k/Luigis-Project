-- Ephemeral internal preview text only. Never stores recipients or tracking secrets.
CREATE TABLE notification_previews (
  notification_id TEXT PRIMARY KEY NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4096),
  generated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',generated_at) IS generated_at)
) STRICT;
CREATE TRIGGER notification_preview_confirmed BEFORE INSERT ON notification_previews
WHEN NOT EXISTS(SELECT 1 FROM notification_outbox n WHERE n.id=NEW.notification_id AND n.state='previewed' AND n.previewed_at=NEW.generated_at)
BEGIN SELECT RAISE(ABORT,'Preview requires a recorded generation outcome'); END;
CREATE TRIGGER notification_preview_fixed BEFORE UPDATE ON notification_previews
BEGIN SELECT RAISE(ABORT,'Generated preview text is immutable'); END;
