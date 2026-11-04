CREATE TABLE purchase_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 identity TEXT NOT NULL, command_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 purchase_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 action TEXT NOT NULL CHECK(action IN ('record','correct','remove')),
 acquired_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 UNIQUE(identity,command_key), UNIQUE(purchase_id,revision)
);
CREATE TRIGGER purchase_revision BEFORE INSERT ON purchase_events WHEN
 NEW.revision<>COALESCE((SELECT MAX(revision) FROM purchase_events WHERE purchase_id=NEW.purchase_id),0)+1
 OR (NEW.revision=1 AND NEW.action<>'record') OR (NEW.revision>1 AND NEW.action='record')
 OR EXISTS(SELECT 1 FROM purchase_events WHERE purchase_id=NEW.purchase_id AND action='remove')
 BEGIN SELECT RAISE(ABORT,'purchase revision conflict'); END;
CREATE TRIGGER purchase_events_update BEFORE UPDATE ON purchase_events BEGIN SELECT RAISE(ABORT,'immutable purchase history'); END;
CREATE TRIGGER purchase_events_delete BEFORE DELETE ON purchase_events BEGIN SELECT RAISE(ABORT,'immutable purchase history'); END;
