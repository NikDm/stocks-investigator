CREATE TABLE outcome_action_reviews (
 id TEXT PRIMARY KEY, input_id TEXT NOT NULL REFERENCES market_observations(id), acquired_at INTEGER NOT NULL,
 reason TEXT NOT NULL, evidence TEXT NOT NULL CHECK(json_valid(evidence)), value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE INDEX outcome_action_review_input ON outcome_action_reviews(input_id,acquired_at);
CREATE TABLE outcome_revisions (
 id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), security_id TEXT NOT NULL,
 horizon INTEGER NOT NULL CHECK(horizon IN (10,20,30)), kind TEXT NOT NULL CHECK(kind IN ('initial','correction')),
 cutoff INTEGER NOT NULL, recorded_at INTEGER NOT NULL, revision_of TEXT REFERENCES outcome_revisions(id),
 reason TEXT NOT NULL, input_hash TEXT NOT NULL, inputs TEXT NOT NULL CHECK(json_valid(inputs)), value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE UNIQUE INDEX outcome_initial ON outcome_revisions(snapshot_id,security_id,horizon) WHERE kind='initial';
CREATE INDEX outcome_history ON outcome_revisions(snapshot_id,security_id,horizon,recorded_at);
CREATE TABLE outcome_work (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), security_id TEXT NOT NULL, horizon INTEGER NOT NULL,
 due_at INTEGER NOT NULL, PRIMARY KEY(snapshot_id,security_id,horizon)
);
CREATE INDEX outcome_due ON outcome_work(due_at,snapshot_id,security_id,horizon);
CREATE TRIGGER outcome_revision_update BEFORE UPDATE ON outcome_revisions BEGIN SELECT RAISE(ABORT,'immutable outcome'); END;
CREATE TRIGGER outcome_revision_delete BEFORE DELETE ON outcome_revisions BEGIN SELECT RAISE(ABORT,'immutable outcome'); END;
CREATE TRIGGER outcome_revision_fence BEFORE INSERT ON outcome_revisions WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced outcome required'); END;
CREATE TRIGGER outcome_member BEFORE INSERT ON outcome_revisions WHEN NOT EXISTS(
 SELECT 1 FROM market_decisions d JOIN market_snapshots s ON s.id=d.snapshot_id
 WHERE s.frozen=1 AND d.snapshot_id=NEW.snapshot_id AND d.security_id=NEW.security_id AND d.reason='eligible')
 BEGIN SELECT RAISE(ABORT,'frozen universe member required'); END;
CREATE TRIGGER outcome_action_review_update BEFORE UPDATE ON outcome_action_reviews BEGIN SELECT RAISE(ABORT,'immutable action review'); END;
CREATE TRIGGER outcome_action_review_delete BEFORE DELETE ON outcome_action_reviews BEGIN SELECT RAISE(ABORT,'immutable action review'); END;
CREATE TRIGGER outcome_action_review_fence BEFORE INSERT ON outcome_action_reviews WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced action review required'); END;

CREATE TABLE outcome_action_coverage (
 snapshot_id TEXT NOT NULL, task TEXT NOT NULL, security_id TEXT NOT NULL, start_session TEXT NOT NULL, end_session TEXT NOT NULL,
 acquired_at INTEGER NOT NULL, terminal_page INTEGER NOT NULL, PRIMARY KEY(snapshot_id,task,security_id),
 FOREIGN KEY(snapshot_id,task) REFERENCES market_tasks(snapshot_id,id)
);
CREATE INDEX outcome_coverage_member ON outcome_action_coverage(security_id,start_session,end_session,acquired_at);
INSERT INTO outcome_action_coverage
 SELECT p.snapshot_id,p.task,json_extract(j.value,'$.securityId'),json_extract(t.request,'$.start'),json_extract(t.request,'$.end'),
 p.acquired_at,p.page FROM market_pages p JOIN market_tasks t ON t.snapshot_id=p.snapshot_id AND t.id=p.task,json_each(t.request,'$.securities') j
 WHERE json_extract(t.request,'$.kind')='actions' AND json_extract(p.value,'$.nextToken') IS NULL
 AND (SELECT COUNT(*) FROM market_pages q WHERE q.snapshot_id=p.snapshot_id AND q.task=p.task AND q.page<=p.page)=p.page+1;
CREATE TRIGGER outcome_coverage_update BEFORE UPDATE ON outcome_action_coverage BEGIN SELECT RAISE(ABORT,'immutable action coverage'); END;
CREATE TRIGGER outcome_coverage_delete BEFORE DELETE ON outcome_action_coverage BEGIN SELECT RAISE(ABORT,'immutable action coverage'); END;
CREATE TABLE outcome_planned(snapshot_id TEXT PRIMARY KEY REFERENCES market_snapshots(id));
