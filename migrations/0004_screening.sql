CREATE TABLE screening_metrics (
 snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id), ticker TEXT NOT NULL,
 fingerprint TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 PRIMARY KEY(snapshot_id,ticker)
);
CREATE TABLE screening_ranks (
 snapshot_id TEXT NOT NULL, ticker TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 PRIMARY KEY(snapshot_id,ticker), FOREIGN KEY(snapshot_id,ticker) REFERENCES screening_metrics(snapshot_id,ticker)
);
CREATE TABLE screening_results (
 snapshot_id TEXT PRIMARY KEY REFERENCES market_snapshots(id), value TEXT NOT NULL CHECK(json_valid(value))
);
CREATE TRIGGER screening_metrics_update BEFORE UPDATE ON screening_metrics BEGIN SELECT RAISE(ABORT,'immutable screening metrics'); END;
CREATE TRIGGER screening_metrics_delete BEFORE DELETE ON screening_metrics BEGIN SELECT RAISE(ABORT,'immutable screening metrics'); END;
CREATE TRIGGER screening_ranks_update BEFORE UPDATE ON screening_ranks BEGIN SELECT RAISE(ABORT,'immutable screening ranks'); END;
CREATE TRIGGER screening_ranks_delete BEFORE DELETE ON screening_ranks BEGIN SELECT RAISE(ABORT,'immutable screening ranks'); END;
CREATE TRIGGER screening_results_update BEFORE UPDATE ON screening_results BEGIN SELECT RAISE(ABORT,'immutable screening result'); END;
CREATE TRIGGER screening_results_delete BEFORE DELETE ON screening_results BEGIN SELECT RAISE(ABORT,'immutable screening result'); END;
CREATE TRIGGER screening_metrics_insert BEFORE INSERT ON screening_metrics WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR NOT EXISTS(SELECT 1 FROM market_snapshots WHERE id=NEW.snapshot_id AND frozen=1)
 OR EXISTS(SELECT 1 FROM screening_results WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced frozen snapshot required'); END;
CREATE TRIGGER screening_ranks_insert BEFORE INSERT ON screening_ranks WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1) OR EXISTS(SELECT 1 FROM screening_results WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'fenced unfinished screening required'); END;
CREATE TRIGGER screening_results_insert BEFORE INSERT ON screening_results WHEN
 NOT EXISTS(SELECT 1 FROM write_guard WHERE id=1)
 OR (SELECT COUNT(*) FROM screening_metrics WHERE snapshot_id=NEW.snapshot_id) != (SELECT COUNT(*) FROM market_decisions WHERE snapshot_id=NEW.snapshot_id)
 OR (SELECT COUNT(*) FROM screening_ranks WHERE snapshot_id=NEW.snapshot_id) != (SELECT COUNT(*) FROM screening_metrics WHERE snapshot_id=NEW.snapshot_id)
 BEGIN SELECT RAISE(ABORT,'incomplete or unfenced screening'); END;
