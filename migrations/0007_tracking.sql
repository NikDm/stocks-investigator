CREATE TABLE tracking_opportunities (
 security_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','needs_renewal','archived')),
 value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE tracking_events (
 identity TEXT NOT NULL, command_key TEXT NOT NULL, request_hash TEXT NOT NULL, security_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0), at INTEGER NOT NULL, action TEXT NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(identity,command_key), UNIQUE(security_id,revision)
);
CREATE INDEX tracking_history ON tracking_events(security_id,revision);
CREATE TRIGGER tracking_event_revision BEFORE INSERT ON tracking_events WHEN
 NEW.revision<>COALESCE((SELECT revision FROM tracking_opportunities WHERE security_id=NEW.security_id),0)+1
 OR json_extract(NEW.value,'$.revision')<>NEW.revision OR json_extract(NEW.value,'$.securityId')<>NEW.security_id
 BEGIN SELECT RAISE(ABORT,'tracking revision conflict'); END;
CREATE TRIGGER tracking_capacity BEFORE INSERT ON tracking_events WHEN
 json_extract(NEW.value,'$.status')<>'archived'
 AND COALESCE((SELECT status FROM tracking_opportunities WHERE security_id=NEW.security_id),'archived')='archived'
 AND (SELECT COUNT(*) FROM tracking_opportunities WHERE status<>'archived')>=10
 BEGIN SELECT RAISE(ABORT,'tracking capacity exceeded'); END;
CREATE TRIGGER tracking_event_apply AFTER INSERT ON tracking_events BEGIN
 INSERT INTO tracking_opportunities(security_id,revision,status,value)
 VALUES(NEW.security_id,NEW.revision,json_extract(NEW.value,'$.status'),NEW.value)
 ON CONFLICT(security_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,value=excluded.value;
END;
CREATE TRIGGER tracking_events_update BEFORE UPDATE ON tracking_events BEGIN SELECT RAISE(ABORT,'immutable tracking history'); END;
CREATE TRIGGER tracking_events_delete BEFORE DELETE ON tracking_events BEGIN SELECT RAISE(ABORT,'immutable tracking history'); END;
CREATE TRIGGER tracking_opportunities_delete BEFORE DELETE ON tracking_opportunities BEGIN SELECT RAISE(ABORT,'retained tracking history'); END;
CREATE TABLE tracking_versions (
 id TEXT PRIMARY KEY, security_id TEXT NOT NULL, previous_id TEXT NOT NULL UNIQUE,
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), cutoff INTEGER NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TRIGGER tracking_versions_insert BEFORE INSERT ON tracking_versions WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR NOT EXISTS(SELECT 1 FROM research_assessment_versions WHERE id=NEW.previous_id AND security_id=NEW.security_id AND cutoff<=NEW.cutoff
 UNION ALL SELECT 1 FROM tracking_versions WHERE id=NEW.previous_id AND security_id=NEW.security_id AND cutoff<=NEW.cutoff)
 OR EXISTS(SELECT 1 FROM json_each(NEW.value,'$.sources') s WHERE NOT EXISTS(
 SELECT 1 FROM research_evidence e WHERE e.id=json_extract(s.value,'$.id') AND e.security_id=NEW.security_id AND e.acquired_at<=NEW.cutoff))
 BEGIN SELECT RAISE(ABORT,'fenced tracking predecessor and citations required'); END;
CREATE TRIGGER tracking_versions_update BEFORE UPDATE ON tracking_versions BEGIN SELECT RAISE(ABORT,'immutable tracking assessment'); END;
CREATE TRIGGER tracking_versions_delete BEFORE DELETE ON tracking_versions BEGIN SELECT RAISE(ABORT,'immutable tracking assessment'); END;
CREATE TABLE tracking_plans (
 snapshot_id TEXT PRIMARY KEY REFERENCES research_publications(snapshot_id), value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE tracking_work (
 snapshot_id TEXT NOT NULL REFERENCES tracking_plans(snapshot_id), security_id TEXT NOT NULL,
 revision INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,security_id)
);
CREATE TABLE tracking_checks (
 snapshot_id TEXT NOT NULL REFERENCES tracking_plans(snapshot_id), security_id TEXT NOT NULL,
 at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,security_id)
);
CREATE INDEX tracking_checks_history ON tracking_checks(security_id,at);
CREATE TRIGGER tracking_plans_insert BEFORE INSERT ON tracking_plans WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced tracking plan required'); END;
CREATE TRIGGER tracking_plans_update BEFORE UPDATE ON tracking_plans BEGIN SELECT RAISE(ABORT,'immutable tracking plan'); END;
CREATE TRIGGER tracking_plans_delete BEFORE DELETE ON tracking_plans BEGIN SELECT RAISE(ABORT,'immutable tracking plan'); END;
CREATE TRIGGER tracking_work_insert BEFORE INSERT ON tracking_work WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced tracking work required'); END;
CREATE TRIGGER tracking_work_update BEFORE UPDATE ON tracking_work WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR EXISTS(SELECT 1 FROM tracking_checks WHERE snapshot_id=NEW.snapshot_id AND security_id=NEW.security_id)
 BEGIN SELECT RAISE(ABORT,'fenced unfinished tracking work required'); END;
CREATE TRIGGER tracking_checks_insert BEFORE INSERT ON tracking_checks WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced tracking check required'); END;
CREATE TRIGGER tracking_checks_update BEFORE UPDATE ON tracking_checks BEGIN SELECT RAISE(ABORT,'immutable tracking check'); END;
CREATE TRIGGER tracking_checks_delete BEFORE DELETE ON tracking_checks BEGIN SELECT RAISE(ABORT,'immutable tracking check'); END;
CREATE TRIGGER tracking_projection_update BEFORE UPDATE ON tracking_opportunities WHEN NOT EXISTS(
 SELECT 1 FROM tracking_events e WHERE e.security_id=NEW.security_id AND e.revision=NEW.revision AND e.value=NEW.value)
 BEGIN SELECT RAISE(ABORT,'tracking event required'); END;
CREATE TRIGGER tracking_projection_insert BEFORE INSERT ON tracking_opportunities WHEN NOT EXISTS(
 SELECT 1 FROM tracking_events e WHERE e.security_id=NEW.security_id AND e.revision=NEW.revision AND e.value=NEW.value)
 BEGIN SELECT RAISE(ABORT,'tracking event required'); END;
