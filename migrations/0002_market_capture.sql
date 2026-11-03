CREATE TABLE market_snapshots (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), fingerprint TEXT NOT NULL,
 manifest TEXT NOT NULL CHECK(json_valid(manifest)), frozen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE market_observations (
 id TEXT PRIMARY KEY, logical_key TEXT NOT NULL, security_id TEXT NOT NULL,
 kind TEXT NOT NULL, session TEXT NOT NULL, basis TEXT NOT NULL,
 acquired_at INTEGER NOT NULL, revision_of TEXT REFERENCES market_observations(id),
 value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE INDEX market_history ON market_observations(security_id,kind,basis,session,acquired_at);
CREATE INDEX market_revisions ON market_observations(logical_key,acquired_at);
CREATE TABLE market_pages (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), task TEXT NOT NULL, page INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, acquired_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 PRIMARY KEY(snapshot_id,task,page)
);
CREATE TABLE market_tasks (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), id TEXT NOT NULL,
 request TEXT NOT NULL CHECK(json_valid(request)), token TEXT, page INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
 reason TEXT, PRIMARY KEY(snapshot_id,id)
);
CREATE TABLE market_rate_slots (provider TEXT NOT NULL, at INTEGER NOT NULL, reservation_id TEXT PRIMARY KEY REFERENCES reservations(id));
CREATE INDEX market_rate_window ON market_rate_slots(provider,at);
CREATE TRIGGER market_snapshot_frozen BEFORE UPDATE ON market_snapshots WHEN OLD.frozen=1 BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TRIGGER market_snapshot_delete BEFORE DELETE ON market_snapshots BEGIN SELECT RAISE(ABORT,'immutable snapshot'); END;
CREATE TRIGGER market_observation_update BEFORE UPDATE ON market_observations BEGIN SELECT RAISE(ABORT,'immutable observation'); END;
CREATE TRIGGER market_observation_delete BEFORE DELETE ON market_observations BEGIN SELECT RAISE(ABORT,'immutable observation'); END;
CREATE TRIGGER market_page_update BEFORE UPDATE ON market_pages BEGIN SELECT RAISE(ABORT,'immutable capture page'); END;
CREATE TRIGGER market_page_delete BEFORE DELETE ON market_pages BEGIN SELECT RAISE(ABORT,'immutable capture page'); END;
CREATE TRIGGER market_snapshots_fenced BEFORE INSERT ON market_snapshots WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER market_observations_fenced BEFORE INSERT ON market_observations WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TRIGGER market_pages_fenced BEFORE INSERT ON market_pages WHEN NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) BEGIN SELECT RAISE(ABORT,'fenced write required'); END;
CREATE TABLE market_decisions (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), ticker TEXT NOT NULL, security_id TEXT,
 reason TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,ticker)
);
CREATE INDEX market_decision_security ON market_decisions(snapshot_id,security_id);
CREATE TRIGGER market_decision_frozen_update BEFORE UPDATE ON market_decisions WHEN (SELECT frozen FROM market_snapshots WHERE id=OLD.snapshot_id)=1 BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
CREATE TRIGGER market_decision_frozen_insert BEFORE INSERT ON market_decisions WHEN (SELECT frozen FROM market_snapshots WHERE id=NEW.snapshot_id)=1 BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
CREATE TRIGGER market_decision_delete BEFORE DELETE ON market_decisions BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
CREATE TABLE market_attempt_events (
 id INTEGER PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), task TEXT NOT NULL,
 page INTEGER NOT NULL, attempt INTEGER NOT NULL, at INTEGER NOT NULL, code TEXT NOT NULL, retry_at INTEGER
);
CREATE TABLE market_sources (
 run_id TEXT NOT NULL REFERENCES runs(id), name TEXT NOT NULL, acquired_at INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, PRIMARY KEY(run_id,name)
);
CREATE TABLE market_source_pages (
 run_id TEXT NOT NULL, name TEXT NOT NULL, page INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 PRIMARY KEY(run_id,name,page), FOREIGN KEY(run_id,name) REFERENCES market_sources(run_id,name)
);
CREATE TABLE market_bootstrap_retries (
 run_id TEXT NOT NULL REFERENCES runs(id), name TEXT NOT NULL, attempts INTEGER NOT NULL,
 next_at INTEGER NOT NULL, reason TEXT, PRIMARY KEY(run_id,name)
);
CREATE TABLE market_identity_reviews (
 id TEXT PRIMARY KEY, isin TEXT NOT NULL, valid_from TEXT NOT NULL, valid_through TEXT NOT NULL,
 acquired_at INTEGER NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE INDEX identity_review_date ON market_identity_reviews(isin,valid_from,valid_through);
CREATE TRIGGER identity_review_update BEFORE UPDATE ON market_identity_reviews BEGIN SELECT RAISE(ABORT,'immutable identity review'); END;
CREATE TRIGGER identity_review_delete BEFORE DELETE ON market_identity_reviews BEGIN SELECT RAISE(ABORT,'immutable identity review'); END;
CREATE TRIGGER market_source_update BEFORE UPDATE ON market_sources BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TRIGGER market_source_delete BEFORE DELETE ON market_sources BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TRIGGER market_source_page_update BEFORE UPDATE ON market_source_pages BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TRIGGER market_source_page_delete BEFORE DELETE ON market_source_pages BEGIN SELECT RAISE(ABORT,'immutable source'); END;
CREATE TABLE market_reference_versions (
 id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), security_id TEXT NOT NULL,
 session TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('initial','revision')), cutoff INTEGER NOT NULL,
 acquired_at INTEGER NOT NULL, revision_of TEXT REFERENCES market_reference_versions(id), value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE UNIQUE INDEX market_initial_reference ON market_reference_versions(snapshot_id,security_id,session) WHERE kind='initial';
