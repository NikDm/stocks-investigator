import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchPublisher } from '../src/research/publisher';
import { Tracking } from '../src/tracking/store';
import { planEvaluation } from '../src/market/evaluation';
import { instant } from '../src/market/calendar';

import { momentumThesis } from './helpers/tracking';

it('tracks without ownership, replays commands and preserves a slot through invalidation, expiry and session-20 renewal', async () => {
  const f = await researchFixture('tracking:lifecycle'); let at = now;
  try {
    const publisher = new ResearchPublisher(f.foundation,() => at);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
    const publication = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const tracking = new Tracking(f.foundation,() => at), versionId = publication.decisions[0]!.versionId!;
    const command = { action: 'select', securityId: 'A', expectedRevision: 0, key: 'choose-A', versionId };
    const selected = await tracking.command('investor',command);
    expect(selected.status).toBe('active'); expect(selected.thesisStatus).toBe('positive');
    expect(selected.startSession).toBe('2026-11-03');
    expect(selected.checkpointAt).toBe(instant('2026-12-01','16:00','America/New_York'));
    expect(await tracking.command('investor',command)).toEqual(selected);
    await expect(tracking.command('investor',{ ...command, securityId: 'B' })).rejects.toThrow('idempotency');
    await expect(tracking.command('investor',{ ...command, key: 'stale', action: 'archive' })).rejects.toThrow();
    at = selected.checkpointAt;
    await tracking.checkpoints();
    const paused = (await tracking.get('A'))!;
    expect(paused.status).toBe('needs_renewal'); expect((await tracking.list()).filter(x => x.status!=='archived')).toHaveLength(1);
    await expect(tracking.command('investor',{ action: 'renew', securityId: 'A', expectedRevision: paused.revision, key: 'expired', versionId })).rejects.toThrow('current assessment');
    const archived = await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: paused.revision, key: 'archive' });
    expect(archived.status).toBe('archived'); expect(await tracking.history('A')).toHaveLength(3);
    expect(await tracking.version(versionId)).toEqual(await publisher.version(versionId));
    expect((await publisher.publication(f.snapshotId))!.baseline).toEqual(['A','B','C']);
    await planEvaluation(f.capture,f.lease,f.snapshotId,'2026-12-15');
    const collection = await f.capture.tasks(f.snapshotId);
    expect(collection.some(t => t.id.startsWith('outcome:close:') && t.request.end==='2026-12-15' && t.request.securities.some(s => s.securityId==='A'))).toBe(true);
  } finally { await f.foundation.release(f.lease,now); }
});

it('atomically allocates the last slot, rejects stale simultaneous commands and releases capacity only by explicit archive', async () => {
  const names = Array.from({ length: 12 },(_,i) => `A${String(i).padStart(2,'0')}`);
  const f = await researchFixture('tracking:cap','2026-11-03',false,[...names,...Array.from({ length: 13 },(_,i) => `Z${i}`)]);
  try {
    const publisher = new ResearchPublisher(f.foundation,() => now);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
    const p = await publisher.publish(f.lease,f.snapshotId,names.slice(0,3).map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const tracking = new Tracking(f.foundation,() => now);
    const template = p.decisions[0]!.assessment!;
    // Permitted representative prior assessments for candidates outside today's research queue.
    await f.foundation.fenced(f.lease,now,names.slice(3).map(securityId => f.foundation.db.prepare(
      'INSERT INTO research_assessment_versions(id,snapshot_id,security_id,previous_id,command_key,request_hash,cutoff,value) VALUES(?,?,?,NULL,?,?,?,?)')
      .bind(`cap-${securityId}`,f.snapshotId,securityId,'prior-fixture','fixture',now,JSON.stringify({ ...template, securityId }))));
    const select = (securityId: string) => ({ action: 'select', securityId, expectedRevision: 0, key: `pick-${securityId}`,
      versionId: p.decisions.find(d => d.securityId===securityId)?.versionId ?? `cap-${securityId}` });
    for (const id of names.slice(0,9)) await tracking.command('investor',select(id));
    const results = await Promise.allSettled(names.slice(9,11).map(id => tracking.command('investor',select(id))));
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    expect((await tracking.list()).filter(r => r.status!=='archived')).toHaveLength(10);
    const first = (await tracking.get(names[0]!))!;
    const archived = await tracking.command('investor',{ action: 'archive', securityId: first.securityId, expectedRevision: first.revision, key: 'free-slot' });
    expect(archived.status).toBe('archived');
    await tracking.command('investor',select(names[11]!));
    expect((await tracking.list()).filter(r => r.status!=='archived')).toHaveLength(10);
    expect(await tracking.history(first.securityId)).toHaveLength(2);
  } finally { await f.foundation.release(f.lease,now); }
});

it('allows a still-valid weekend selection and uses the next exchange session across the autumn timezone change', async () => {
  const f = await researchFixture('tracking:weekend','2026-11-06');
  const friday = Date.parse('2026-11-06T06:30:00Z'), saturday = Date.parse('2026-11-07T12:00:00Z');
  try {
    const publisher = new ResearchPublisher(f.foundation,() => friday);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: friday+1000, expiresAt: Date.parse('2026-11-09T07:00:00Z') });
    const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const tracking = new Tracking(f.foundation,() => saturday);
    // Earlier tests filled all ten slots. Archive those explicitly before this independent scenario.
    for (const row of await tracking.list()) if (row.status!=='archived') await tracking.command('investor',{ action: 'archive', securityId: row.securityId, expectedRevision: row.revision, key: `weekend-free-${row.securityId}` });
    const selected = await tracking.command('investor',{ action: 'select', securityId: 'B', expectedRevision: (await tracking.get('B'))?.revision ?? 0, key: 'weekend-B', versionId: p.decisions[1]!.versionId! });
    expect(selected.startSession).toBe('2026-11-09');
    expect(selected.checkpointAt).toBe(instant('2026-12-07','16:00','America/New_York'));
  } finally { await f.foundation.release(f.lease,friday); }
});
