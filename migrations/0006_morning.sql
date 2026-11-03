CREATE TABLE morning_reports (
 id TEXT PRIMARY KEY REFERENCES market_snapshots(id), run_id TEXT NOT NULL REFERENCES runs(id),
 report_date TEXT NOT NULL, rule_version TEXT NOT NULL, cutoff INTEGER NOT NULL, deadline INTEGER NOT NULL,
 artifact_at INTEGER NOT NULL, hash TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 UNIQUE(report_date,rule_version)
);
CREATE TABLE morning_cohorts (
 report_id TEXT NOT NULL REFERENCES morning_reports(id), arm TEXT NOT NULL CHECK(arm IN ('baseline','ai')),
 security_id TEXT NOT NULL, input_hash TEXT NOT NULL, cutoff INTEGER NOT NULL,
 PRIMARY KEY(report_id,arm,security_id)
);
CREATE TABLE morning_receipts (
 report_id TEXT PRIMARY KEY REFERENCES morning_reports(id), hash TEXT NOT NULL,
 observed_at INTEGER NOT NULL, generation INTEGER NOT NULL
);
CREATE TABLE review_feedback (
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES morning_reports(id),
 recorded_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TRIGGER morning_reports_update BEFORE UPDATE ON morning_reports BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_reports_delete BEFORE DELETE ON morning_reports BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_reports_fence BEFORE INSERT ON morning_reports WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced morning publication required'); END;
CREATE TRIGGER morning_cohorts_update BEFORE UPDATE ON morning_cohorts BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_cohorts_delete BEFORE DELETE ON morning_cohorts BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_cohorts_fence BEFORE INSERT ON morning_cohorts WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced morning publication required'); END;
CREATE TRIGGER morning_receipts_update BEFORE UPDATE ON morning_receipts BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_receipts_delete BEFORE DELETE ON morning_receipts BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_receipts_fence BEFORE INSERT ON morning_receipts WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced morning publication required'); END;
CREATE TRIGGER review_feedback_update BEFORE UPDATE ON review_feedback BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER review_feedback_delete BEFORE DELETE ON review_feedback BEGIN SELECT RAISE(ABORT,'immutable morning artifact'); END;
CREATE TRIGGER morning_cohort_match BEFORE INSERT ON morning_cohorts WHEN
 NOT EXISTS(SELECT 1 FROM morning_reports r WHERE r.id=NEW.report_id AND r.cutoff=NEW.cutoff AND json_extract(r.value,'$.inputHash')=NEW.input_hash)
 OR NOT EXISTS(SELECT 1 FROM morning_reports r,json_each(r.value,CASE WHEN NEW.arm='baseline' THEN '$.baseline' ELSE '$.main' END) j WHERE r.id=NEW.report_id AND j.value=NEW.security_id)
 OR NOT EXISTS(SELECT 1 FROM market_decisions d JOIN morning_reports r ON d.snapshot_id=r.id WHERE r.id=NEW.report_id AND d.security_id=NEW.security_id AND d.reason='eligible')
 BEGIN SELECT RAISE(ABORT,'cohort manifest mismatch'); END;
CREATE TRIGGER morning_receipt_match BEFORE INSERT ON morning_receipts WHEN
 NOT EXISTS(SELECT 1 FROM morning_reports r WHERE r.id=NEW.report_id AND r.hash=NEW.hash AND r.artifact_at<=NEW.observed_at AND r.cutoff<=NEW.observed_at)
 BEGIN SELECT RAISE(ABORT,'receipt manifest mismatch'); END;
CREATE TABLE morning_due_events(report_date TEXT PRIMARY KEY, at INTEGER NOT NULL, code TEXT NOT NULL CHECK(code='overdue'));
CREATE TRIGGER morning_due_events_update BEFORE UPDATE ON morning_due_events BEGIN SELECT RAISE(ABORT,'immutable due event'); END;
CREATE TRIGGER morning_due_events_delete BEFORE DELETE ON morning_due_events BEGIN SELECT RAISE(ABORT,'immutable due event'); END;
