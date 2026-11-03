CREATE TABLE runs (
  id TEXT PRIMARY KEY, command_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed')),
  cursor INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  error_code TEXT
);
CREATE INDEX runnable ON runs(state, next_at, created_at);
CREATE TABLE pipeline (
  id INTEGER PRIMARY KEY CHECK(id=1), run_id TEXT REFERENCES runs(id), owner TEXT,
  generation INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO pipeline(id) VALUES(1);
CREATE TABLE write_guard (id INTEGER PRIMARY KEY CHECK(id=1), valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE pages (
  run_id TEXT NOT NULL REFERENCES runs(id), page INTEGER NOT NULL CHECK(page>=0),
  payload TEXT NOT NULL CHECK(json_valid(payload)), hash TEXT NOT NULL,
  PRIMARY KEY(run_id,page)
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  cutoff INTEGER NOT NULL, manifest_hash TEXT NOT NULL, page_count INTEGER NOT NULL,
  generation INTEGER NOT NULL, artifact_at INTEGER NOT NULL
);
-- Typed artifact envelopes support versioned inputs, universe membership, full-universe
-- opening references/actions, candidate dispositions, baseline/AI cohorts and assessments.
-- Provider-specific columns/constraints belong to the owning downstream tickets.
CREATE TABLE artifacts (
  report_id TEXT NOT NULL REFERENCES reports(id), id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('snapshot_input','universe','reference','action','disposition','cohort','assessment')),
  acquired_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
  PRIMARY KEY(report_id,kind,id)
);
CREATE INDEX artifact_kind ON artifacts(report_id,kind,id);
CREATE TABLE publication_receipts (
  report_id TEXT PRIMARY KEY REFERENCES reports(id), manifest_hash TEXT NOT NULL,
  observed_at INTEGER NOT NULL, generation INTEGER NOT NULL
);
CREATE TABLE budget_limits (
  period TEXT NOT NULL, resource TEXT NOT NULL, ceiling INTEGER NOT NULL CHECK(ceiling>=0),
  PRIMARY KEY(period,resource)
);
CREATE TABLE reservations (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 3),
  resource TEXT NOT NULL, month TEXT NOT NULL, day TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0), actual INTEGER CHECK(actual>=0 AND actual<=amount),
  created_at INTEGER NOT NULL
);
CREATE INDEX reservation_usage ON reservations(resource,month,day);
CREATE TABLE stage_events (
  id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), generation INTEGER NOT NULL,
  at INTEGER NOT NULL, code TEXT NOT NULL CHECK(code IN ('page_committed','retry','completed','failed')),
  page INTEGER NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, item_count INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER reports_no_update BEFORE UPDATE ON reports BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER reports_no_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER artifacts_no_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER artifacts_no_delete BEFORE DELETE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER publication_receipts_no_update BEFORE UPDATE ON publication_receipts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER publication_receipts_no_delete BEFORE DELETE ON publication_receipts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER reservations_no_delete BEFORE DELETE ON reservations BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
CREATE TRIGGER artifact_cutoff BEFORE INSERT ON artifacts
WHEN NEW.acquired_at > (SELECT cutoff FROM reports WHERE id=NEW.report_id)
BEGIN SELECT RAISE(ABORT,'input after cutoff'); END;
CREATE TABLE input_versions (
  id TEXT PRIMARY KEY, security_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('daily','opening','action','catalogue','calendar','identity')),
  source TEXT NOT NULL, as_of INTEGER NOT NULL, acquired_at INTEGER NOT NULL,
  revision_of TEXT REFERENCES input_versions(id), value TEXT NOT NULL CHECK(json_valid(value)),
  hash TEXT NOT NULL
);
CREATE INDEX input_security ON input_versions(security_id,kind,as_of,id);
CREATE TRIGGER inputs_no_update BEFORE UPDATE ON input_versions
WHEN NEW.hash<>OLD.hash OR NEW.id<>OLD.id OR NEW.security_id<>OLD.security_id
 OR NEW.kind<>OLD.kind OR NEW.source<>OLD.source OR NEW.as_of<>OLD.as_of
 OR NEW.acquired_at<>OLD.acquired_at OR NEW.revision_of IS NOT OLD.revision_of OR NEW.value<>OLD.value
BEGIN SELECT RAISE(ABORT,'immutable input'); END;
CREATE TRIGGER inputs_no_delete BEFORE DELETE ON input_versions BEGIN SELECT RAISE(ABORT,'immutable input'); END;
CREATE TRIGGER reservation_reconcile_only BEFORE UPDATE ON reservations
WHEN OLD.actual IS NOT NULL OR NEW.id<>OLD.id OR NEW.run_id<>OLD.run_id OR NEW.attempt<>OLD.attempt
 OR NEW.resource<>OLD.resource OR NEW.month<>OLD.month OR NEW.day<>OLD.day OR NEW.amount<>OLD.amount
 OR NEW.created_at<>OLD.created_at OR NEW.actual IS NULL
BEGIN SELECT RAISE(ABORT,'immutable reservation'); END;
CREATE TRIGGER pages_frozen_insert BEFORE INSERT ON pages
WHEN EXISTS(SELECT 1 FROM reports WHERE run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT,'published manifest'); END;
CREATE TRIGGER pages_frozen_update BEFORE UPDATE ON pages
WHEN EXISTS(SELECT 1 FROM reports WHERE run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT,'published manifest'); END;
CREATE TRIGGER pages_frozen_delete BEFORE DELETE ON pages
WHEN EXISTS(SELECT 1 FROM reports WHERE run_id=OLD.run_id)
BEGIN SELECT RAISE(ABORT,'published manifest'); END;
CREATE TRIGGER snapshot_reference BEFORE INSERT ON artifacts
WHEN NEW.kind='snapshot_input' AND NOT EXISTS(
  SELECT 1 FROM input_versions i JOIN reports r ON r.id=NEW.report_id
  WHERE i.id=json_extract(NEW.value,'$.inputId') AND i.acquired_at<=r.cutoff)
BEGIN SELECT RAISE(ABORT,'missing or post-cutoff input'); END;
CREATE TRIGGER reports_fenced_insert BEFORE INSERT ON reports
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER artifacts_fenced_insert BEFORE INSERT ON artifacts
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER publication_receipts_fenced_insert BEFORE INSERT ON publication_receipts
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER input_versions_fenced_insert BEFORE INSERT ON input_versions
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER pages_fenced_insert BEFORE INSERT ON pages
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER reservations_fenced_insert BEFORE INSERT ON reservations
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER stage_events_fenced_insert BEFORE INSERT ON stage_events
WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1 AND valid=1)
BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER run_completion BEFORE UPDATE OF state ON runs
WHEN NEW.state='completed' AND NOT EXISTS(
  SELECT 1 FROM reports r JOIN publication_receipts p ON p.report_id=r.id WHERE r.run_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'publication receipt required'); END;
