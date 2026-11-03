import { env } from 'cloudflare:test';
import { afterEach, expect, it } from 'vitest';
import { Foundation } from '../src/persistence';
import type { Identity } from '../src/market/types';
import { MarketCapture } from '../src/market/capture';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const now = Date.parse('2026-11-03T06:00:00Z');
const calendar = [
  { date: '2026-10-30', open: '09:30', close: '16:00' },
  { date: '2026-11-02', open: '09:30', close: '16:00' },
  { date: '2026-11-03', open: '09:30', close: '16:00' },
  { date: '2026-11-04', open: '09:30', close: '16:00' },
];
const instrument = { ticker: 'ELF_EQ_US', isin: 'US26856L1035', type: 'STOCK', currencyCode: 'USD', workingScheduleId: 1 };
const identity: Identity = { brokerTicker: instrument.ticker, isin: instrument.isin, securityId: 'figi-elf', issuerId: 'issuer-elf',
  symbol: 'ELF', asof: '2026-11-03', primaryVenue: 'NYSE', securityType: 'Common Stock',
  compositeFIGI: 'figi-elf', shareClassFIGI: 'class-elf', listing: 'verified', comparability: 'verified', verifiedActionIds: [],
  evidence: ['https://example.com/dated-listing'], actionVersion: 'actions-1' };

it('freezes every broker decision with calendar times and never rewrites a saved universe on rerun', async () => {
  const foundation = new Foundation(env.DB);
  const run = await foundation.enqueue('market:first', {}, now);
  const lease = (await foundation.claim(run.id, 'capture', now))!;
  cleanups.push(() => foundation.release(lease, now));
  const capture = new MarketCapture(foundation, () => now);
  await capture.begin(lease, {
    id: 'snapshot-first', reportDate: '2026-11-03', calendar, calendarFrom: '2026-10-30', calendarThrough: '2026-11-04',
    instruments: [instrument, { ...instrument, ticker: 'FUND', isin: 'fund' }],
    exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }],
    identities: [identity, { ...identity, brokerTicker: 'FUND', isin: 'fund', securityId: 'fund', symbol: 'FUND', securityType: 'Closed-End Fund' }],
    mappingVersion: 'mapping-1',
  });
  const saved = await capture.snapshot('snapshot-first');
  expect(saved?.expectedSession).toBe('2026-11-02');
  expect(saved?.deadline).toBe(Date.parse('2026-11-03T07:00:00Z'));
  expect(saved?.decisions.map(d => [d.ticker, d.reason])).toEqual([
    ['ELF_EQ_US', 'awaiting_history'], ['FUND', 'unsupported_type'],
  ]);
  await expect(capture.begin(lease, {
    id: 'snapshot-first', reportDate: '2026-11-03', calendar, calendarFrom: '2026-10-30', calendarThrough: '2026-11-04',
    instruments: [], exchanges: [], identities: [], mappingVersion: 'mapping-2',
  })).rejects.toThrow('snapshot conflict');
  expect((await capture.snapshot('snapshot-first'))?.decisions).toEqual(saved?.decisions);
});

