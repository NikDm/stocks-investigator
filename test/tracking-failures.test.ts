import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { Tracking } from '../src/tracking/store';
import { TrackingRuntime } from '../src/tracking/runtime';

it('shares exhausted search/model pools, publishes an incomplete material version, and pauses research at the existing checkpoint', async () => {
  const f = await researchFixture('tracking:budget-start');
  const p = new ResearchPublisher(f.foundation,() => now);
  await p.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
  const original = await p.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  let at = now;
  const tracking = new Tracking(f.foundation,() => at);
  const selected = await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'budget-A', versionId: original.decisions[0]!.versionId! });
  await f.foundation.release(f.lease,now);
  const next = await researchFixture('tracking:budget-day','2026-11-04',false,undefined,'24'); at = Date.parse('2026-11-04T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(next.foundation,() => at);
    await publisher.begin(next.lease,next.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    const plan = (await publisher.plan(next.snapshotId))!;
    expect(plan.queue.some(q => q.securityId==='A')).toBe(false);
    await publisher.publish(next.lease,next.snapshotId,plan.queue.map(q => ({ securityId: q.securityId, kind: 'assessed', proposal: momentumThesis })));
    let calls = 0;
    const tools = new ResearchTools(next.foundation,next.lease,{ secUserAgent: '', braveKey: 'synthetic' },() => at,async () => { calls++; throw new Error('No network dispatch after exhaustion'); });
    for (let i=0;i<30;i++) await tools.ledger.reserve('search',`discovery-search-${i}`);
    for (let i=0;i<15;i++) await tools.ledger.reserve('model',`discovery-model-${i}`,{ input: 12000, output: 100 });
    const runtime = new TrackingRuntime(tracking,tools,{ modelId: 'fixture', async complete() { calls++; throw new Error('No model dispatch'); } },[],() => at);
    for (let i=0;i<20 && !await runtime.step(next.lease,next.snapshotId,at+10000);i++) {}
    const check = (await tracking.checks('A'))[0]!;
    expect(check.status).toBe('incomplete'); expect(check.material).toContain('momentum_gate_change');
    expect(check.gaps).toContain('model_budget_exhausted'); expect(check.gaps).toContain('source_unavailable_or_budget');
    expect(calls).toBe(0); expect(check.versionId).not.toBe(selected.versionId);
    expect((await tracking.version(check.versionId))!.outcome).toBe('insufficient_evidence');
    expect((await tracking.get('A'))!.checkpointAt).toBe(selected.checkpointAt);
  } finally { await next.foundation.release(next.lease,at); }
  const paused = await researchFixture('tracking:paused-day','2026-12-02'); at = Date.parse('2026-12-02T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(paused.foundation,() => at);
    await publisher.begin(paused.lease,paused.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    await publisher.publish(paused.lease,paused.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    let calls = 0;
    const tools = new ResearchTools(paused.foundation,paused.lease,{ secUserAgent: '', braveKey: 'synthetic' },() => at,async () => { calls++; throw new Error('Paused'); });
    const runtime = new TrackingRuntime(tracking,tools,{ modelId: 'fixture', async complete() { calls++; throw new Error('Paused'); } },[],() => at);
    for (let i=0;i<5 && !await runtime.step(paused.lease,paused.snapshotId,at+10000);i++) {}
    expect((await tracking.checks('A'))[0]!.status).toBe('paused'); expect(calls).toBe(0);
    expect((await tracking.get('A'))!.status).toBe('needs_renewal');
    expect((await tracking.list()).filter(o => o.status!=='archived')).toHaveLength(1);
  } finally { await paused.foundation.release(paused.lease,at); }
});
