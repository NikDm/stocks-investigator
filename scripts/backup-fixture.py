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
connection.execute('DELETE FROM write_guard')
Path(sys.argv[1]).write_text('\n'.join(connection.iterdump()) + '\n')
