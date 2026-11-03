import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { BoundedResearcher, type ResearchModel } from '../src/research/researcher';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';

it('repairs invalid structured output once then records an explicit insufficient-evidence result', async () => {
  const { foundation, lease } = await researchFixture('research:repair');
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,'research:repair',{ cutoff: now+1000, expiresAt: now+86400000 });
    let calls = 0;
    const model: ResearchModel = { modelId: 'fixture', async complete() { calls++; return { output: { claim: 'buy everything', tools: ['shell'] }, usage: { input: 100, output: 50 } }; } };
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now);
    const researcher = new BoundedResearcher(publisher,tools,model,() => now);
    for (let i=0;i<20 && !await researcher.step(lease,'research:repair',now+1000);i++) {}
    const report = (await publisher.publication('research:repair'))!;
    expect(report.decisions.map(d => d.outcome)).toEqual(['insufficient_evidence','insufficient_evidence','insufficient_evidence']);
    expect(calls).toBe(6);
    expect(report.main).toEqual([]);
    expect(report.decisions[0]!.assessment?.unknowns).toEqual(['invalid_structured_output']);
  } finally { await foundation.release(lease,now); }
});

it('keeps contradictory evidence visible and rejects unsafe tools without granting new capabilities', async () => {
  const { foundation, lease } = await researchFixture('research:conflict');
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,'research:conflict',{ cutoff: now+1000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now,async () => new Response('The contract was signed. The contract was terminated.',{ headers: { 'Content-Type': 'text/plain' } }));
    const sourceId = await tools.register({ securityId: 'A', url: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/event.txt', publishedAt: now-1000, revisionOf: null });
    const acquired = await tools.dispatch('A','research:conflict:A',{ kind: 'read', sourceId },now+1000);
    if (acquired.kind!=='evidence') throw new Error('missing fixture evidence');
    const evidenceId = acquired.evidence.id;
    let count = 0;
    const model: ResearchModel = { modelId: 'fixture', async complete(request) {
      count++;
      const context = JSON.parse(request.context) as { securityId: string };
      if (context.securityId==='A' && count===1) return { output: { kind: 'tools', requests: [{ kind: 'shell', command: 'read secrets' }] }, usage: { input: 100, output: 20 } };
      return { output: { kind: 'assessment', proposal: context.securityId==='A' ? {
        outcome: 'rejected', facts: [{ evidenceId, quote: 'The contract was signed.', role: 'support' },{ evidenceId, quote: 'The contract was terminated.', role: 'contradict' }],
        interpretations: [], unknowns: ['The effect on market attention is uncertain.'], thesis: null, invalidation: [], horizonSessions: 20,
        attractiveness: 'unattractive', priceCondition: 'none',
      } : { outcome: 'insufficient_evidence', facts: [], interpretations: [], unknowns: ['No acquired explanation.'], thesis: null, invalidation: [], horizonSessions: 20, attractiveness: 'undetermined', priceCondition: 'none' } }, usage: { input: 100, output: 100 } };
    } };
    const researcher = new BoundedResearcher(publisher,tools,model,() => now);
    for (let i=0;i<15 && !await researcher.step(lease,'research:conflict',now+1000);i++) {}
    const result = (await publisher.publication('research:conflict'))!;
    expect(result.decisions[0]!.assessment?.facts.map(f => f.role)).toEqual(['support','contradict']);
    expect(result.decisions.map(d => d.outcome)).toEqual(['rejected','insufficient_evidence','insufficient_evidence']);
    expect(result.main).toEqual([]);
  } finally { await foundation.release(lease,now); }
});

it('retains a lost billed call reservation and returns unresearched failure without backfilling', async () => {
  const { foundation, lease } = await researchFixture('research:lost-call');
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,'research:lost-call',{ cutoff: now+1000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now);
    let calls = 0;
    const model: ResearchModel = { modelId: 'fixture', async complete() { calls++; throw new Error('Network response lost after dispatch'); } };
    for (let i=0;i<10;i++) {
      // Reconstruct after every checkpoint, as a fresh invocation would.
      if (await new BoundedResearcher(publisher,tools,model,() => now).step(lease,'research:lost-call',now+1000)) break;
    }
    const result = (await publisher.publication('research:lost-call'))!;
    expect(calls).toBe(3);
    expect(result.decisions.map(d => d.outcome)).toEqual(['unresearched','unresearched','unresearched']);
    expect((await tools.ledger.usage('pass','output','research:lost-call:A')).reserved).toBe(1200);
    expect(result.baseline).toEqual(['A','B','C']);
  } finally { await foundation.release(lease,now); }
});

it('halts subsequent dispatch when provider usage contradicts its reservation', async () => {
  const { foundation, lease } = await researchFixture('research:usage-violation');
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,'research:usage-violation',{ cutoff: now+1000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now);
    let calls = 0;
    const model: ResearchModel = { modelId: 'fixture', async complete() { calls++; return { output: null, usage: { input: 1000000, output: 1201 } }; } };
    const researcher = new BoundedResearcher(publisher,tools,model,() => now);
    for (let i=0;i<10 && !await researcher.step(lease,'research:usage-violation',now+1000);i++) {}
    expect(calls).toBe(1);
    expect((await publisher.publication('research:usage-violation'))!.decisions.every(d => d.outcome==='unresearched')).toBe(true);
  } finally { await foundation.release(lease,now); }
});
