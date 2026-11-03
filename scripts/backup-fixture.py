"""Synthetic disposable recovery fixture; no provider or personal data."""
from pathlib import Path
import sqlite3
import sys

connection = sqlite3.connect(':memory:')
for migration in sorted(Path('migrations').glob('*.sql')):
    connection.executescript(migration.read_text())
connection.executescript("""
INSERT INTO runs(id,command_key,payload,state,next_at,created_at,updated_at) VALUES('restore-run','restore','{}','queued',1,1,1);
INSERT INTO write_guard VALUES(1,1);
INSERT INTO reports VALUES('restore-report','restore-run',1,'synthetic-hash',1,1,1);
INSERT INTO artifacts VALUES('restore-report','S1','cohort',1,'{"group":"baseline","security":"S1"}');
INSERT INTO publication_receipts VALUES('restore-report','synthetic-hash',2,1);
UPDATE runs SET state='completed' WHERE id='restore-run';
INSERT INTO budget_limits VALUES('2026-11','search',30);
INSERT INTO budget_limits VALUES('2026-11-03','search',3);
INSERT INTO reservations(id,run_id,attempt,resource,month,day,amount,created_at) VALUES('pending','restore-run',1,'search','2026-11','2026-11-03',1,1);
""")
connection.executescript("""
INSERT INTO market_snapshots(id,run_id,fingerprint,manifest,report_date,horizon_end)
 VALUES('restore-snapshot','restore-run','capture-hash','{"reportDate":"2026-11-03","status":"complete","expectedSession":"2026-11-02"}','2026-11-03','2026-12-15');
INSERT INTO market_decisions VALUES('restore-snapshot','S1','S1','eligible','{"identity":{"securityId":"S1"},"inputIds":["restore-bar"]}');
INSERT INTO market_observations VALUES('restore-bar','S1:raw:2026-11-02','S1','daily','2026-11-02','raw',1,NULL,'{"source":"synthetic","value":{"c":"12.50","v":"1000000"}}');
INSERT INTO market_pages VALUES('restore-snapshot','history',0,'page-hash',1,'{"inputIds":["restore-bar"],"nextToken":"pending-page"}');
INSERT INTO market_sightings VALUES('restore-snapshot','history',0,'restore-bar','S1','daily','2026-11-02','raw','actions-1',1,NULL,1);
INSERT INTO market_tasks(snapshot_id,id,request,token,page,state,attempts,next_at,reason)
 VALUES('restore-snapshot','outcome','{"kind":"bars","basis":"raw"}','pending-page',1,'pending',1,5,'retry');
INSERT INTO market_attempt_events(snapshot_id,task,page,attempt,at,code,retry_at)
 VALUES('restore-snapshot','outcome',1,1,2,'retry',5);
INSERT INTO market_reference_versions VALUES('restore-reference','restore-snapshot','S1','2026-11-03','initial',2,3,NULL,'{"status":"missing_reference","inputIds":[]}');
INSERT INTO market_sources(run_id,name,acquired_at,fingerprint) VALUES('restore-run','instruments',1,'source-hash');
INSERT INTO market_source_pages VALUES('restore-run','instruments',0,'[{"ticker":"S1","isin":"synthetic"}]');
INSERT INTO market_identity_reviews VALUES('restore-review','synthetic','2026-11-01','2026-11-30',1,'{"securityId":"S1","evidence":["https://example.com/synthetic"]}');
INSERT INTO market_collection_identities VALUES('restore-snapshot','S1','2026-11-03','{"securityId":"S1","asof":"2026-11-03"}');
INSERT INTO market_figi_cache VALUES('restore-mapping','synthetic',0,1,'{"data":[]}');
INSERT INTO market_run_state VALUES('restore-run','acquire',1);
INSERT INTO market_bootstrap_retries VALUES('restore-run','figi',1,5,'retry');
INSERT INTO market_successor_links VALUES('restore-successor','S1','S2','2026-11-04',1,'synthetic-merger','["https://example.com/synthetic-merger"]');
UPDATE market_snapshots SET frozen=1 WHERE id='restore-snapshot';
INSERT INTO screening_metrics VALUES('restore-snapshot','S1','metric-hash','{"ticker":"S1","inputIds":["restore-bar"]}');
INSERT INTO screening_ranks VALUES('restore-snapshot','S1','{"rank":1,"disposition":"research_queue"}');
INSERT INTO screening_results VALUES('restore-snapshot','{"baseline":["S1"],"researchQueue":["S1"]}');
""")
connection.execute('DELETE FROM write_guard')
Path(sys.argv[1]).write_text('\n'.join(connection.iterdump()) + '\n')
