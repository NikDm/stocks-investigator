import { authenticated } from './auth';
import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { Tracking } from '../src/tracking/store';
import { TrackingRuntime } from '../src/tracking/runtime';

it('replays a close crossing concealed by missed reports and rejects a newer copy of invalidated reasoning at renewal', async () => {
  const f = await researchFixture('tracking:missed-start');
  const publisher = new ResearchPublisher(f.foundation,() => now);
  await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
  const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  let at = now;
  const tracking = new Tracking(f.foundation,() => at);
  const selected = await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'missed-A', versionId: p.decisions[0]!.versionId! });
  await f.foundation.release(f.lease,now);
  // The crossing happens during missed reviews; both most recent closes have recovered above the level.
  const recovered = await researchFixture('tracking:missed-recovery','2026-11-11',false,undefined,undefined,{ 56: '10', 57: '10' });
  at = Date.parse('2026-11-11T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(recovered.foundation,() => at);
    await publisher.begin(recovered.lease,recovered.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    const plan = (await publisher.plan(recovered.snapshotId))!;
    await publisher.publish(recovered.lease,recovered.snapshotId,plan.queue.map(q => ({ securityId: q.securityId, kind: 'assessed', proposal: momentumThesis })));
    const tools = new ResearchTools(recovered.foundation,recovered.lease,{ secUserAgent: '' },() => at);
    const runtime = new TrackingRuntime(tracking,tools,null,[],() => at);
    for (let i=0;i<10 && !await runtime.step(recovered.lease,recovered.snapshotId,at+10000);i++) {}
    const check = (await tracking.checks('A'))[0]!;
    expect(check.invalidated).toContain('close_below:0');
    expect((await tracking.get('A'))!.thesisStatus).toBe('invalidated');
    expect((await tracking.get('A'))!.checkpointAt).toBe(selected.checkpointAt);
    expect((await tracking.version(check.versionId))!.trackingJudgment?.thesisStatus).toBe('invalidated');
    const { request } = await authenticated(() => at);
    expect(await (await request(`/assessments/${check.versionId}`)).text()).toContain('Recorded tracking thesis INVALIDATED');
  } finally { await recovered.foundation.release(recovered.lease,at); }
  const renewal = await researchFixture('tracking:missed-renew','2026-12-02');
  at = Date.parse('2026-12-02T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(renewal.foundation,() => at);
    await publisher.begin(renewal.lease,renewal.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    const p = await publisher.publish(renewal.lease,renewal.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    await tracking.checkpoints();
    const current = (await tracking.get('A'))!;
    await expect(tracking.command('investor',{ action: 'renew', securityId: 'A', expectedRevision: current.revision, key: 'unchanged-replacement', versionId: p.decisions[0]!.versionId! })).rejects.toThrow('revised reasoning');
    expect((await tracking.get('A'))!.status).toBe('needs_renewal');
  } finally { await renewal.foundation.release(renewal.lease,at); }
});
