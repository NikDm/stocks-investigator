CREATE TABLE research_calls (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), pass_id TEXT NOT NULL,
 kind TEXT NOT NULL, created_at INTEGER NOT NULL, settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1))
);
CREATE TABLE research_charges (
 call_id TEXT NOT NULL REFERENCES research_calls(id), scope TEXT NOT NULL, period TEXT NOT NULL,
 resource TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0),
 actual INTEGER CHECK(actual>=0 AND actual<=amount), ceiling INTEGER NOT NULL CHECK(ceiling>=0),
 PRIMARY KEY(call_id,scope,period,resource)
);
CREATE INDEX research_charge_usage ON research_charges(scope,period,resource);
CREATE TRIGGER research_charge_limit BEFORE INSERT ON research_charges WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR NEW.amount +
 COALESCE((SELECT SUM(COALESCE(actual,amount)) FROM research_charges WHERE scope=NEW.scope AND period=NEW.period AND resource=NEW.resource),0)>NEW.ceiling
 BEGIN SELECT RAISE(ABORT,'research budget exceeded or lease lost'); END;
CREATE TRIGGER research_charges_delete BEFORE DELETE ON research_charges BEGIN SELECT RAISE(ABORT,'immutable research charge'); END;
CREATE TRIGGER research_charges_update BEFORE UPDATE ON research_charges WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR OLD.actual IS NOT NULL OR NEW.actual IS NULL
 OR NEW.call_id<>OLD.call_id OR NEW.scope<>OLD.scope OR NEW.period<>OLD.period OR NEW.resource<>OLD.resource OR NEW.amount<>OLD.amount OR NEW.ceiling<>OLD.ceiling
 BEGIN SELECT RAISE(ABORT,'immutable research charge'); END;
CREATE TRIGGER research_calls_insert BEFORE INSERT ON research_calls WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced research call required'); END;
CREATE TRIGGER research_calls_delete BEFORE DELETE ON research_calls BEGIN SELECT RAISE(ABORT,'immutable research call'); END;
CREATE TRIGGER research_calls_update BEFORE UPDATE ON research_calls WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR OLD.settled=1 OR NEW.settled<>1
 OR NEW.id<>OLD.id OR NEW.run_id<>OLD.run_id OR NEW.pass_id<>OLD.pass_id OR NEW.kind<>OLD.kind OR NEW.created_at<>OLD.created_at
 BEGIN SELECT RAISE(ABORT,'immutable research call'); END;
