import { expect, it } from 'vitest';
import { researchFixture } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';
import { MorningReports } from '../src/morning/publication';
import { planEvaluation } from '../src/market/evaluation';
import { Refreshes } from '../src/refresh/store';

async function morning(key: string, date = '2026-11-03', accepted = false) {
  const f = await researchFixture(key,date);
  const now = Date.parse(`${date}T06:30:00Z`);
  if (accepted) {
    const { ResearchPublisher } = await import('../src/research/publisher');
    const { momentumThesis } = await import('./helpers/tracking');
    const publisher = new ResearchPublisher(f.foundation,() => now);
    await publisher.begin(f.lease,f.snapshotId,{ cutoff: now+1000, expiresAt: now+86400000 });
    await publisher.publish(f.lease,f.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: momentumThesis })));
  }
  const runtime = await ResearchRuntime.create(f.foundation,f.lease,{},() => now);
  for (let i=0;i<20 && !await runtime.step(f.lease,f.snapshotId,now+1000);i++) {}
  await planEvaluation(f.capture,f.lease,f.snapshotId,new Date(Date.parse(`${date}T12:00:00Z`)-86400000).toISOString().slice(0,10));
  await new MorningReports(f.foundation,() => now).publish(f.lease,f.snapshotId);
  await f.foundation.release(f.lease,now);
  return f;
}
it('queues one durable refresh, deduplicates overlap and enforces cooldown, session cap and latest start', async () => {
  const f = await morning('refresh:commands');
  let at = Date.parse('2026-11-03T12:00:00Z');
  const refresh = new Refreshes(f.foundation,() => at);
  const first = await refresh.command('investor',{ morningId: f.snapshotId, key: 'one' });
  expect(first.nextTickDelaySeconds).toBe(300);
  expect((await refresh.get(first.runId))?.plan.entries.map(e => e.securityId)).toEqual(['A','B','C']);
  expect((await refresh.command('investor',{ morningId: f.snapshotId, key: 'two' })).runId).toBe(first.runId);
  const lease = (await f.foundation.claim(first.runId,'failure',at))!;
  await f.foundation.fail(lease,at,{ permanent: true }); await f.foundation.release(lease,at);
  await expect(refresh.command('investor',{ morningId: f.snapshotId, key: 'three' })).rejects.toThrow('cooldown');
  at += 600000;
  const second = await refresh.command('investor',{ morningId: f.snapshotId, key: 'three' });
  expect(second.runId).not.toBe(first.runId);
  const lease2 = (await f.foundation.claim(second.runId,'failure',at))!;
  await f.foundation.fail(lease2,at,{ permanent: true }); await f.foundation.release(lease2,at);
  at += 600000;
  await expect(refresh.command('investor',{ morningId: f.snapshotId, key: 'four' })).rejects.toThrow('session limit');
  at = Date.parse('2026-11-03T14:20:00Z');
  await expect(refresh.command('investor',{ morningId: f.snapshotId, key: 'late' })).rejects.toThrow('cutoff');
  expect((await refresh.command('investor',{ morningId: f.snapshotId, key: 'one' })).runId).toBe(first.runId);
});