// The audited 90-session interval, excluding Independence Day and Labor Day.
function seedCalendar() {
  const dates: typeof calendar = [];
  for (let t = Date.parse('2026-06-26T00:00:00Z'); t <= Date.parse('2026-12-18T00:00:00Z'); t += 86400000) {
    const d = new Date(t), date = d.toISOString().slice(0,10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !['2026-07-03','2026-09-07','2026-11-26'].includes(date)) dates.push({ date, open: '09:30', close: '16:00' });
  }
  return dates;
}
async function started(key: string) {
  const foundation = new Foundation(env.DB);
  const run = await foundation.enqueue(key, {}, now);
  const lease = (await foundation.claim(run.id, key, now))!;
  cleanups.push(() => foundation.release(lease, now));
  const capture = new MarketCapture(foundation, () => now);
  await capture.begin(lease, { id: key, reportDate: '2026-11-03', calendar: seedCalendar(), calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: [instrument], exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities: [identity], mappingVersion: 'mapping-1' });
  return { capture, lease };
}
function history() {
  return seedCalendar().filter(s => s.date <= '2026-11-02').flatMap(s => (['raw','split'] as const).map(basis => ({
    source: 'alpaca' as const, securityId: identity.securityId, kind: 'daily' as const, symbol: 'ELF', asof: identity.asof, feed: 'sip' as const, basis,
    eventAt: Date.parse(`${s.date}T12:00:00Z`), session: s.date, actionVersion: 'actions-1', mappingVersion: 'mapping-1',
    value: { t: `${s.date}T12:00:00Z`, o: '10', h: '12', l: '9', c: '10', v: '600000' },
  })));
}
it('deduplicates normalized history and freezes the exact 61-session qualification inputs', async () => {
  const { capture, lease } = await started('history');
  const page = { task: 'seed', page: 0, observations: history(), nextToken: null };
  await capture.ingest(lease, 'history', page);
  await capture.ingest(lease, 'history', page);
  expect((await capture.observations(identity.securityId)).length).toBe(180);
  await capture.finalize(lease, 'history');
  const snapshot = (await capture.snapshot('history'))!;
  expect(snapshot.status).toBe('complete');
  expect(snapshot.decisions[0]?.reason).toBe('eligible');
  expect(snapshot.decisions[0]?.inputIds).toHaveLength(122);
  await expect(capture.ingest(lease, 'history', { ...page, page: 1, observations: history().slice(0,1) })).rejects.toThrow('frozen');
});

it('exposes a missing expected session without borrowing observations from another capture', async () => {
  const { capture, lease } = await started('partial');
  await capture.ingest(lease, 'partial', { task: 'seed', page: 0, observations: history().filter(o => o.session !== '2026-11-02'), nextToken: null });
  await capture.finalize(lease, 'partial');
  expect((await capture.snapshot('partial'))?.status).toBe('unavailable');
  expect((await capture.snapshot('partial'))?.decisions[0]?.reason).toBe('expected_session_missing');
});

it('keeps official primary-venue Q references, conflicting prices and duplicate provenance explicit', async () => {
  const { capture, lease } = await started('auctions');
  const opening = (venue: string, condition: string, price: string, t: string) => ({
    securityId: identity.securityId, kind: 'opening', symbol: 'ELF', asof: identity.asof, feed: 'sip', basis: 'raw',
    eventAt: Date.parse(t), session: '2026-11-02', actionVersion: 'actions-1', mappingVersion: 'mapping-1',
    value: { x: venue, c: condition, p: price, t },
  });
  await capture.ingest(lease, 'auctions', { task: 'auction', page: 0, observations: [
    opening('P','Q','10','2026-11-02T14:30:00Z'), opening('N','O','11','2026-11-02T14:30:01Z'),
    opening('N','Q','12','2026-11-02T14:30:02Z'), opening('N','Q','12','2026-11-02T14:30:02Z'),
    opening('N','Q','99','2026-11-02T15:01:00Z'),
  ], nextToken: null });
  const reference = await capture.reference('auctions', identity.securityId, '2026-11-02');
  expect(reference.status).toBe('available');
  expect(reference.price).toBe('12');
  expect(reference.qualifyingReceipts).toBe(2);
  await capture.ingest(lease, 'auctions', { task: 'auction', page: 1, observations: [opening('N','Q','13','2026-11-02T14:31:00Z')], nextToken: null });
  expect((await capture.reference('auctions', identity.securityId, '2026-11-02')).status).toBe('conflict');
});

it('resumes a failed pagination request without duplicating the committed page and honors Retry-After', async () => {
  const { capture, lease } = await started('pagination');
  await capture.plan(lease, 'pagination', [{ id: 'raw-seed', kind: 'bars', basis: 'raw', start: '2026-06-26', end: '2026-11-02', securities: [identity] }]);
  let at = now, calls = 0;
  const { MarketWorker } = await import('../src/market/worker');
  const worker = new MarketWorker(capture, {
    page: async request => {
      calls++;
      if (calls === 1) return { observations: history().filter(o => o.basis === 'raw').slice(0,50), nextToken: 'page-two' };
      if (calls === 2) throw new (await import('../src/market/provider')).ProviderFailure('rate_limited', at + 60000);
      expect(request.token).toBe('page-two');
      return { observations: history().filter(o => o.basis === 'raw').slice(50), nextToken: null };
    },
  }, () => at);
  await worker.tick(lease, 'pagination', 1);
  await worker.tick(lease, 'pagination', 1);
  expect((await capture.tasks('pagination'))[0]).toMatchObject({ page: 1, state: 'pending', next_at: now + 60000 });
  await worker.tick(lease, 'pagination', 1);
  expect(calls).toBe(2);
  at += 60000;
  await worker.tick(lease, 'pagination', 1);
  expect((await capture.tasks('pagination'))[0]?.state).toBe('complete');
  expect((await capture.observations(identity.securityId)).filter(o => o.basis === 'raw' && o.kind === 'daily')).toHaveLength(90);
});

