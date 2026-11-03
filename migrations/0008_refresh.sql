CREATE TABLE refresh_requests (
 run_id TEXT PRIMARY KEY REFERENCES runs(id), morning_id TEXT NOT NULL REFERENCES morning_reports(id),
 session TEXT NOT NULL, accepted_at INTEGER NOT NULL, plan TEXT NOT NULL CHECK(json_valid(plan))
);
CREATE TABLE refresh_commands (
 identity TEXT NOT NULL, command_key TEXT NOT NULL, morning_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES refresh_requests(run_id),
 PRIMARY KEY(identity,command_key)
);
-- Mirrors refreshPolicy.sessionLimit=2 and cooldownMs=600000; SQL makes concurrent admission atomic.
CREATE TRIGGER refresh_request_limit BEFORE INSERT ON refresh_requests WHEN
 EXISTS(SELECT 1 FROM refresh_requests q JOIN runs r ON r.id=q.run_id WHERE r.state IN ('queued','running'))
 OR (SELECT COUNT(*) FROM refresh_requests WHERE session=NEW.session)>=2
 OR EXISTS(SELECT 1 FROM refresh_requests WHERE session=NEW.session AND accepted_at>NEW.accepted_at-600000)
 BEGIN SELECT RAISE(ABORT,'refresh request limit'); END;
CREATE TABLE refresh_work (
 run_id TEXT NOT NULL REFERENCES refresh_requests(run_id), security_id TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(run_id,security_id)
);
CREATE TABLE refresh_reports (
 run_id TEXT PRIMARY KEY REFERENCES refresh_requests(run_id), cutoff INTEGER NOT NULL, artifact_at INTEGER NOT NULL,
 hash TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE refresh_versions (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES refresh_reports(run_id), security_id TEXT NOT NULL,
 previous_id TEXT, cutoff INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), UNIQUE(run_id,security_id)
);
CREATE TABLE refresh_cohorts (
 run_id TEXT NOT NULL REFERENCES refresh_reports(run_id), arm TEXT NOT NULL CHECK(arm IN ('ai','baseline')), security_id TEXT NOT NULL,
 input_hash TEXT NOT NULL, cutoff INTEGER NOT NULL, PRIMARY KEY(run_id,arm,security_id)
);
CREATE TABLE refresh_receipts (
 run_id TEXT PRIMARY KEY REFERENCES refresh_reports(run_id), hash TEXT NOT NULL, observed_at INTEGER NOT NULL, generation INTEGER NOT NULL
);
CREATE TRIGGER refresh_cohort_match BEFORE INSERT ON refresh_cohorts WHEN NOT EXISTS(
 SELECT 1 FROM refresh_reports r,json_each(r.value,CASE WHEN NEW.arm='ai' THEN '$.main' ELSE '$.baseline' END) j
 WHERE r.run_id=NEW.run_id AND j.value=NEW.security_id AND r.cutoff=NEW.cutoff AND json_extract(r.value,'$.inputHash')=NEW.input_hash)
 BEGIN SELECT RAISE(ABORT,'refresh cohort mismatch'); END;
CREATE TRIGGER refresh_receipt_match BEFORE INSERT ON refresh_receipts WHEN NOT EXISTS(
 SELECT 1 FROM refresh_reports WHERE run_id=NEW.run_id AND hash=NEW.hash AND cutoff<=NEW.observed_at AND artifact_at<=NEW.observed_at)
 BEGIN SELECT RAISE(ABORT,'refresh receipt mismatch'); END;
CREATE TRIGGER refresh_requests_update BEFORE UPDATE ON refresh_requests BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_requests_delete BEFORE DELETE ON refresh_requests BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_commands_update BEFORE UPDATE ON refresh_commands BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_commands_delete BEFORE DELETE ON refresh_commands BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_reports_update BEFORE UPDATE ON refresh_reports BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_reports_delete BEFORE DELETE ON refresh_reports BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_versions_update BEFORE UPDATE ON refresh_versions BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_versions_delete BEFORE DELETE ON refresh_versions BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_cohorts_update BEFORE UPDATE ON refresh_cohorts BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_cohorts_delete BEFORE DELETE ON refresh_cohorts BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_receipts_update BEFORE UPDATE ON refresh_receipts BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_receipts_delete BEFORE DELETE ON refresh_receipts BEGIN SELECT RAISE(ABORT,'immutable refresh artifact'); END;
CREATE TRIGGER refresh_work_fence BEFORE INSERT ON refresh_work WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced refresh write required'); END;
CREATE TRIGGER refresh_reports_fence BEFORE INSERT ON refresh_reports WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced refresh write required'); END;
CREATE TRIGGER refresh_versions_fence BEFORE INSERT ON refresh_versions WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced refresh write required'); END;
CREATE TRIGGER refresh_cohorts_fence BEFORE INSERT ON refresh_cohorts WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced refresh write required'); END;
CREATE TRIGGER refresh_receipts_fence BEFORE INSERT ON refresh_receipts WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced refresh write required'); END;
CREATE TRIGGER refresh_work_fence_update BEFORE UPDATE ON refresh_work WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR EXISTS(SELECT 1 FROM refresh_reports WHERE run_id=NEW.run_id) BEGIN SELECT RAISE(ABORT,'fenced unfinished refresh required'); END;

CREATE TRIGGER refresh_version_match BEFORE INSERT ON refresh_versions WHEN
 NOT EXISTS(SELECT 1 FROM refresh_reports r,json_each(r.value,'$.entries') e
 WHERE r.run_id=NEW.run_id AND r.cutoff=NEW.cutoff AND json_extract(e.value,'$.versionId')=NEW.id
 AND json_extract(e.value,'$.securityId')=NEW.security_id AND json_extract(e.value,'$.assessment')=NEW.value)
 OR EXISTS(SELECT 1 FROM json_each(NEW.value,'$.sources') s WHERE NOT EXISTS(
 SELECT 1 FROM research_evidence e WHERE e.id=json_extract(s.value,'$.id') AND e.security_id=NEW.security_id
 AND e.acquired_at<=NEW.cutoff AND (json_extract(e.value,'$.publishedAt') IS NULL OR json_extract(e.value,'$.publishedAt')<=NEW.cutoff)))
 BEGIN SELECT RAISE(ABORT,'refresh version or evidence mismatch'); END;

DROP TRIGGER tracking_versions_insert;
CREATE TRIGGER tracking_versions_insert BEFORE INSERT ON tracking_versions WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR NOT EXISTS(SELECT 1 FROM research_assessment_versions WHERE id=NEW.previous_id AND security_id=NEW.security_id AND cutoff<=NEW.cutoff
 UNION ALL SELECT 1 FROM tracking_versions WHERE id=NEW.previous_id AND security_id=NEW.security_id AND cutoff<=NEW.cutoff
 UNION ALL SELECT 1 FROM refresh_versions WHERE id=NEW.previous_id AND security_id=NEW.security_id AND cutoff<=NEW.cutoff)
 OR EXISTS(SELECT 1 FROM json_each(NEW.value,'$.sources') s WHERE NOT EXISTS(
 SELECT 1 FROM research_evidence e WHERE e.id=json_extract(s.value,'$.id') AND e.security_id=NEW.security_id AND e.acquired_at<=NEW.cutoff))
 BEGIN SELECT RAISE(ABORT,'fenced tracking predecessor and citations required'); END;
