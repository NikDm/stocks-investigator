import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { Foundation } from '../src/persistence';
import { MarketCapture } from '../src/market/capture';
import type { Identity, Observation } from '../src/market/types';

it('retains the complete audit-scale raw/split seed and qualifies it in bounded SQL stages', async () => {
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
    exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities, mappingVersion: 'load' });
  let page: Observation[] = [], number = 0, maxStageMs = 0, maxPageBytes = 0;
  const flush = async () => {
    const stage = clock();
    maxPageBytes = Math.max(maxPageBytes,new TextEncoder().encode(JSON.stringify(page)).length);
    await store.renew(lease,clock());
    await capture.ingest(lease,run.id,{ task: 'seed', page: number++, observations: page, nextToken: null });
    maxStageMs = Math.max(maxStageMs,clock()-stage); page = [];
    if (number % 400 === 0) console.info(JSON.stringify({ benchmark: 'capture-progress', pages: number, elapsedMs: clock()-start }));
  };
  for (const identity of identities) for (const session of calendar.filter(s => s.date <= '2026-11-02')) for (const basis of ['raw','split'] as const) {
    page.push({ source: 'alpaca', securityId: identity.securityId, kind: 'daily', symbol: identity.symbol, asof: identity.asof, feed: 'sip', basis,
      eventAt: Date.parse(`${session.date}T12:00:00Z`), session: session.date, actionVersion: identity.actionVersion, mappingVersion: 'load',
      value: { t: `${session.date}T12:00:00Z`, o: '10', h: '12', l: '9', c: '10', v: '600000' } });
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
  expect(maxPageBytes).toBeLessThan(256*1024);
  expect(maxStageMs).toBeLessThan(45000);
  expect((await capture.snapshot(run.id,5000))?.decisions).toHaveLength(78);
  console.info(JSON.stringify({ benchmark: 'local-market-capture', securities: 5078, observations: 914040, pages: number, qualificationStages: stages,
    elapsedMs: clock()-start, maxStageMs, maxPageBytes }));
  await store.release(lease,clock());
}, 300000);