it('captures explicit SIP/as-of/split pages from read-only provider HTTP with exact decimal values', async () => {
  const { capture, lease } = await started('http-provider');
  const { AlpacaSource, MarketHttp } = await import('../src/market/provider');
  const foundation = capture.foundation;
  await foundation.setBudget('2026-11','market_requests',1000);
  await foundation.setBudget('2026-11-03','market_requests',600);
  const urls: string[] = [];
  const http = new MarketHttp(foundation, lease, { alpacaKey: 'test-key', alpacaSecret: 'test-secret' }, () => now, async (url, init) => {
    urls.push(String(url));
    expect(init?.redirect).toBe('error');
    return new Response('{"bars":{"ELF":[{"t":"2026-11-02T05:00:00Z","o":10.123456789012345678,"h":12,"l":9,"c":10,"v":600000}]},"next_page_token":"next"}', { headers: { 'content-type': 'application/json' } });
  });
  const source = new AlpacaSource(http, 'mapping-1');
  const result = await source.page({ id: 'split', kind: 'bars', basis: 'split', start: '2026-06-26', end: '2026-11-02', securities: [identity], token: null, notBefore: 0 }, new AbortController().signal);
  expect(new URL(urls[0]!).searchParams.get('feed')).toBe('sip');
  expect(new URL(urls[0]!).searchParams.get('asof')).toBe('2026-11-03');
  expect(new URL(urls[0]!).searchParams.get('adjustment')).toBe('split');
  expect(result.observations[0]?.value['o']).toBe('10.123456789012345678');
  expect(result.nextToken).toBe('next');
  expect((await foundation.usage('2026-11-03','market_requests')).charged).toBe(1);
});

it('refreshes complete broker catalogues and quarantines ambiguous mappings without using ticker suffixes', async () => {
  const { capture, lease } = await started('catalogues');
  const { MarketBootstrap } = await import('../src/market/bootstrap');
  const bootstrap = new MarketBootstrap(capture, {
    json: async endpoint => {
      if (endpoint === 'instruments') return [instrument, { ...instrument, ticker: 'OTC_US_EQ', workingScheduleId: 2 }];
      if (endpoint === 'exchanges') return [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }, { name: 'OTC Markets', workingSchedules: [{ id: 2 }] }];
      if (endpoint === 'assets') return [{ id: 'asset', symbol: 'ELF', name: 'e.l.f.', exchange: 'NYSE', status: 'active', class: 'us_equity' }];
      if (endpoint === 'calendar') return seedCalendar();
      return [{ data: [{ compositeFIGI: 'a', shareClassFIGI: 'a', ticker: 'ELF', securityType: 'Common Stock' }, { compositeFIGI: 'b', shareClassFIGI: 'b', ticker: 'OTHER', securityType: 'Common Stock' }] }];
    },
  }, () => now);
  await bootstrap.step(lease, { reportDate: '2026-11-03', calendarFrom: '2026-06-26', calendarThrough: '2027-01-15', mappingVersion: 'live-mapping' });
  const result = await bootstrap.result(lease.runId);
  expect(result?.instruments.map(i => i.ticker)).toEqual(['ELF_EQ_US','OTC_US_EQ']);
  expect(result?.identities).toEqual([]);
  expect(result?.mappingGaps).toEqual([{ ticker: 'ELF_EQ_US', reason: 'ambiguous_figi' }]);
  expect(result?.sourceReceipts.length).toBeGreaterThan(0);
});

