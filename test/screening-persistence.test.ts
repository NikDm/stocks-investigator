import { env } from 'cloudflare:test';
import { afterEach, expect, it } from 'vitest';
import { Foundation } from '../src/persistence';
import { MarketCapture } from '../src/market/capture';
import type { Identity, Observation } from '../src/market/types';
import { Screener } from '../src/screening/persistence';

const now = Date.parse('2026-11-03T06:00:00Z');
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function captured(key: string, rawClose?: string, actionVersion = 'v1') {
  const foundation = new Foundation(env.DB), run = await foundation.enqueue(key,{},now), lease = (await foundation.claim(run.id,'screen',now))!;
  cleanups.push(() => foundation.release(lease,now));
  const capture = new MarketCapture(foundation,() => now), calendar = [];
  for (let t = Date.parse('2026-06-26'); t <= Date.parse('2026-12-18'); t += 86400000) {
    const d = new Date(t), date = d.toISOString().slice(0,10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !['2026-07-03','2026-09-07','2026-11-26'].includes(date)) calendar.push({ date, open: '09:30', close: '16:00' });
  }
  const identities: Identity[] = ['A','B','C','D','E','F','G','H','I'].map(name => ({ brokerTicker: name, isin: name, securityId: name, issuerId: name,
    symbol: name, asof: '2026-11-03', primaryVenue: 'NYSE', securityType: 'Common Stock', compositeFIGI: name, shareClassFIGI: name, listing: 'verified', comparability: 'verified', verifiedActionIds: [], evidence: ['https://example.com/listing'], actionVersion }));
  await capture.begin(lease,{ id: key, reportDate: '2026-11-03', calendar, calendarFrom: '2026-06-26', calendarThrough: '2026-12-18',
    instruments: identities.map(i => ({ ticker: i.brokerTicker, isin: i.isin, type: 'STOCK', currencyCode: 'USD', workingScheduleId: 1 })),
    identities, exchanges: [{ name: 'NYSE', workingSchedules: [{ id: 1 }] }], mappingVersion: 'v1', splitVolumeVerified: true });
  const dates = calendar.filter(s => s.date <= '2026-11-02').slice(-61);
  for (const identity of identities) {
    const observations: Observation[] = dates.flatMap((s,i) => (['raw','split'] as const).map(basis => {
      const c = basis === 'raw' && rawClose ? rawClose : identity.securityId <= 'D' ? String((2000 + i * 5 + Math.max(0,i-40)*10)/100) : '20';
      return { source: 'alpaca', securityId: identity.securityId, kind: 'daily', symbol: identity.symbol, asof: identity.asof, feed: 'sip', basis,
        eventAt: Date.parse(`${s.date}T20:00:00Z`), session: s.date, actionVersion, mappingVersion: 'v1',
        value: { t: `${s.date}T00:00:00Z`, o: c, h: c, l: c, c, v: basis === 'raw' && rawClose ? '2000000' : i > 55 ? '1300000' : '1000000' } };
    }));
    await capture.ingest(lease,key,{ task: identity.securityId, page: 0, observations, nextToken: null });
  }
  await capture.finalize(lease,key);
  return { capture, foundation, lease };
}
it('checkpoints metrics then atomically freezes an immutable equal-input baseline and research queue', async () => {
  const { capture, foundation, lease } = await captured('screen:persist');
  const screener = new Screener(capture,() => now);
  expect(await screener.step(lease,'screen:persist','screen-eval-v1',2)).toBe(false);
  expect(await screener.result('screen:persist')).toBeNull();
  while (!await screener.step(lease,'screen:persist','screen-eval-v1',2)) {}
  const saved = (await screener.result('screen:persist'))!;
  expect(saved.baseline).toEqual(['A','B','C']);
  expect(saved.researchQueue).toEqual(['A','B','C']);
  expect(saved.universeCount).toBe(9);
  expect(saved.rows).toHaveLength(9);
  expect(saved.rows[0]!.inputIds).toHaveLength(122);
  expect(await screener.step(lease,'screen:persist','screen-eval-v1',7)).toBe(true);
  expect(await screener.result('screen:persist')).toEqual(saved);
  await expect(foundation.fenced(lease,now,[env.DB.prepare("UPDATE screening_results SET value='{}' WHERE snapshot_id=?").bind('screen:persist')])).rejects.toThrow('immutable');
  await expect(foundation.fenced(lease,now,[env.DB.prepare("DELETE FROM screening_metrics WHERE snapshot_id=?").bind('screen:persist')])).rejects.toThrow('immutable');
  expect((await screener.result('screen:persist'))!.baseline).toEqual(['A','B','C']);
});

it('uses the same 12-place half-even price eligibility at capture and screening', async () => {
  const { capture, lease } = await captured('screen:price-boundary','4.9999999999995');
  const screener = new Screener(capture,() => now);
  while (!await screener.step(lease,'screen:price-boundary')) {}
  expect((await screener.result('screen:price-boundary'))!.universeCount).toBe(9);
});
it('produces identical calculations and ranks across persisted partition sizes', async () => {
  const first = await captured('screen:partition-two');
  const two = new Screener(first.capture,() => now);
  while (!await two.step(first.lease,'screen:partition-two','screen-eval-v1',2)) {}
  const original = (await two.result('screen:partition-two'))!;
  await cleanups.pop()!();
  const second = await captured('screen:partition-seven');
  const seven = new Screener(second.capture,() => now);
  while (!await seven.step(second.lease,'screen:partition-seven','screen-eval-v1',7)) {}
  const rerun = (await seven.result('screen:partition-seven'))!;
  expect(rerun.rows).toEqual(original.rows);
  expect(rerun.baseline).toEqual(original.baseline);
  expect(rerun.researchQueue).toEqual(original.researchQueue);
  expect(rerun.medianR20).toBe(original.medianR20);
});

it('uses frozen sighting provenance when identical normalized bars are recaptured under a newer action version', async () => {
  const first = await captured('screen:action-v1');
  const original = new Screener(first.capture,() => now);
  while (!await original.step(first.lease,'screen:action-v1')) {}
  const saved = (await original.result('screen:action-v1'))!;
  await cleanups.pop()!();
  const second = await captured('screen:action-v2',undefined,'v2');
  const revised = new Screener(second.capture,() => now);
  while (!await revised.step(second.lease,'screen:action-v2')) {}
  const rerun = (await revised.result('screen:action-v2'))!;
  expect(rerun.universeCount).toBe(9);
  expect(rerun.baseline).toEqual(saved.baseline);
  expect(rerun.rows[0]!.identity!.actionVersion).toBe('v2');
  expect(rerun.rows[0]!.inputIds).toEqual(saved.rows[0]!.inputIds);
  expect((await original.result('screen:action-v1'))!.rows[0]!.identity!.actionVersion).toBe('v1');
});
