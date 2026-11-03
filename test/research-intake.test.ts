import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { ResearchIntake } from '../src/research/intake';
import type { ResearchModel } from '../src/research/researcher';

it('shares three broad queries and changed filings with a single bounded short-note pass', async () => {
  const { foundation, lease } = await researchFixture('research:intake');
  let at = now;
  const clock = () => at;
  try {
    const publisher = new ResearchPublisher(foundation,clock);
    await publisher.begin(lease,'research:intake',{ cutoff: now+60000, expiresAt: now+86400000 });
    const url = 'https://www.sec.gov/Archives/edgar/data/5/000000000526000001/event.htm';
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com', braveKey: 'fixture-key' },clock,async (request) => {
      at += 250;
      const href = String(request);
      if (href.includes('api.search.brave.com')) return new Response(JSON.stringify({ web: { results: [{ url, description: 'A snippet that must never be stored.' }] } }),{ headers: { 'Content-Type': 'application/json' } });
      if (href.includes('data.sec.gov')) return new Response(JSON.stringify({ filings: { recent: { accessionNumber: ['0000000005-26-000001'], primaryDocument: ['event.htm'], acceptanceDateTime: [new Date(now-1000).toISOString()], form: ['8-K'] } } }),{ headers: { 'Content-Type': 'application/json' } });
      return new Response('A contract was signed.',{ headers: { 'Content-Type': 'text/plain' } });
    });
    let modelCalls = 0;
    const model: ResearchModel = { modelId: 'fixture', async complete(request) {
      modelCalls++;
      const context = JSON.parse(request.context) as { evidence: { id: string; securityId: string }[] };
      return { output: { notes: context.evidence.map(e => ({ securityId: e.securityId, text: 'The contract may attract attention.', eventType: 'contract', contradicted: false,
        citations: [{ evidenceId: e.id, quote: 'A contract was signed.' }] })) }, usage: { input: 300, output: 100 } };
    } };
    const intake = new ResearchIntake(publisher,tools,model,[{ securityId: 'E', issuerId: 'E', cik: '5' }],clock);
    for (let i=0;i<30 && !await intake.step(lease,'research:intake',now+60000);i++) {}
    const result = (await intake.publication('research:intake'))!;
    expect(result.active.map(e => e.securityId)).toEqual(['E']);
    expect(result.active[0]!.independentOrigins).toBe(1);
    expect(modelCalls).toBe(1);
    expect((await tools.ledger.usage('day','broad_search')).reserved).toBe(3);
    expect(JSON.stringify(result)).not.toContain('A snippet that must never be stored.');
  } finally { await foundation.release(lease,at); }
});