CREATE TABLE research_sources (id TEXT PRIMARY KEY, security_id TEXT NOT NULL, url TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE INDEX research_source_security ON research_sources(security_id);
CREATE TABLE research_evidence (id TEXT PRIMARY KEY, security_id TEXT NOT NULL, url TEXT NOT NULL, acquired_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE INDEX research_evidence_security ON research_evidence(security_id,url,acquired_at);
CREATE TABLE research_source_clock (id INTEGER PRIMARY KEY CHECK(id=1), last_at INTEGER NOT NULL);
CREATE TRIGGER research_sec_rate BEFORE UPDATE ON research_source_clock WHEN NEW.last_at<OLD.last_at+200
 BEGIN SELECT RAISE(ABORT,'source rate limited'); END;
CREATE TRIGGER research_sources_insert BEFORE INSERT ON research_sources WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced source required'); END;
CREATE TRIGGER research_evidence_insert BEFORE INSERT ON research_evidence WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced evidence required'); END;
CREATE TRIGGER research_sources_update BEFORE UPDATE ON research_sources BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TRIGGER research_sources_delete BEFORE DELETE ON research_sources BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TRIGGER research_evidence_update BEFORE UPDATE ON research_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER research_evidence_delete BEFORE DELETE ON research_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TABLE research_plans (
 snapshot_id TEXT PRIMARY KEY REFERENCES screening_results(snapshot_id), run_id TEXT NOT NULL REFERENCES runs(id),
 input_hash TEXT NOT NULL, cutoff INTEGER NOT NULL, expires_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE research_publications (
 snapshot_id TEXT PRIMARY KEY REFERENCES research_plans(snapshot_id), request_hash TEXT NOT NULL,
 cutoff INTEGER NOT NULL, published_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE research_decisions (
 snapshot_id TEXT NOT NULL REFERENCES research_publications(snapshot_id), security_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('accepted','rejected','insufficient_evidence','unresearched')),
 value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,security_id)
);
CREATE TRIGGER research_plans_insert BEFORE INSERT ON research_plans WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR NEW.input_hash<>(SELECT json_extract(value,'$.inputHash') FROM screening_results WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced frozen screening required'); END;
CREATE TRIGGER research_publications_insert BEFORE INSERT ON research_publications WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR NEW.cutoff>NEW.published_at
 OR NEW.cutoff>(SELECT cutoff FROM research_plans WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced valid research cutoff required'); END;
CREATE TRIGGER research_decisions_insert BEFORE INSERT ON research_decisions WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR NOT EXISTS(SELECT 1 FROM research_plans p,json_each(p.value,'$.queue') q WHERE p.snapshot_id=NEW.snapshot_id AND json_extract(q.value,'$.securityId')=NEW.security_id)
 OR EXISTS(SELECT 1 FROM json_each(NEW.value,'$.assessment.sources') s WHERE NOT EXISTS(
 SELECT 1 FROM research_evidence e JOIN research_publications p ON p.snapshot_id=NEW.snapshot_id
 WHERE e.id=json_extract(s.value,'$.id') AND e.security_id=NEW.security_id AND e.acquired_at<=p.cutoff))
 BEGIN SELECT RAISE(ABORT,'queue or acquired citation mismatch'); END;
CREATE TRIGGER research_plans_update BEFORE UPDATE ON research_plans BEGIN SELECT RAISE(ABORT,'immutable research plan'); END;
CREATE TRIGGER research_plans_delete BEFORE DELETE ON research_plans BEGIN SELECT RAISE(ABORT,'immutable research plan'); END;
CREATE TRIGGER research_publications_update BEFORE UPDATE ON research_publications BEGIN SELECT RAISE(ABORT,'immutable research publication'); END;
CREATE TRIGGER research_publications_delete BEFORE DELETE ON research_publications BEGIN SELECT RAISE(ABORT,'immutable research publication'); END;
CREATE TRIGGER research_decisions_update BEFORE UPDATE ON research_decisions BEGIN SELECT RAISE(ABORT,'immutable research decision'); END;
CREATE TRIGGER research_decisions_delete BEFORE DELETE ON research_decisions BEGIN SELECT RAISE(ABORT,'immutable research decision'); END;
CREATE TABLE research_passes (
 snapshot_id TEXT NOT NULL REFERENCES research_plans(snapshot_id), security_id TEXT NOT NULL,
 revision INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,security_id)
);
CREATE TRIGGER research_passes_insert BEFORE INSERT ON research_passes WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR EXISTS(SELECT 1 FROM research_publications WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced unfinished research required'); END;
CREATE TRIGGER research_passes_update BEFORE UPDATE ON research_passes WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR EXISTS(SELECT 1 FROM research_publications WHERE snapshot_id=NEW.snapshot_id)
 OR json_extract(OLD.value,'$.decision') IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'fenced unfinished research required'); END;
CREATE TABLE research_intake (snapshot_id TEXT PRIMARY KEY REFERENCES research_plans(snapshot_id), revision INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE early_watch_publications (
 snapshot_id TEXT PRIMARY KEY REFERENCES research_plans(snapshot_id), report_date TEXT NOT NULL UNIQUE,
 cutoff INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TABLE early_watch_history (
 snapshot_id TEXT NOT NULL REFERENCES early_watch_publications(snapshot_id), position INTEGER NOT NULL, security_id TEXT NOT NULL,
 event_id TEXT NOT NULL, status TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,position)
);
CREATE TRIGGER research_intake_insert BEFORE INSERT ON research_intake WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced intake required'); END;
CREATE TRIGGER research_intake_update BEFORE UPDATE ON research_intake WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR EXISTS(SELECT 1 FROM early_watch_publications WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced unfinished intake required'); END;
CREATE TRIGGER early_watch_publications_insert BEFORE INSERT ON early_watch_publications WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced watch required'); END;
CREATE TRIGGER early_watch_history_insert BEFORE INSERT ON early_watch_history WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced watch required'); END;
CREATE TRIGGER early_watch_publications_update BEFORE UPDATE ON early_watch_publications BEGIN SELECT RAISE(ABORT,'immutable watch'); END;
CREATE TRIGGER early_watch_publications_delete BEFORE DELETE ON early_watch_publications BEGIN SELECT RAISE(ABORT,'immutable watch'); END;
CREATE TRIGGER early_watch_history_update BEFORE UPDATE ON early_watch_history BEGIN SELECT RAISE(ABORT,'immutable watch'); END;
CREATE TRIGGER early_watch_history_delete BEFORE DELETE ON early_watch_history BEGIN SELECT RAISE(ABORT,'immutable watch'); END;
CREATE TABLE research_assessment_versions (
 id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES research_publications(snapshot_id), security_id TEXT NOT NULL,
 previous_id TEXT UNIQUE REFERENCES research_assessment_versions(id), command_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 cutoff INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), UNIQUE(snapshot_id,security_id,command_key)
);
CREATE TRIGGER research_versions_insert BEFORE INSERT ON research_assessment_versions WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR EXISTS(SELECT 1 FROM json_each(NEW.value,'$.sources') s WHERE NOT EXISTS(
 SELECT 1 FROM research_evidence e WHERE e.id=json_extract(s.value,'$.id') AND e.security_id=NEW.security_id AND e.acquired_at<=NEW.cutoff))
 OR (NEW.previous_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM research_assessment_versions p WHERE p.id=NEW.previous_id AND p.snapshot_id=NEW.snapshot_id AND p.security_id=NEW.security_id AND p.cutoff<=NEW.cutoff))
 BEGIN SELECT RAISE(ABORT,'fenced acquired assessment version required'); END;
CREATE TRIGGER research_versions_update BEFORE UPDATE ON research_assessment_versions BEGIN SELECT RAISE(ABORT,'immutable assessment version'); END;
CREATE TRIGGER research_versions_delete BEFORE DELETE ON research_assessment_versions BEGIN SELECT RAISE(ABORT,'immutable assessment version'); END;
CREATE TABLE research_halts (call_id TEXT PRIMARY KEY REFERENCES research_calls(id), at INTEGER NOT NULL, code TEXT NOT NULL);
CREATE TRIGGER research_halt_insert BEFORE INSERT ON research_halts WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 BEGIN SELECT RAISE(ABORT,'fenced halt required'); END;
CREATE TRIGGER research_halt_update BEFORE UPDATE ON research_halts BEGIN SELECT RAISE(ABORT,'immutable research halt'); END;
CREATE TRIGGER research_halt_delete BEFORE DELETE ON research_halts BEGIN SELECT RAISE(ABORT,'immutable research halt'); END;
CREATE TRIGGER research_halted BEFORE INSERT ON research_calls WHEN EXISTS(SELECT 1 FROM research_halts)
 BEGIN SELECT RAISE(ABORT,'research budget halted pending usage reconciliation'); END;

CREATE INDEX early_watch_event_history ON early_watch_history(security_id,event_id,status);