it.each([
  { report: '2026-10-30', days: ['2026-10-29','2026-10-30','2026-11-02'], open: '2026-10-30T13:30:00Z', close: '2026-10-30T20:00:00Z', next: '2026-11-02T07:00:00Z' },
  { report: '2026-11-27', days: ['2026-11-25','2026-11-27','2026-11-30'], open: '2026-11-27T14:30:00Z', close: '2026-11-27T18:00:00Z', next: '2026-11-30T07:00:00Z' },
])('uses exchange sessions and both IANA zones across DST, holidays and early closes: $report', async fixture => {
  const foundation = new Foundation(env.DB), run = await foundation.enqueue(`calendar:${fixture.report}`,{},now);
  const lease = (await foundation.claim(run.id,'calendar',now))!;
  cleanups.push(() => foundation.release(lease,now));
  const capture = new MarketCapture(foundation,() => now);
  await capture.begin(lease,{ id: fixture.report, reportDate: fixture.report,
    calendar: fixture.days.map(date => ({ date, open: '09:30', close: date === '2026-11-27' ? '13:00' : '16:00' })),
    calendarFrom: fixture.days[0]!, calendarThrough: fixture.days[2]!, instruments: [instrument],
    exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities: [], mappingVersion: 'calendar-test' });
  const saved = (await capture.snapshot(fixture.report))!;
  expect(saved.expectedSession).toBe(fixture.days[0]);
  expect(saved.open).toBe(Date.parse(fixture.open));
  expect(saved.close).toBe(Date.parse(fixture.close));
  expect(saved.referenceDeadline).toBe(Date.parse(fixture.next));
});

it('keeps raw-close and action collection obligations for saved members after broker removal', async () => {
  const { capture, lease } = await started('saved-universe');
  await capture.ingest(lease,'saved-universe',{ task: 'seed', page: 0, observations: history(), nextToken: null });
  await capture.finalize(lease,'saved-universe');
  const { planEvaluation } = await import('../src/market/evaluation');
  await planEvaluation(capture,lease,'saved-universe','2026-11-03');
  const tasks = await capture.tasks('saved-universe');
  expect(tasks.some(t => t.request.kind === 'auctions' && t.request.notBefore === Date.parse('2026-11-03T15:15:00Z'))).toBe(true);
  expect(tasks.some(t => t.id.startsWith('outcome:') && t.request.kind === 'bars' && t.request.basis === 'raw' && t.request.securities[0]?.securityId === identity.securityId)).toBe(true);
  expect(tasks.some(t => t.id.startsWith('outcome:') && t.request.kind === 'actions')).toBe(true);
  await capture.begin(lease,{ id: 'after-removal', reportDate: '2026-11-03', calendar: seedCalendar(), calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: [{ ...instrument, ticker: 'UNRELATED_ETF', type: 'ETF' }], exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities: [], mappingVersion: 'after-removal' });
  await capture.finalize(lease,'after-removal');
  await planEvaluation(capture,lease,'after-removal','2026-11-03');
  expect((await capture.tasks('after-removal')).some(t => t.request.kind === 'bars' && t.request.securities.some(s => s.securityId === identity.securityId))).toBe(true);
  expect((await capture.snapshot('saved-universe'))?.decisions[0]?.reason).toBe('eligible');
});

