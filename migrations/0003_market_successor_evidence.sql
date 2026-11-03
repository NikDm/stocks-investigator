CREATE TABLE market_successor_links (
 id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, successor_id TEXT NOT NULL, effective_session TEXT NOT NULL,
 acquired_at INTEGER NOT NULL, action_id TEXT NOT NULL, evidence TEXT NOT NULL CHECK(json_valid(evidence)), CHECK(parent_id<>successor_id)
);
CREATE INDEX market_successor_parent ON market_successor_links(parent_id,effective_session);
CREATE TRIGGER successor_link_update BEFORE UPDATE ON market_successor_links BEGIN SELECT RAISE(ABORT,'immutable successor evidence'); END;
CREATE TRIGGER successor_link_delete BEFORE DELETE ON market_successor_links BEGIN SELECT RAISE(ABORT,'immutable successor evidence'); END;
