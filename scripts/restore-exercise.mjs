import { access, copyFile, mkdtemp, open, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = await mkdtemp(join(tmpdir(), 'stocks-backup-'));
const key = join(dir, 'key'), sql = join(dir, 'source.sql'), sealed = join(dir, 'backup.aes'), restored = join(dir, 'restored.sql');
try {
  execFileSync('python3', ['scripts/backup-fixture.py', sql]);
  for (const args of [['keygen', key], ['seal', sql, sealed, key], ['open', sealed, restored, key]]) {
    execFileSync(process.execPath, ['scripts/backup.mjs', ...args]);
  }
  const damaged = join(dir, 'damaged.aes'), rejected = join(dir, 'rejected.sql');
  await copyFile(sealed, damaged);
  await copyFile(`${sealed}.manifest.json`, `${damaged}.manifest.json`);
  const file = await open(damaged, 'r+');
  try { const byte = Buffer.alloc(1); await file.read(byte, 0, 1, 40); byte[0] ^= 1; await file.write(byte, 0, 1, 40); }
  finally { await file.close(); }
  const check = spawnSync(process.execPath, ['scripts/backup.mjs', 'open', damaged, rejected, key], { stdio: 'ignore' });
  if (check.status === 0) throw new Error('Tampered backup was accepted');
  let exists = false; try { await access(rejected); exists = true; } catch {}
  if (exists) throw new Error('Failed authentication left a plaintext output');
  console.info('Tampered archive rejected; no restored plaintext left behind.');
  process.stdout.write(execFileSync('python3', ['scripts/verify-restore.py', sql, restored]));
} finally { await rm(dir, { recursive: true, force: true }); }
