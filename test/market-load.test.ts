import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Screener, SCREENING_STAGE_CPU_RESERVATION_MS } from '../src/screening/persistence';
import { ResearchPublisher } from '../src/research/publisher';
import { ResearchTools } from '../src/research/tools';
import { ResearchIntake } from '../src/research/intake';
import { BoundedResearcher, type ResearchModel } from '../src/research/researcher';
import { RESEARCH_STAGE_CPU_RESERVATION_MS } from '../src/research/runtime';
import { Foundation } from '../src/persistence';
import { MarketCapture } from '../src/market/capture';
import { planEvaluation } from '../src/market/evaluation';
import type { Identity, Observation } from '../src/market/types';

it('retains the complete audit-scale raw/split seed and qualifies it in bounded SQL stages', async context => {
  const store = new Foundation(env.DB), clock = Date.now, start = clock();
  const run = await store.enqueue('market:load',{},clock()), lease = (await store.claim(run.id,'load',clock()))!;
  const capture = new MarketCapture(store,clock);
  const calendar = [];
  for (let at = Date.parse('2026-06-26T00:00:00Z'); at <= Date.parse('2026-12-18T00:00:00Z'); at += 86400000) {
    const d = new Date(at), date = d.toISOString().slice(0,10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !['2026-07-03','2026-09-07','2026-11-26'].includes(date)) calendar.push({ date, open: '09:30', close: date === '2026-11-27' ? '13:00' : '16:00' });
  }
  const identities: Identity[] = Array.from({ length: 5078 },(_,n) => ({ brokerTicker: `B${n}`, isin: `ISIN${n}`, securityId: `S${n}`, issuerId: `I${n}`, symbol: `S${n}`,
    asof: '2026-11-03', primaryVenue: 'NYSE', securityType: 'Common Stock', compositeFIGI: `S${n}`, shareClassFIGI: `C${n}`, listing: 'verified', comparability: 'verified', verifiedActionIds: [],
    evidence: ['https://example.com/listing'], actionVersion: 'actions-load' }));
  await capture.begin(lease,{ id: run.id, reportDate: '2026-11-03', calendar, calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: identities.map(i => ({ ticker: i.brokerTicker, isin: i.isin, type: 'STOCK', currencyCode: 'USD', workingScheduleId: 1 })),
    exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities, mappingVersion: 'load', splitVolumeVerified: true });
  let page: Observation[] = [], number = 0, maxStageMs = 0, maxPageBytes = 0;
  const flush = async () => {
    const stage = clock();
    maxPageBytes = Math.max(maxPageBytes,new TextEncoder().encode(JSON.stringify(page)).length);
    await store.renew(lease,clock());
    await capture.ingest(lease,run.id,{ task: 'seed', page: number++, observations: page, nextToken: null });
    maxStageMs = Math.max(maxStageMs,clock()-stage); page = [];
    if (number % 400 === 0) console.info(JSON.stringify({ benchmark: 'capture-progress', pages: number, elapsedMs: clock()-start }));
  };
  const history = calendar.filter(s => s.date <= '2026-11-02');
  for (const identity of identities) for (const [index,session] of history.entries()) for (const basis of ['raw','split'] as const) {
    const c = Number(identity.securityId.slice(1)) < 2000 ? String((1000 + index * 5 + Math.max(0,index - 69) * 10)/100) : '10';
    page.push({ source: 'alpaca', securityId: identity.securityId, kind: 'daily', symbol: identity.symbol, asof: identity.asof, feed: 'sip', basis,
      eventAt: Date.parse(`${session.date}T12:00:00Z`), session: session.date, actionVersion: identity.actionVersion, mappingVersion: 'load',
      value: { t: `${session.date}T12:00:00Z`, o: c, h: c, l: c, c, v: index >= 85 ? '780000' : '600000' } });
    if (page.length === 500) await flush();
  }
  if (page.length) await flush();
  let stages = 0;
  while (true) {
    const stage = clock(); await store.renew(lease,clock());
    const done = await capture.finalize(lease,run.id); stages++; maxStageMs = Math.max(maxStageMs,clock()-stage);
    if (done) break;
  }
  expect(await capture.coverage(run.id)).toEqual([{ reason: 'eligible', total: 5078 }]);
  expect((await capture.stats()).observations).toBe(914040);
  const screener = new Screener(capture,clock), screeningStarted = clock();
  const screeningDurations: number[] = [];
  let screeningStages = 0, maxScreeningStageMs = 0, rankingMs = 0;
  while (true) {
    await store.renew(lease,clock());
    const stageStarted = clock(), done = await screener.step(lease,run.id,'screen-eval-v1',50);
    const elapsed = clock()-stageStarted;
    screeningStages++; maxScreeningStageMs = Math.max(maxScreeningStageMs,elapsed);
    screeningDurations.push(elapsed);
    expect(elapsed).toBeLessThan(SCREENING_STAGE_CPU_RESERVATION_MS);
    if (done) { rankingMs = elapsed; break; }
  }
  const combinedPartitionsMs = screeningDurations.sort((a,b) => b-a).slice(0,10).reduce((sum,elapsed) => sum+elapsed,0);
  expect(combinedPartitionsMs).toBeLessThan(15000);
  const screened = (await screener.result(run.id,0,1))!;
  expect(screened.universeCount).toBe(5078);
  expect(screened.baseline).toEqual(['S0','S1','S10']);
  expect(await screener.step(lease,run.id,'screen-eval-v1',7)).toBe(true);
  expect((await screener.result(run.id,0,1))!.inputHash).toBe(screened.inputHash);
  await context.annotate(JSON.stringify({ benchmark: 'local-screening', securities: 5078, screeningStages,
    screeningMs: clock()-screeningStarted, maxScreeningStageMs, rankingMs, combinedPartitionsMs }),'benchmark');
  // Exercise all 12 permitted main model turns and 18 main tool calls against
  // the full saved universe. External API fixtures have no real network latency.
  let simulatedWait = 0;
  const researchClock = () => clock()+simulatedWait;
  const publisher = new ResearchPublisher(store,researchClock);
  const researchStart = clock();
  await publisher.begin(lease,run.id,{ cutoff: researchClock()+3600000, expiresAt: researchClock()+86400000 });
  const plan = (await publisher.plan(run.id))!;
  const tools = new ResearchTools(store,lease,{ secUserAgent: 'Fixture contact@example.com', braveKey: 'fixture' },researchClock,async request => {
    simulatedWait += 250;
    const url = String(request);
    if (url.includes('api.search.brave.com')) return new Response('{"web":{"results":[]}}',{ headers: { 'Content-Type': 'application/json' } });
    if (url.includes('data.sec.gov')) {
      const cik = /CIK(\d+)\.json/.exec(url)![1]!;
      return new Response(JSON.stringify({ filings: { recent: { accessionNumber: [`${cik}-26-000001`], primaryDocument: ['event.htm'],
        acceptanceDateTime: [new Date(researchClock()-1000).toISOString()], form: ['8-K'] } } }),{ headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('A contract was signed.',{ headers: { 'Content-Type': 'text/plain' } });
  });
  const turns = new Map<string,number>();
  const fixtureModel: ResearchModel = { modelId: 'fixture', async complete(request) {
    if (!request.context.includes('"securityId"') || request.system.startsWith('Public source')) return { output: { notes: [] }, usage: { input: 500, output: 50 } };
    const context = JSON.parse(request.context) as { securityId: string; sources: { id: string }[] };
    const turn = (turns.get(context.securityId) ?? 0)+1; turns.set(context.securityId,turn);
    if (turn<4) return { output: { kind: 'tools', requests: [{ kind: 'read', sourceId: context.sources[0]!.id },{ kind: 'read', sourceId: context.sources[0]!.id }] }, usage: { input: 500, output: 80 } };
    return { output: { kind: 'assessment', proposal: { outcome: 'accepted', thesisKind: 'unexplained', facts: [], interpretations: [], unknowns: ['The momentum explanation remains unverified.'],
      thesis: { text: 'Momentum may continue while above the moving average.', evidenceIds: [], metricKeys: ['sma20'] },
      invalidation: [{ text: 'The price falls below the moving average.', evidenceIds: [], metricKeys: ['sma20'] }],
      horizonSessions: 20, attractiveness: 'conditional', priceCondition: 'sma20' } }, usage: { input: 500, output: 500 } };
  } };
  const intake = new ResearchIntake(publisher,tools,fixtureModel,plan.queue.map((q,i) => ({ securityId: q.securityId, issuerId: q.issuerId, cik: String(i+1) })),researchClock);
  const researcher = new BoundedResearcher(publisher,tools,fixtureModel,researchClock);
  const researchDurations: number[] = [];
  for (let i=0;i<60;i++) {
    await store.renew(lease,researchClock());
    const stage = clock();
    const done = await intake.step(lease,run.id,researchClock()+35000) && await researcher.step(lease,run.id,researchClock()+35000);
    const duration = clock()-stage; researchDurations.push(duration);
    expect(duration).toBeLessThan(RESEARCH_STAGE_CPU_RESERVATION_MS);
    if (done) break;
  }
  expect([...turns.values()]).toEqual([4,4,4]);
  expect((await publisher.publication(run.id))!.main).toEqual(plan.queue.map(q => q.securityId));
  expect((await tools.ledger.usage('run','turn')).reserved).toBe(13);
  expect((await tools.ledger.usage('day','fetch')).reserved).toBe(24);
  const combinedResearchStagesMs = researchDurations.sort((a,b) => b-a).slice(0,10).reduce((sum,n) => sum+n,0);
  expect(combinedResearchStagesMs).toBeLessThan(15000);
  await context.annotate(JSON.stringify({ benchmark: 'local-research', securities: 5078, stages: researchDurations.length,
    researchMs: clock()-researchStart, maxStageMs: researchDurations[0], combinedResearchStagesMs, modelTurns: 13, sourceFetches: 24 }),'benchmark');
  const planningStarted = clock();
  await store.renew(lease,clock());
  await planEvaluation(capture,lease,run.id,'2026-11-03');
  const planningMs = clock()-planningStarted;
  expect((await capture.tasks(run.id)).filter(t => t.request.kind === 'auctions')).toHaveLength(51);
  expect(planningMs).toBeLessThan(45000);
  expect(maxPageBytes).toBeLessThan(256*1024);
  expect(maxStageMs).toBeLessThan(45000);
  expect((await capture.snapshot(run.id,5000))?.decisions).toHaveLength(78);
  await context.annotate(JSON.stringify({ benchmark: 'local-market-capture', securities: 5078, observations: 914040, pages: number, qualificationStages: stages,
    elapsedMs: clock()-start, maxStageMs, maxPageBytes, planningMs }),'benchmark');
  await store.release(lease,clock());
}, 300000);
