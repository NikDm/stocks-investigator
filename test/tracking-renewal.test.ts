import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { Tracking } from '../src/tracking/store';
import { instant } from '../src/market/calendar';

it('renews only explicitly with current reasoning and starts the next exchange session without rewriting prior intervals', async () => {
  const f = await researchFixture('tracking:renew-start');
  const publisher = new ResearchPublisher(f.foundation,() => now);
  await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
  const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  let at = now;
  const tracking = new Tracking(f.foundation,() => at);
  const first = await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'renew-select', versionId: p.decisions[0]!.versionId! });
  await f.foundation.release(f.lease,now);
  const next = await researchFixture('tracking:renew-current','2026-12-01');
  const morning = Date.parse('2026-12-01T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(next.foundation,() => morning);
    await publisher.begin(next.lease,next.snapshotId,{ cutoff: morning+1000, expiresAt: morning+86400000 });
    const p = await publisher.publish(next.lease,next.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    at = first.checkpointAt-1;
    await expect(tracking.command('investor',{ action: 'renew', securityId: 'A', expectedRevision: first.revision, key: 'too-early', versionId: p.decisions[0]!.versionId! })).rejects.toThrow('not due');
    at++; await tracking.checkpoints();
    const paused = (await tracking.get('A'))!;
    const command = { action: 'renew', securityId: 'A', expectedRevision: paused.revision, key: 'renew-A', versionId: p.decisions[0]!.versionId! };
    const renewed = await tracking.command('investor',command);
    expect(renewed.status).toBe('active'); expect(renewed.startSession).toBe('2026-12-02');
    expect(renewed.checkpointAt).toBe(instant('2026-12-29','16:00','America/New_York'));
    expect(renewed.interval).toBe(2); expect(renewed.selectedAt).toBe(first.selectedAt);
    expect(await tracking.command('investor',command)).toEqual(renewed);
    expect((await tracking.history('A'))[0]!.value.checkpointAt).toBe(first.checkpointAt);
    await expect(next.foundation.db.prepare("UPDATE tracking_events SET action='archive'").run()).rejects.toThrow('immutable');
  } finally { await next.foundation.release(next.lease,morning); }
});