it('appends compared refresh versions and matched cohorts while preserving the morning, and excludes equality recovery', async () => {
  const { RefreshPublication } = await import('../src/refresh/publication');
  const { momentumThesis } = await import('./helpers/tracking');
  const f = await morning('refresh:publication','2026-11-04');
  let at = Date.parse('2026-11-04T12:00:00Z');
  const refresh = new Refreshes(f.foundation,() => at);
  const before = await new MorningReports(f.foundation).get(f.snapshotId);
  const request = await refresh.command('investor',{ morningId: f.snapshotId, key: 'publish' });
  let lease = (await f.foundation.claim(request.runId,'publisher',at))!;
  const publications = new RefreshPublication(refresh);
  const decisions = ['A','B','C'].map(securityId => ({ securityId, proposal: momentumThesis, gap: null, modelId: 'fixture', price: null }));
  const published = await publications.publish(lease,decisions);
  expect(published.value.entries[0]?.assessment?.priceCondition.currentEntryValidated).toBe(false);
  expect(published.value.entries[0]?.changes).toContain('morning_assessment_unavailable');
  expect(published.timing).toBe('unverified');
  await publications.certify(lease);
  expect((await publications.get(request.runId))?.evaluated).toBe(true);
  expect((await publications.get(request.runId))?.cohorts).toHaveLength(6);
  expect(await new MorningReports(f.foundation).get(f.snapshotId)).toEqual(before);
  await f.foundation.fail(lease,at,{ permanent: true });
  await f.foundation.release(lease,at);
  at += 600000;
  const second = await refresh.command('investor',{ morningId: f.snapshotId, key: 'recovery' });
  lease = (await f.foundation.claim(second.runId,'publisher',at))!;
  await publications.publish(lease,decisions);
  await f.foundation.release(lease,at);
  at = Date.parse('2026-11-04T14:25:00Z');
  lease = (await f.foundation.claim(second.runId,'recovered',at))!;
  await publications.certify(lease);
  expect((await publications.get(second.runId))?.timing).toBe('late');
  expect((await publications.get(second.runId))?.evaluated).toBe(false);
  expect((await publications.get(second.runId))?.cohorts).toEqual([]);
  await f.foundation.fail(lease,at,{ permanent: true });
  await f.foundation.release(lease,at);
});

it('runs bounded queued research with stale premarket timestamps and preserves unknown billed failures on replay', async () => {
  const { RefreshRuntime } = await import('../src/refresh/runtime');
  const { RefreshPublication } = await import('../src/refresh/publication');
  const { ResearchTools } = await import('../src/research/tools');
  const { momentumThesis } = await import('./helpers/tracking');
  const f = await morning('refresh:runtime','2026-11-05');
  const at = Date.parse('2026-11-05T12:00:00Z');
  const refreshes = new Refreshes(f.foundation,() => at);
  const accepted = await refreshes.command('investor',{ morningId: f.snapshotId, key: 'runtime' });
  const lease = (await f.foundation.claim(accepted.runId,'research',at))!;
  let calls = 0;
  const tools = new ResearchTools(f.foundation,lease,{ secUserAgent: '' },() => at);
  const runtime = new RefreshRuntime(refreshes,tools,{ modelId: 'fixture', async complete() {
    calls++; if (calls===2) throw new Error('lost response');
    return { output: { kind: 'assessment', proposal: momentumThesis }, usage: { input: 100, output: 100 } };
  } },{ async latest() { return { price: '25', volume: '100', eventAt: at-1800000, acquiredAt: at, delayMs: 900000, source: 'alpaca_sip', basis: 'raw' }; } },[],() => at);
  try {
    for (let i=0;i<40 && !await runtime.step(lease,at+35000);i++) {}
    const result = (await new RefreshPublication(refreshes).get(accepted.runId))!;
    expect(result.value.entries.map(e => e.priceStatus)).toEqual(['stale','stale','stale']);
    expect(result.value.entries[1]?.gap).toContain('unknown_billed_call');
    expect(result.value.entries[1]?.assessment).toBeNull();
    expect(result.evaluated).toBe(false);
    expect((await tools.ledger.usage('day','turn')).reserved).toBe(3);
    await runtime.step(lease,at+35000);
    expect(calls).toBe(3);
    await f.foundation.fail(lease,at,{ permanent: true });
  } finally { await f.foundation.release(lease,at); }
});