it('drains a real capture command from read-only provider HTTP through immutable persisted manifests', async () => {
  const liveInstrument = { ...instrument, isin: 'runtime-isin' };
  const liveIdentity = { ...identity, isin: liveInstrument.isin, securityId: 'runtime-elf', compositeFIGI: 'runtime-elf' };
  const store = new Foundation(env.DB);
  for (const resource of ['market_requests','broker_instruments','broker_exchanges','figi']) {
    await store.setBudget('2026-11',resource,1000); await store.setBudget('2026-11-03',resource,600);
  }
  await env.DB.prepare('INSERT INTO market_identity_reviews(id,isin,valid_from,valid_through,acquired_at,value) VALUES(?,?,?,?,?,?)')
    .bind('elf-review',liveInstrument.isin,'2026-11-01','2026-11-10',now-1000,JSON.stringify(liveIdentity)).run();
  const { drainMarket } = await import('../src/market/runtime');
  const run = await store.enqueue('runtime:market',{ kind: 'market', reportDate: '2026-11-03', seed: false },now);
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input)); let body: unknown;
    if (url.pathname.endsWith('instruments')) body = [liveInstrument];
    else if (url.pathname.endsWith('exchanges')) body = [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }];
    else if (url.pathname.endsWith('assets')) body = [{ symbol: 'ELF', exchange: 'NYSE', status: 'active', class: 'us_equity' }];
    else if (url.pathname.endsWith('calendar')) body = seedCalendar();
    else if (url.pathname.endsWith('mapping')) body = [{ data: [{ compositeFIGI: liveIdentity.compositeFIGI, shareClassFIGI: identity.shareClassFIGI, ticker: 'ELF', securityType: 'Common Stock' }] }];
    else if (url.pathname.endsWith('corporate-actions')) body = { corporate_actions: {}, next_page_token: null };
    else body = { bars: { ELF: history().filter(o => o.basis === 'raw').map(o => o.value) }, next_page_token: null };
    return Response.json(body);
  };
  for (let tick = 0; tick < 8 && (await store.run(run.id))?.state !== 'completed'; tick++) await drainMarket(store,{
    ALPACA_KEY: 'test', ALPACA_SECRET: 'test', TRADING212_AUTHORIZATION: 'test',
  },run,() => now,fetcher);
  expect((await store.run(run.id))?.state).toBe('completed');
  expect((await new MarketCapture(store,() => now).snapshot(run.id))?.status).toBe('complete');
  expect((await store.report(run.id))?.items[0]?.value['researchOnly']).toBe('true');
});

it('appends split-adjustment revisions without duplicating raw history or changing the first snapshot', async () => {
  const { capture, lease } = await started('split-original');
  await capture.ingest(lease,'split-original',{ task: 'seed', page: 0, observations: history(), nextToken: null });
  await capture.finalize(lease,'split-original');
  const original = (await capture.snapshot('split-original'))!;
  const before = (await capture.stats()).observations;
  await capture.begin(lease,{ id: 'split-revised', reportDate: '2026-11-03', calendar: seedCalendar(), calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: [instrument], exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities: [{ ...identity, actionVersion: 'actions-2' }], mappingVersion: 'mapping-2' });
  await capture.ingest(lease,'split-revised',{ task: 'seed', page: 0, observations: history().map(o => ({ ...o, actionVersion: 'actions-2', mappingVersion: 'mapping-2',
    value: o.basis === 'split' ? { ...o.value, o: '5', h: '6', l: '4.5', c: '5', v: '1200000' } : o.value })), nextToken: null });
  await capture.finalize(lease,'split-revised');
  expect((await capture.stats()).observations-before).toBe(90);
  expect((await capture.snapshot('split-original'))?.decisions).toEqual(original.decisions);
  expect((await capture.snapshot('split-revised'))?.decisions[0]?.reason).toBe('eligible');
});

it('rechecks symbols whose successful response lacks the expected session before the deadline', async () => {
  const { capture, lease } = await started('freshness-recovery');
  await capture.plan(lease,'freshness-recovery',[{ id: 'history:raw', kind: 'bars', basis: 'raw', start: '2026-11-02', end: '2026-11-02', securities: [identity], deadline: now+3600000 }]);
  const { MarketWorker } = await import('../src/market/worker');
  let at = now, calls = 0;
  const worker = new MarketWorker(capture,{ page: async () => ({ observations: ++calls === 1 ? [] : history().filter(o => o.session === '2026-11-02' && o.basis === 'raw'), nextToken: null }) },() => at);
  await worker.tick(lease,'freshness-recovery',1);
  expect((await capture.tasks('freshness-recovery')).some(t => t.state === 'pending' && t.next_at > now)).toBe(true);
  at += 60000;
  await worker.tick(lease,'freshness-recovery',1);
  expect(calls).toBe(2);
});

