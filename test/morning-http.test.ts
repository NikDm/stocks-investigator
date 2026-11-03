import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';
import { MorningReports } from '../src/morning/publication';
import { planEvaluation } from '../src/market/evaluation';
import { authenticated } from './auth';
import { createApp } from '../src/http';

it('offers a private dated morning review with explicit gaps, disabled tracking and CSRF-protected optional feedback', async () => {
  const id = 'morning:http';
  const { foundation, lease, capture } = await researchFixture(id);
  try {
    const runtime = await ResearchRuntime.create(foundation,lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(lease,id,now+1000);i++) {}
    await planEvaluation(capture,lease,id,'2026-11-02');
    const reports = new MorningReports(foundation,() => now);
    await reports.publish(lease,id); await reports.certify(lease,id);
    const { request } = await authenticated(() => now);
    const dashboard = await (await request('/')).text();
    expect(dashboard).toContain('Current trading day');
    expect(dashboard).toContain('2026-11-03');
    expect(dashboard).toContain('morning%3Ahttp');
    const html = await (await request('/morning/morning%3Ahttp')).text();
    expect(html).toContain('No main candidates');
    expect(html).toContain('model_unavailable');
    expect(html).toContain('Tracking becomes available in issue 09');
    expect(html).toContain('0 responses / 1 eligible reports');
    const csrf = await (await request('/api/csrf')).json() as { token: string };
    const body = JSON.stringify({ id: 'review-http', response: 'responded', minutes: 12, usefulness: 'useful', understanding: true, effort: true, decision: false, note: '<script>hello</script>' });
    const headers = { 'content-type': 'application/json', origin: 'https://research.example', 'x-csrf-token': csrf.token };
    expect((await request('/api/morning/morning%3Ahttp/feedback',{ method: 'POST', body, headers: { ...headers,'x-csrf-token': '' } })).status).toBe(403);
    expect((await request('/api/morning/morning%3Ahttp/feedback',{ method: 'POST', body, headers })).status).toBe(201);
    expect((await request('/api/morning/morning%3Ahttp/feedback',{ method: 'POST', body, headers })).status).toBe(201);
    const reviewed = await (await request('/morning/morning%3Ahttp')).text();
    expect(reviewed).toContain('1 responses / 1 eligible reports');
    expect(reviewed).toContain('Median review: 12 minutes');
    expect(reviewed).toContain('&lt;script&gt;hello&lt;/script&gt;');
    expect((await request('/api/morning/morning%3Ahttp/feedback',{ method: 'POST', headers, body: JSON.stringify({ id: 'skip-http', response: 'no_response' }) })).status).toBe(201);
    const skipped = await (await request('/morning/morning%3Ahttp')).text();
    expect(skipped).toContain('0 responses / 1 eligible reports');
    expect(skipped).toContain('Explicit no-response: 1');
    const form = new URLSearchParams({ csrf: csrf.token, id: 'form-http', response: 'responded', minutes: '14', usefulness: 'mixed', effort: 'false' });
    const saved = await request('/morning/morning%3Ahttp/feedback',{ method: 'POST', headers: { origin: headers.origin, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    expect(saved.status).toBe(303);
    expect((await request('/api/morning/morning%3Ahttp/feedback',{ method: 'POST', headers, body: JSON.stringify({ id: 'invalid-http', response: 'responded', minutes: -1 }) })).status).toBe(400);
    const stale = await authenticated(() => now+86400000);
    expect(await (await stale.request('/')).text()).toContain('Retained previous report');
    for (const path of ['/morning/morning%3Ahttp','/api/morning/morning%3Ahttp/feedback']) {
      expect((await createApp().request(`https://research.example${path}`,{},{})).status).toBe(401);
    }
  } finally { await foundation.release(lease,now); }
});

it('takes a representative screened candidate through cited assessment publication and reviewer navigation, with expired facts still dated', async () => {
  const { ResearchPublisher } = await import('../src/research/publisher');
  const { ResearchTools } = await import('../src/research/tools');
  const { BoundedResearcher } = await import('../src/research/researcher');
  const { ResearchIntake } = await import('../src/research/intake');
  const id = 'morning:cited', date = '2026-11-04', now = Date.parse(`${date}T06:30:00Z`);
  const { foundation, lease, capture, screener } = await researchFixture(id,date);
  try {
    const publisher = new ResearchPublisher(foundation,() => now);
    await publisher.begin(lease,id,{ cutoff: now+60000, expiresAt: now+86400000 });
    const tools = new ResearchTools(foundation,lease,{ secUserAgent: 'research contact@example.com' },() => now,
      async () => new Response('A contract was signed.',{ headers: { 'Content-Type': 'text/plain' } }));
    const sourceId = await tools.register({ securityId: 'A', url: 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/event.txt', publishedAt: now-1000, revisionOf: null });
    const result = await tools.dispatch('A','cited:A',{ kind: 'read', sourceId },now+1000);
    if (result.kind!=='evidence') throw new Error('missing fixture evidence');
    const evidenceId = result.evidence.id;
    const intake = new ResearchIntake(publisher,tools,null,[],() => now);
    for (let i=0;i<10 && !await intake.step(lease,id,now+1000);i++) {}
    const researcher = new BoundedResearcher(publisher,tools,{ modelId: 'representative-fixture', async complete(request) {
      const { securityId } = JSON.parse(request.context) as { securityId: string };
      const proposal = securityId==='A' ? { outcome: 'accepted', facts: [{ evidenceId, quote: 'A contract was signed.', role: 'support' }],
        interpretations: [{ text: 'The contract may support attention.', evidenceIds: [evidenceId] }], unknowns: ['Continuation remains uncertain.'],
        thesis: { text: 'Attention may persist while the contract remains in force.', evidenceIds: [evidenceId] },
        invalidation: [{ text: 'Contract termination would undermine the thesis.', evidenceIds: [evidenceId] }], horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'none' }
        : { outcome: 'insufficient_evidence', facts: [], interpretations: [], unknowns: ['No verified explanation.'], thesis: null, invalidation: [], horizonSessions: 20, attractiveness: 'undetermined', priceCondition: 'none' };
      return { output: { kind: 'assessment', proposal }, usage: { input: 100, output: 100 } };
    } },() => now);
    for (let i=0;i<15 && !await researcher.step(lease,id,now+1000);i++) {}
    expect((await publisher.publication(id))?.main).toEqual(['A']);
    expect((await screener.result(id))?.baseline).toEqual(['A','B','C']);
    await planEvaluation(capture,lease,id,'2026-11-03');
    const reports = new MorningReports(foundation,() => now);
    await reports.publish(lease,id); await reports.certify(lease,id);
    const { request } = await authenticated(() => now+2*86400000);
    const html = await (await request('/morning/morning%3Acited')).text();
    expect(html).toContain('A · new');
    expect(html).toContain('EXPIRED / stale assessment');
    expect(html).toContain('A contract was signed.');
    expect(html).toContain('https://www.sec.gov/Archives/edgar/data/1/000000000126000001/event.txt');
    expect(html).toContain('Facts'); expect(html).toContain('Interpretations'); expect(html).toContain('Unknowns');
    const versionId = (await publisher.publication(id))!.decisions[0]!.versionId!;
    expect(await (await request(`/assessments/${versionId}`)).text()).toContain('A contract was signed.');
  } finally { await foundation.release(lease,now); }
});
