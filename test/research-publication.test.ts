import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';

it('atomically publishes exact-queue decisions without backfill and recovers a duplicate publication', async () => {
  const { foundation, lease, screener } = await researchFixture('research:publication');
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,'research:publication',{ cutoff: now+1000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now,async () => new Response('The contract was terminated.',{ headers: { 'Content-Type': 'text/plain' } }));
    const source = await tools.register({ securityId: 'B', url: 'https://www.sec.gov/Archives/edgar/data/2/000000000226000001/event.txt', publishedAt: now-1000, revisionOf: null });
    const result = await tools.dispatch('B','publication:B',{ kind: 'read', sourceId: source },now+1000);
    if (result.kind!=='evidence') throw new Error('fixture evidence unavailable');
    const proposal = { outcome: 'rejected', facts: [{ evidenceId: result.evidence.id, quote: 'The contract was terminated.', role: 'contradict' }],
      interpretations: [], unknowns: [], thesis: null, invalidation: [], horizonSessions: 20, attractiveness: 'unattractive', priceCondition: 'none' };
    const decisions = [{ securityId: 'A', kind: 'unresearched', gap: 'model_unavailable' },{ securityId: 'B', kind: 'assessed', proposal },{ securityId: 'C', kind: 'unresearched', gap: 'budget_exhausted' }];
    await expect(publisher.publish(lease,'research:publication',[...decisions,{ securityId: 'D', kind: 'unresearched', gap: 'backfill' }])).rejects.toThrow();
    const first = await publisher.publish(lease,'research:publication',decisions);
    expect(first.main).toEqual([]);
    expect(first.decisions.map(d => [d.securityId,d.outcome])).toEqual([['A','unresearched'],['B','rejected'],['C','unresearched']]);
    expect(await publisher.publish(lease,'research:publication',decisions)).toEqual(first);
    const previousId = first.decisions[1]!.versionId!;
    const correction = await publisher.appendVersion(lease,{ snapshotId: 'research:publication', securityId: 'B', previousId, key: 'correction',
      cutoff: now, expiresAt: now+86400000, proposal: { outcome: 'insufficient_evidence', facts: [], interpretations: [], unknowns: ['The event impact remains uncertain.'],
        thesis: null, invalidation: [], horizonSessions: 20, attractiveness: 'undetermined', priceCondition: 'none' } });
    expect(correction.assessment.outcome).toBe('insufficient_evidence');
    expect((await publisher.version(previousId))!.outcome).toBe('rejected');
    expect(await publisher.publication('research:publication')).toEqual(first);
    await expect(foundation.db.prepare("UPDATE research_assessment_versions SET value='{}' WHERE id=?").bind(previousId).run()).rejects.toThrow('immutable');
    expect((await screener.result('research:publication'))!.baseline).toEqual(['A','B','C']);
    await expect(publisher.publish(lease,'research:publication',decisions.map(d => ({ ...d, gap: 'changed' })))).rejects.toThrow();
  } finally { await foundation.release(lease,now); }
});


it('orders supported theses before unexplained momentum while preserving the frozen baseline', async () => {
  const { foundation, lease } = await researchFixture('research:ai-order');
  let at = now;
  try {
    const publisher = new ResearchPublisher(foundation,() => at);
    await publisher.begin(lease,'research:ai-order',{ cutoff: now+3000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now+2000,async () => new Response('A contract was signed.',{ headers: { 'Content-Type': 'text/plain' } }));
    // A publisher clock before acquisition cannot use future evidence.
    const source = await tools.register({ securityId: 'B', url: 'https://www.sec.gov/Archives/edgar/data/2/000000000226000002/event.txt', publishedAt: now-1000, revisionOf: null });
    const result = await tools.dispatch('B','ai-order:B',{ kind: 'read', sourceId: source },now+10000);
    if (result.kind!=='evidence') throw new Error('missing fixture evidence');
    const supported = { outcome: 'accepted', thesisKind: 'supported', facts: [{ evidenceId: result.evidence.id, quote: 'A contract was signed.', role: 'support' }],
      interpretations: [{ text: 'The contract may support continued attention.', evidenceIds: [result.evidence.id] }], unknowns: [],
      thesis: { text: 'Attention may persist while the contract remains in force.', evidenceIds: [result.evidence.id] },
      invalidation: [{ text: 'The contract is terminated.', evidenceIds: [result.evidence.id] }], horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'none' };
    const unexplained = { outcome: 'accepted', thesisKind: 'unexplained', facts: [], interpretations: [], unknowns: ['No verified explanation.'],
      thesis: { text: 'Momentum may persist while above the moving average.', evidenceIds: [], metricKeys: ['sma20'] },
      invalidation: [{ text: 'The price falls below the moving average.', evidenceIds: [], metricKeys: ['sma20'] }], horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'sma20' };
    const decisions = [{ securityId: 'A', kind: 'assessed', proposal: unexplained },{ securityId: 'B', kind: 'assessed', proposal: supported },{ securityId: 'C', kind: 'unresearched', gap: 'budget_exhausted' }];
    await expect(publisher.publish(lease,'research:ai-order',decisions)).rejects.toThrow('citation');
    expect(await publisher.publication('research:ai-order')).toBeNull();
    at = now+2000;
    const report = await publisher.publish(lease,'research:ai-order',decisions);
    expect(report.main).toEqual(['B','A']);
    expect(report.baseline).toEqual(['A','B','C']);
  } finally { await foundation.release(lease,now+2000); }
});

it('refuses to publish if the server clock is before the frozen market acquisition cutoff', async () => {
  const { foundation, lease } = await researchFixture('research:clock-regression');
  let at = now;
  try {
    const publisher = new ResearchPublisher(foundation,() => at);
    await publisher.begin(lease,'research:clock-regression',{ cutoff: now+1000, expiresAt: now+86400000 });
    at--;
    await expect(publisher.publish(lease,'research:clock-regression',['A','B','C'].map(securityId => ({ securityId, kind: 'unresearched', gap: 'model_unavailable' })))).rejects.toThrow('frozen market cutoff');
    expect(await publisher.publication('research:clock-regression')).toBeNull();
  } finally { await foundation.release(lease,now); }
});
