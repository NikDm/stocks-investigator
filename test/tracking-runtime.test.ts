import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { momentumThesis } from './helpers/tracking';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { Tracking } from '../src/tracking/store';
import { TrackingRuntime } from '../src/tracking/runtime';

it('publishes dated no-change checks and reuses discovery evidence without rewriting the original assessment', async () => {
  const f = await researchFixture('tracking:daily'); let at = now;
  try {
    const publisher = new ResearchPublisher(f.foundation,() => at);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+60000, expiresAt: now+86400000 });
    const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const tracking = new Tracking(f.foundation,() => at), original = p.decisions[0]!.versionId!;
    await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: 0, key: 'daily-A', versionId: original });
    const tools = new ResearchTools(f.foundation,f.lease,{ secUserAgent: 'research contact@example.com' },() => at);
    const runtime = new TrackingRuntime(tracking,tools,null,[],() => at);
    // Discovery overlap must reuse the already acquired evidence and immutable assessment.
    for (let i=0;i<20 && !await runtime.step(f.lease,f.snapshotId,now+10000);i++) {}
    const checks = await tracking.checks('A');
    expect(checks).toHaveLength(1); expect(checks[0]!.status).toBe('no_material_change');
    expect(checks[0]!.versionId).toBe(original);
    expect((await tracking.get('A'))!.versionId).toBe(original);
    // Replaying the scheduled stage cannot create a second check.
    await runtime.step(f.lease,f.snapshotId,now+10000);
    expect(await tracking.checks('A')).toHaveLength(1);
    expect(await tracking.version(original)).toEqual(p.decisions[0]!.assessment);
    const row = (await tracking.get('A'))!;
    await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: row.revision, key: 'daily-cleanup' });
  } finally { await f.foundation.release(f.lease,now); }
});

it('confirms a session-six close invalidation, appends history, keeps researching until session 20 and renews only from a current revised assessment', async () => {
  const f = await researchFixture('tracking:invalidation-start');
  const publisher = new ResearchPublisher(f.foundation,() => now);
  await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
  const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  let at = now;
  const tracking = new Tracking(f.foundation,() => at), versionId = p.decisions[0]!.versionId!;
  const selected = await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: (await tracking.get('A'))?.revision ?? 0, key: 'invalidate-A', versionId });
  await f.foundation.release(f.lease,now);
  const next = await researchFixture('tracking:invalidation-day','2026-11-11',false,undefined,'10');
  at = Date.parse('2026-11-11T06:30:00Z'); // November 10 is selection session six.
  try {
    const daily = new ResearchPublisher(next.foundation,() => at);
    await daily.begin(next.lease,next.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    const plan = (await daily.plan(next.snapshotId))!;
    await daily.publish(next.lease,next.snapshotId,plan.queue.map(q => ({ securityId: q.securityId, kind: 'unresearched', gap: 'model_unavailable' })));
    const tools = new ResearchTools(next.foundation,next.lease,{ secUserAgent: '' },() => at);
    const runtime = new TrackingRuntime(tracking,tools,null,[],() => at);
    for (let i=0;i<20 && !await runtime.step(next.lease,next.snapshotId,at+10000);i++) {}
    const changed = (await tracking.get('A'))!;
    expect(changed.thesisStatus).toBe('invalidated'); expect(changed.status).toBe('active');
    expect(changed.checkpointAt).toBe(selected.checkpointAt);
    expect(changed.versionId).not.toBe(versionId);
    expect((await tracking.checks('A'))[0]!.material).toContain('daily_close_move');
    expect((await tracking.checks('A'))[0]!.invalidated).toContain('close_below:0');
    expect((await tracking.version(versionId))!.outcome).toBe('accepted');
    expect((await tracking.version(changed.versionId))!.outcome).toBe('insufficient_evidence');
    at = selected.checkpointAt; await tracking.checkpoints();
    const paused = (await tracking.get('A'))!; expect(paused.status).toBe('needs_renewal');
    // A fresh immutable accepted version is required; the original expired thesis cannot renew.
    await expect(tracking.command('investor',{ action: 'renew', securityId: 'A', expectedRevision: paused.revision, key: 'old-thesis', versionId })).rejects.toThrow('current assessment');
    expect((await tracking.list()).filter(o => o.status!=='archived')).toHaveLength(1);
  } finally { await next.foundation.release(next.lease,Date.parse('2026-11-11T06:30:00Z')); }
});