CREATE TRIGGER reference_version_update BEFORE UPDATE ON market_reference_versions BEGIN SELECT RAISE(ABORT,'immutable reference'); END;
CREATE TRIGGER reference_version_delete BEFORE DELETE ON market_reference_versions BEGIN SELECT RAISE(ABORT,'immutable reference'); END;
CREATE TABLE market_collection_identities (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), security_id TEXT NOT NULL, asof TEXT NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(snapshot_id,security_id,asof)
);
CREATE TRIGGER collection_identity_update BEFORE UPDATE ON market_collection_identities BEGIN SELECT RAISE(ABORT,'immutable collection identity'); END;
CREATE TRIGGER collection_identity_delete BEFORE DELETE ON market_collection_identities BEGIN SELECT RAISE(ABORT,'immutable collection identity'); END;
ALTER TABLE market_snapshots ADD COLUMN report_date TEXT;
ALTER TABLE market_snapshots ADD COLUMN horizon_end TEXT;
CREATE INDEX market_active_universes ON market_snapshots(frozen,report_date,horizon_end);
CREATE TABLE market_sightings (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), task TEXT NOT NULL, page INTEGER NOT NULL, input_id TEXT NOT NULL REFERENCES market_observations(id),
 security_id TEXT NOT NULL, kind TEXT NOT NULL, session TEXT NOT NULL, basis TEXT NOT NULL,
 action_version TEXT NOT NULL, acquired_at INTEGER NOT NULL, reused_at INTEGER,
 PRIMARY KEY(snapshot_id,task,page,input_id)
);
CREATE INDEX market_sighting_history ON market_sightings(security_id,kind,basis,session,action_version,acquired_at);
CREATE INDEX market_snapshot_inputs ON market_sightings(snapshot_id,security_id,kind,session);
CREATE TRIGGER market_sighting_update BEFORE UPDATE ON market_sightings BEGIN SELECT RAISE(ABORT,'immutable sighting'); END;
CREATE TRIGGER market_sighting_delete BEFORE DELETE ON market_sightings BEGIN SELECT RAISE(ABORT,'immutable sighting'); END;
CREATE TABLE market_run_state (
 run_id TEXT PRIMARY KEY REFERENCES runs(id), phase TEXT NOT NULL DEFAULT 'bootstrap', cursor INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE market_sources ADD COLUMN reused_at INTEGER;
CREATE TABLE market_figi_cache (
 id TEXT PRIMARY KEY, isin TEXT NOT NULL, unlisted INTEGER NOT NULL, acquired_at INTEGER NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE INDEX market_figi_cache_lookup ON market_figi_cache(isin,unlisted,acquired_at);

CREATE INDEX market_sighting_kind ON market_sightings(snapshot_id,kind,session,security_id);
ALTER TABLE market_sightings ADD COLUMN occurrences INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX one_pending_market_collection ON runs((json_extract(payload,'$.kind')))
 WHERE state IN ('queued','running') AND json_extract(payload,'$.kind')='market-collections';
