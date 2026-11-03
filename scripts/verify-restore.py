"""Compare a trusted SQL export and disposable decrypted restore, never production."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile

def summarize(sql_path, database):
    connection = sqlite3.connect(database)
    connection.executescript(Path(sql_path).read_text())
    assert connection.execute('PRAGMA integrity_check').fetchone() == ('ok',)
    assert not connection.execute('PRAGMA foreign_key_check').fetchall()
    result = {}
    for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        identifier = '"' + table.replace('"', '""') + '"'
        rows = sorted(json.dumps(row, separators=(',', ':')) for row in connection.execute('SELECT * FROM ' + identifier))
        result[table] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    connection.close()
    return result

with tempfile.TemporaryDirectory(prefix='stocks-restore-') as directory:
    before = summarize(sys.argv[1], str(Path(directory) / 'before.sqlite'))
    after = summarize(sys.argv[2], str(Path(directory) / 'after.sqlite'))
    assert before == after, 'Restored row totals/hashes differ'
    assert hashlib.sha256(Path(sys.argv[1]).read_bytes()).digest() == hashlib.sha256(Path(sys.argv[2]).read_bytes()).digest()
    print(json.dumps({'restore': 'verified', 'tables': after}, indent=2))
