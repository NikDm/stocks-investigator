import { env } from 'cloudflare:test';
import { Foundation } from '../../src/persistence';
import { MarketCapture } from '../../src/market/capture';
import { Screener } from '../../src/screening/persistence';
import type { Identity } from '../../src/market/types';
export const researchNow = Date.parse('2026-11-03T06:30:00Z');
export async function researchFixture(key: string, reportDate = '2026-11-03', useRunId = false) {
  const fixtureNow = Date.parse(`${reportDate}T06:30:00Z`);
  const foundation = new Foundation(env.DB), run = await foundation.enqueue(key,{},fixtureNow);
  if (useRunId) key = run.id;
  const lease = (await foundation.claim(run.id,'research',fixtureNow))!;
  const calendar = [];
  for (let t=Date.parse('2026-06-01');t<=Date.parse('2026-12-18');t+=86400000) {
    const d = new Date(t); if (d.getUTCDay()!==0 && d.getUTCDay()!==6 && d.toISOString().slice(0,10)!=='2026-11-26') calendar.push({ date: d.toISOString().slice(0,10), open: '09:30', close: '16:00' });
  }
  const identities: Identity[] = ['A','B','C','D','E','F','G','H','I'].map(name => ({ brokerTicker: `BROKER_${name}`, isin: name, securityId: name, issuerId: name,
    symbol: name, asof: reportDate, primaryVenue: 'NYSE', securityType: 'Common Stock', compositeFIGI: name, shareClassFIGI: name,
    listing: 'verified', comparability: 'verified', verifiedActionIds: [], evidence: ['https://example.com/listing'], actionVersion: 'v1' }));
  const capture = new MarketCapture(foundation,() => fixtureNow);
  await capture.begin(lease,{ id: key, reportDate, calendar, calendarFrom: '2026-06-01', calendarThrough: '2026-12-18',
    instruments: identities.map(i => ({ ticker: i.brokerTicker, isin: i.isin, type: 'STOCK', currencyCode: 'USD', workingScheduleId: 1 })),
    identities, exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], mappingVersion: 'v1', splitVolumeVerified: true });
  const dates = calendar.filter(s => s.date<reportDate).slice(-61);
  for (const identity of identities) {
    await capture.ingest(lease,key,{ task: identity.securityId, page: 0, nextToken: null,
      observations: dates.flatMap((s,i) => (['raw','split'] as const).map(basis => {
        const c = identity.securityId<='D' ? String((2000+i*5+Math.max(0,i-40)*10)/100) : '20';
        return { source: 'alpaca', securityId: identity.securityId, kind: 'daily' as const, symbol: identity.symbol, asof: identity.asof,
          feed: 'sip' as const, basis, eventAt: Date.parse(`${s.date}T20:00:00Z`), session: s.date, actionVersion: 'v1', mappingVersion: 'v1',
          value: { t: `${s.date}T00:00:00Z`, o: c, h: c, l: c, c, v: i>55 ? '1300000' : '1000000' } };
      })) });
  }
  await capture.finalize(lease,key);
  const screener = new Screener(capture,() => fixtureNow);
  while (!await screener.step(lease,key)) {}
  return { foundation, lease, capture, screener, snapshotId: key };
}
