-- Outcome revisions read acquisition receipts by retained observation across saved universes.
CREATE INDEX market_observation_receipts ON market_sightings(input_id,acquired_at);
CREATE INDEX market_action_event_history ON market_observations(security_id,json_extract(value,'$.value.id')) WHERE kind='action' AND basis='raw';