it('authorizes private refresh commands, exposes durable progress and disables requests without time to fit', async () => {
  const { authenticated } = await import('./auth');
  const { createApp } = await import('../src/http');
  const f = await morning('refresh:http','2026-11-06');
  let at = Date.parse('2026-11-06T12:00:00Z');
  const { request, bindings } = await authenticated(() => at);
  Object.assign(bindings,{ MARKET_ENABLED: 'true' });
  const csrf = await (await request('/api/csrf')).json() as { token: string };
  const body = JSON.stringify({ morningId: f.snapshotId, key: 'private' });
  const headers = { origin: bindings.APP_ORIGIN, 'x-csrf-token': csrf.token, 'content-type': 'application/json' };
  expect((await createApp().request('https://research.example/api/refresh',{ method: 'POST', body },bindings)).status).toBe(401);
  expect((await request('/api/refresh',{ method: 'POST', headers: { ...headers, 'x-csrf-token': '' },body })).status).toBe(403);
  expect((await request('/api/refresh',{ method: 'POST', headers: { ...headers, origin: 'https://foreign.example' },body })).status).toBe(403);
  const response = await request('/api/refresh',{ method: 'POST',headers,body });
  expect(response.status).toBe(202);
  const accepted = await response.json() as { runId: string; nextTickDelaySeconds: number };
  expect(accepted.nextTickDelaySeconds).toBe(300);
  const view = await (await request(`/refresh/${accepted.runId}`)).text();
  expect(view).toContain('Check Trading 212 live');
  expect(view).toContain('prior versions preserved');
  const lease = (await f.foundation.claim(accepted.runId,'failure',at))!;
  await f.foundation.fail(lease,at,{ permanent: true }); await f.foundation.release(lease,at);
  expect(await (await request(`/refresh/${accepted.runId}`)).text()).toContain('Failed refresh');
  at = Date.parse('2026-11-06T14:10:00Z');
  expect(await (await request(`/morning/${encodeURIComponent(f.snapshotId)}`)).text()).toContain('refresh cutoff cannot fit');
});

it('deduplicates tracked morning candidates, includes tracking-only names without evaluating them and rejects changed idempotency payloads', async () => {
  const { ResearchPublisher } = await import('../src/research/publisher');
  const { Tracking } = await import('../src/tracking/store');
  const { momentumThesis } = await import('./helpers/tracking');
  const { RefreshPublication } = await import('../src/refresh/publication');
  const prior = await researchFixture('refresh:prior-D','2026-11-09',false,['D','E','F','G','H','I','J','K','L']);
  let at = Date.parse('2026-11-09T06:30:00Z');
  const publisher = new ResearchPublisher(prior.foundation,() => at);
  await publisher.begin(prior.lease,prior.snapshotId,{ cutoff: at+1000, expiresAt: at+86400000 });
  const p = await publisher.publish(prior.lease,prior.snapshotId,[{ securityId: 'D', kind: 'assessed', proposal: momentumThesis }]);
  const tracking = new Tracking(prior.foundation,() => at);
  const d = await tracking.command('investor',{ securityId: 'D', versionId: p.decisions[0]!.versionId!, key: 'refresh-track-D', expectedRevision: 0, action: 'select' });
  await prior.foundation.release(prior.lease,at);
  const f = await morning('refresh:tracked','2026-11-10',true);
  at = Date.parse('2026-11-10T12:00:00Z');
  const morningReport = (await new MorningReports(f.foundation).get(f.snapshotId))!;
  const a = await tracking.command('investor',{ securityId: 'A', versionId: morningReport.value.decisions[0]!.versionId!, key: 'refresh-track-A', expectedRevision: 0, action: 'select' });
  const refreshes = new Refreshes(f.foundation,() => at);
  const concurrent = await Promise.all(['concurrent-1','concurrent-2'].map(key => refreshes.command('investor',{ morningId: f.snapshotId, key })));
  expect(concurrent[0]!.runId).toBe(concurrent[1]!.runId);
  const runId = concurrent[0]!.runId;
  expect((await refreshes.get(runId))!.plan.entries.map(e => e.securityId)).toEqual(['A','B','C','D']);
  await expect(refreshes.command('investor',{ morningId: 'changed', key: 'concurrent-1' })).rejects.toThrow('idempotency');
  const lease = (await f.foundation.claim(runId,'publication',at))!;
  try {
    const publication = new RefreshPublication(refreshes);
    await publication.publish(lease,['A','B','C','D'].map(securityId => ({ securityId, proposal: momentumThesis, modelId: 'fixture', gap: null, price: null })));
    await publication.certify(lease);
    const result = (await publication.get(runId))!;
    expect(result.value.main).toEqual(['A','B','C']);
    expect(result.cohorts).toHaveLength(6);
    expect(result.value.entries[0]?.changes).toEqual([]);
    expect((await tracking.get('D'))?.thesisVersionId).toBe(d.thesisVersionId);
    expect((await tracking.get('A'))?.thesisVersionId).toBe(a.thesisVersionId);
    expect((await tracking.get('A'))?.versionId).toBe(result.value.entries[0]?.versionId);
    await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: (await tracking.get('A'))!.revision, key: 'refresh-clean-A' });
    await tracking.command('investor',{ action: 'archive', securityId: 'D', expectedRevision: (await tracking.get('D'))!.revision, key: 'refresh-clean-D' });
    await f.foundation.fail(lease,at,{ permanent: true });
  } finally { await f.foundation.release(lease,at); }
});