it('plans missing intermediate closes after an outage with their original per-session deadlines', async () => {
  const { capture, lease } = await started('outage-recovery');
  await capture.ingest(lease,'outage-recovery',{ task: 'seed', page: 0, observations: history(), nextToken: null });
  await capture.finalize(lease,'outage-recovery');
  const { planEvaluation } = await import('../src/market/evaluation');
  await planEvaluation(capture,lease,'outage-recovery','2026-11-05');
  const request = (await capture.tasks('outage-recovery')).find(t => t.id.startsWith('outcome:close:'))?.request;
  expect(request?.start).toBe('2026-11-03');
  expect(request?.end).toBe('2026-11-05');
  expect(request?.initialDeadlines).toEqual([
    { session: '2026-11-03', cutoff: Date.parse('2026-11-04T07:00:00Z') },
    { session: '2026-11-04', cutoff: Date.parse('2026-11-05T07:00:00Z') },
    { session: '2026-11-05', cutoff: Date.parse('2026-11-06T07:00:00Z') },
  ]);
});

it('collects a removed member’s dated successor without changing the original security identity', async () => {
  const { capture, lease } = await started('successor');
  await capture.ingest(lease,'successor',{ task: 'seed', page: 0, observations: history(), nextToken: null });
  await capture.finalize(lease,'successor');
  const successor: Identity = { ...identity, securityId: 'successor-security', compositeFIGI: 'successor-security', symbol: 'NEW', brokerTicker: 'NEW', isin: 'successor-isin' };
  await env.DB.prepare('INSERT INTO market_identity_reviews(id,isin,valid_from,valid_through,acquired_at,value) VALUES(?,?,?,?,?,?)')
    .bind('successor-review',successor.isin,'2026-11-01','2026-12-31',now,JSON.stringify(successor)).run();
  await env.DB.prepare('INSERT INTO market_successor_links(id,parent_id,successor_id,effective_session,acquired_at,action_id,evidence) VALUES(?,?,?,?,?,?,?)')
    .bind('successor-link',identity.securityId,successor.securityId,'2026-11-03',now,'verified-merger','["https://example.com/merger"]' ).run();
  const { planEvaluation } = await import('../src/market/evaluation');
  await planEvaluation(capture,lease,'successor','2026-11-05');
  expect((await capture.tasks('successor')).some(t => t.request.kind === 'bars' && t.request.securities.some(s => s.securityId === successor.securityId && s.symbol === 'NEW'))).toBe(true);
  expect((await capture.snapshot('successor'))?.decisions[0]?.identity?.securityId).toBe(identity.securityId);
});

it('extends a successor’s existing collection windows through the parent’s later H30', async () => {
  const { capture, lease } = await started('successor-overlap');
  await capture.ingest(lease,'successor-overlap',{ task: 'seed', page: 0, observations: history(), nextToken: null });
  await capture.finalize(lease,'successor-overlap');
  const successor: Identity = { ...identity, securityId: 'overlap-successor', compositeFIGI: 'overlap-successor', symbol: 'NEXT', brokerTicker: 'NEXT', isin: 'overlap-isin', asof: '2026-10-06' };
  await capture.begin(lease,{ id: 'older-successor', reportDate: successor.asof, calendar: seedCalendar(), calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: [{ ...instrument, ticker: successor.brokerTicker, isin: successor.isin }], exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], identities: [successor], mappingVersion: 'older' });
  await capture.ingest(lease,'older-successor',{ task: 'seed', page: 0, observations: history().map(o => ({ ...o, securityId: successor.securityId, symbol: successor.symbol, asof: successor.asof, mappingVersion: 'older' })), nextToken: null });
  await capture.finalize(lease,'older-successor');
  await env.DB.prepare('INSERT INTO market_successor_links(id,parent_id,successor_id,effective_session,acquired_at,action_id,evidence) VALUES(?,?,?,?,?,?,?)')
    .bind('overlap-link',identity.securityId,successor.securityId,'2026-11-03',now,'verified-overlap','["https://example.com/merger"]' ).run();
  const { planEvaluation } = await import('../src/market/evaluation');
  await planEvaluation(capture,lease,'successor-overlap','2026-11-18');
  expect((await capture.tasks('successor-overlap')).some(t => t.request.kind === 'bars' && t.request.end === '2026-11-18' && t.request.securities.some(s => s.securityId === successor.securityId))).toBe(true);
});