it('runs tracking inside the scheduled coordinator and publishes its checks with the morning review', async () => {
  const { drainMarket } = await import('../src/market/runtime');
  const { MorningReports } = await import('../src/morning/publication');
  const f = await researchFixture('tracking:coordinator','2026-12-02',true);
  const at = Date.parse('2026-12-02T06:30:00Z');
  const publisher = new ResearchPublisher(f.foundation,() => at);
  await publisher.begin(f.lease,f.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
  const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  const tracking = new Tracking(f.foundation,() => at);
  // Prior test left A paused; archive it before selecting a current opportunity.
  const old = await tracking.get('A');
  if (old && old.status!=='archived') await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: old.revision, key: 'coordinator-free-A' });
  await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: (await tracking.get('A'))?.revision ?? 0, key: 'coordinator-A', versionId: p.decisions[0]!.versionId! });
  const { ResearchRuntime } = await import('../src/research/runtime');
  const research = await ResearchRuntime.create(f.foundation,f.lease,{},() => at);
  for (let i=0;i<15 && !await research.step(f.lease,f.snapshotId,at+10000);i++) {}
  await f.foundation.fenced(f.lease,at,[f.foundation.db.prepare("INSERT INTO market_run_state(run_id,phase) VALUES(?,'tracking')").bind(f.lease.runId)]);
  await f.foundation.release(f.lease,at);
  await f.foundation.db.prepare('UPDATE runs SET payload=? WHERE id=?').bind(JSON.stringify({ kind: 'market', reportDate: '2026-12-02', seed: false }),f.lease.runId).run();
  for (let i=0;i<15 && (await f.foundation.run(f.lease.runId))?.state!=='completed';i++) await drainMarket(f.foundation,{},(await f.foundation.run(f.lease.runId))!,() => at,async () => { throw new Error('No live calls'); });
  expect((await f.foundation.run(f.lease.runId))?.state).toBe('completed');
  expect((await tracking.checks('A')).find(c => c.snapshotId===f.snapshotId)?.status).toBe('no_material_change');
  expect((await new MorningReports(f.foundation).get(f.snapshotId))?.value.trackingChecks).toHaveLength(1);
});

it('recovers a pending paid call as an explicit gap without replaying it or refunding its reservation', async () => {
  const f = await researchFixture('tracking:pending','2026-12-03');
  const at = Date.parse('2026-12-03T06:30:00Z');
  try {
    const publisher = new ResearchPublisher(f.foundation,() => at);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
    const p = await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
    const tracking = new Tracking(f.foundation,() => at), old = await tracking.get('A');
    if (old && old.status!=='archived') await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: old.revision, key: 'pending-free-A' });
    await tracking.command('investor',{ action: 'select', securityId: 'A', expectedRevision: (await tracking.get('A'))?.revision ?? 0, key: 'pending-A', versionId: p.decisions[0]!.versionId! });
    let calls = 0;
    const tools = new ResearchTools(f.foundation,f.lease,{ secUserAgent: '' },() => at);
    const runtime = new TrackingRuntime(tracking,tools,{ modelId: 'fixture', async complete() { calls++; throw new Error('Must not replay'); } },[],() => at);
    await runtime.plan(f.lease,f.snapshotId);
    const passId = `tracking:${f.snapshotId}:A`, pending = await tools.ledger.reserve('model',passId,{ input: 100, output: 100 });
    await f.foundation.fenced(f.lease,at,[f.foundation.db.prepare('INSERT INTO tracking_work(snapshot_id,security_id,revision,value) VALUES(?,?,1,?)')
      .bind(f.snapshotId,'A',JSON.stringify({ phase: 'assess', pending, reads: [], gaps: [], repair: 0, requests: [] }))]);
    await runtime.step(f.lease,f.snapshotId,at+10000);
    expect((await tracking.checks('A'))[0]!.status).toBe('incomplete');
    expect((await tracking.checks('A'))[0]!.gaps).toContain('unknown_billed_call');
    expect((await tools.ledger.usage('pass','input',passId)).reserved).toBe(100); expect(calls).toBe(0);
  } finally { await f.foundation.release(f.lease,at); }
});