it('rejects news acquired after the cutoff, preserves atomic history on failure and renders stale observations explicitly', async () => {
  const { ResearchTools } = await import('../src/research/tools');
  const { RefreshPublication } = await import('../src/refresh/publication');
  const { momentumThesis } = await import('./helpers/tracking');
  const { refreshView } = await import('../src/refresh/view');
  const f = await morning('refresh:evidence','2026-11-11',true);
  let at = Date.parse('2026-11-11T12:00:00Z');
  const refreshes = new Refreshes(f.foundation,() => at);
  const request = await refreshes.command('investor',{ morningId: f.snapshotId, key: 'news' });
  const lease = (await f.foundation.claim(request.runId,'news',at))!;
  const acquiredAt = at+1000;
  const tools = new ResearchTools(f.foundation,lease,{ secUserAgent: 'research contact@example.com' },() => acquiredAt,async () => new Response('The contract was terminated.',{ headers: { 'content-type': 'text/plain' } }));
  const sourceId = await tools.register({ securityId: 'B', url: 'https://www.sec.gov/Archives/edgar/data/2/000000000226000009/event.txt', publishedAt: at-1000, revisionOf: null });
  const evidence = await tools.dispatch('B','refresh:news',{ kind: 'read', sourceId },at+10000);
  if (evidence.kind!=='evidence') throw new Error('fixture missing evidence');
  const decisions = ['A','B','C'].map(securityId => ({ securityId, proposal: momentumThesis, modelId: 'fixture', gap: null,
    price: { price: '24', volume: '100', eventAt: at-1800000, acquiredAt: at, delayMs: 900000 as const, source: 'alpaca_sip' as const, basis: 'raw' as const } }));
  const rejected = { outcome: 'rejected', facts: [{ evidenceId: evidence.evidence.id, quote: 'The contract was terminated.', role: 'contradict' }],
    interpretations: [], unknowns: [], thesis: null, invalidation: [], horizonSessions: 20, attractiveness: 'unattractive', priceCondition: 'none' };
  const publication = new RefreshPublication(refreshes);
  await expect(publication.publish(lease,decisions.map(d => d.securityId==='B' ? { ...d, proposal: rejected } : d))).rejects.toThrow('citation');
  expect(await publication.get(request.runId)).toBeNull();
  at = acquiredAt;
  await f.foundation.db.prepare("CREATE TRIGGER interrupt_refresh BEFORE INSERT ON refresh_cohorts BEGIN SELECT RAISE(ABORT,'interrupted refresh'); END").run();
  await expect(publication.publish(lease,decisions)).rejects.toThrow('interrupted refresh');
  expect(await publication.get(request.runId)).toBeNull();
  await f.foundation.db.prepare('DROP TRIGGER interrupt_refresh').run();
  const published = await publication.publish(lease,decisions.map(d => d.securityId==='B' ? { ...d, proposal: rejected } : d));
  expect(published.value.entries[1]?.changes).toContain('attractiveness');
  expect(published.value.entries[1]?.newEvidence).toContain(evidence.evidence.id);
  const html = await refreshView(f.foundation,request.runId,at);
  expect(html).toContain('Premarket: stale'); expect(html).toContain('delay at least 15 minutes');
  expect(html).toContain('Check Trading 212 live');
  expect(html).toContain('-0.040000000000 fractional change');
  await expect(f.foundation.db.prepare("UPDATE refresh_versions SET value='{}' WHERE run_id=?").bind(request.runId).run()).rejects.toThrow('immutable');
  await f.foundation.fail(lease,at,{ permanent: true }); await f.foundation.release(lease,at);
});

it('keeps the recorded tracked thesis on morning overlap and immediately invalidates it from new issuer evidence', async () => {
  const { ResearchPublisher } = await import('../src/research/publisher');
  const { ResearchTools } = await import('../src/research/tools');
  const { Tracking } = await import('../src/tracking/store');
  const { RefreshPublication } = await import('../src/refresh/publication');
  const { momentumThesis } = await import('./helpers/tracking');
  let at = Date.parse('2026-11-12T06:30:00Z');
  const original = await researchFixture('refresh:recorded','2026-11-12');
  const publisher = new ResearchPublisher(original.foundation,() => at);
  await publisher.begin(original.lease,original.snapshotId,{ cutoff: at+60000, expiresAt: at+86400000 });
  const tools = new ResearchTools(original.foundation,original.lease,{ secUserAgent: 'research contact@example.com' },() => at,async () => new Response('A contract was signed.',{ headers: { 'content-type': 'text/plain' } }));
  const sourceId = await tools.register({ securityId: 'A', url: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000020/event.txt', publishedAt: at-1000, revisionOf: null });
  const result = await tools.dispatch('A','refresh:recorded',{ kind: 'read', sourceId },at+10000);
  if (result.kind!=='evidence') throw new Error('fixture source unavailable');
  const supported = { ...momentumThesis, thesisKind: 'supported', facts: [{ evidenceId: result.evidence.id, quote: 'A contract was signed.', role: 'support' }],
    interpretations: [{ text: 'The contract may sustain attention.', evidenceIds: [result.evidence.id] }],
    thesis: { text: 'Attention may persist while the contract remains in force.', evidenceIds: [result.evidence.id] },
    invalidation: [{ text: 'The contract is terminated.', evidenceIds: [result.evidence.id], predicate: { kind: 'source_text', originId: 'issuer:1', contains: 'The contract was terminated.' } }] };
  const p = await publisher.publish(original.lease,original.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'assessed', proposal: securityId==='A' ? supported : momentumThesis })));
  const tracking = new Tracking(original.foundation,() => at);
  const selected = await tracking.command('investor',{ action: 'select', securityId: 'A', versionId: p.decisions[0]!.versionId!, expectedRevision: (await tracking.get('A'))?.revision ?? 0, key: 'recorded-A' });
  await original.foundation.release(original.lease,at);
  const f = await morning('refresh:overlap','2026-11-13',true);
  at = Date.parse('2026-11-13T12:00:00Z');
  const refreshes = new Refreshes(f.foundation,() => at), request = await refreshes.command('investor',{ morningId: f.snapshotId, key: 'recorded' });
  const plan = (await refreshes.get(request.runId))!.plan;
  expect(plan.entries[0]?.previousId).toBe(selected.versionId);
  expect(plan.entries[0]?.morningVersionId).not.toBe(selected.versionId);
  const lease = (await f.foundation.claim(request.runId,'invalidation',at))!;
  const updatedTools = new ResearchTools(f.foundation,lease,{ secUserAgent: 'research contact@example.com' },() => at,async () => new Response('The contract was terminated.',{ headers: { 'content-type': 'text/plain' } }));
  const newId = await updatedTools.register({ securityId: 'A', url: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000021/event.txt', publishedAt: at-1000, revisionOf: null });
  await updatedTools.dispatch('A','refresh:terminated',{ kind: 'read', sourceId: newId },at+10000);
  const publication = new RefreshPublication(refreshes);
  await publication.publish(lease,['A','B','C'].map(securityId => ({ securityId, proposal: momentumThesis, modelId: 'fixture', gap: null, price: null })));
  const changed = (await tracking.get('A'))!;
  expect(changed.thesisStatus).toBe('invalidated'); expect(changed.invalidatedAt).toBe(at);
  expect(changed.status).toBe('active'); expect(changed.checkpointAt).toBe(selected.checkpointAt);
  const version = (await tracking.version(changed.versionId))!;
  expect(version.outcome).toBe('insufficient_evidence');
  expect(version.thesis).toEqual(p.decisions[0]!.assessment!.thesis);
  expect(version.trackingJudgment?.reasons).toContain('source_text:0');
  expect((await tracking.version(selected.versionId))?.outcome).toBe('accepted');
  await f.foundation.fail(lease,at,{ permanent: true }); await f.foundation.release(lease,at);
  const follow = await researchFixture('refresh:next-daily','2026-11-16');
  at = Date.parse('2026-11-16T06:30:00Z');
  const { TrackingRuntime } = await import('../src/tracking/runtime');
  const dailyPublisher = new ResearchPublisher(follow.foundation,() => at);
  await dailyPublisher.begin(follow.lease,follow.snapshotId,{ cutoff: at+1000, expiresAt: at+86400000 });
  await dailyPublisher.publish(follow.lease,follow.snapshotId,['A','B','C'].map(securityId => ({ securityId, kind: 'unresearched', gap: 'model_unavailable' })));
  const daily = new TrackingRuntime(tracking,new ResearchTools(follow.foundation,follow.lease,{ secUserAgent: '' },() => at),null,[],() => at);
  for (let i=0;i<20 && !await daily.step(follow.lease,follow.snapshotId,at+10000);i++) {}
  expect((await tracking.get('A'))?.thesisStatus).toBe('invalidated');
  expect((await tracking.checks('A'))[0]?.snapshotId).toBe(follow.snapshotId);
  const current = (await tracking.get('A'))!;
  await tracking.command('investor',{ action: 'archive', securityId: 'A', expectedRevision: current.revision, key: 'recorded-cleanup' });
  await follow.foundation.release(follow.lease,at);
});

it('finishes a queued refresh through the fenced coordinator with a visible research-only result when providers are unavailable', async () => {
  const { drainRefresh } = await import('../src/refresh/runtime');
  const { RefreshPublication } = await import('../src/refresh/publication');
  const f = await morning('refresh:coordinator','2026-11-17');
  let at = Date.parse('2026-11-17T12:00:00Z');
  const refreshes = new Refreshes(f.foundation,() => at);
  const request = await refreshes.command('investor',{ morningId: f.snapshotId, key: 'coordinator' });
  for (let i=0;i<5 && (await f.foundation.run(request.runId))?.state!=='completed';i++) {
    await drainRefresh(f.foundation,{},(await f.foundation.run(request.runId))!,() => at,async () => { throw new Error('No live requests'); });
    at += 300000;
  }
  expect((await f.foundation.run(request.runId))?.state).toBe('completed');
  const result = await new RefreshPublication(refreshes).get(request.runId);
  expect(result?.evaluated).toBe(false); expect(result?.cohorts).toEqual([]);
  expect(result?.value.entries.map(e => e.gap)).toEqual(['model_unavailable','model_unavailable','model_unavailable']);
  expect(result?.value.entries.map(e => e.priceStatus)).toEqual(['missing','missing','missing']);
});
