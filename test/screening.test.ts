import { expect, it } from 'vitest';
import type { Decision, SavedObservation, Snapshot } from '../src/market/types';
import { screen } from '../src/screening/screen';

// 61 explicit exchange-session identifiers, shared by all securities in a run.
const sessions = Array.from({ length: 61 }, (_, i) => ({ date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0,10), open: '09:30', close: '16:00' }));
export function fixture(names = ['A','B','C']) {
  const decisions: Decision[] = names.map(name => ({ ticker: name, isin: `ISIN${name}`, reason: 'eligible', inputIds: [], identity: {
    brokerTicker: name, isin: `ISIN${name}`, securityId: name, issuerId: `issuer${name}`, symbol: name, asof: '2026-08-01', primaryVenue: 'NYSE', securityType: 'Common Stock',
    compositeFIGI: name, shareClassFIGI: `class${name}`, listing: 'verified', comparability: 'verified', verifiedActionIds: [], evidence: ['https://example.com/identity'], actionVersion: 'v1',
  } }));
  const observations: SavedObservation[] = [];
  for (const [n, decision] of decisions.entries()) for (let i = 0; i < 61; i++) for (const basis of ['raw','split'] as const) {
    // A matches issue 02's worked return anchors; B/C provide a 4% universe median.
    const close = n === 0 ? (i === 0 ? '20' : i <= 40 ? '22' : i <= 55 ? '23' : '25') : (i <= 40 ? '25' : '26');
    const id = `${decision.ticker}-${basis}-${i}`;
    decision.inputIds.push(id);
    observations.push({ id, source: 'alpaca', securityId: decision.ticker, kind: 'daily', symbol: decision.ticker, asof: '2026-08-01', feed: 'sip', basis,
      eventAt: Date.parse(`${sessions[i]!.date}T20:00:00Z`), acquiredAt: Date.parse('2026-08-01T05:00:00Z'), revisionOf: null,
      session: sessions[i]!.date, actionVersion: 'v1', mappingVersion: 'mapping', value: { t: `${sessions[i]!.date}T00:00:00Z`, o: close, h: close, l: close, c: close, v: i > 55 ? '1300000' : '1000000' } });
  }
  const manifest: Snapshot = { id: 'screen-fixture', ruleVersion: 'screen-eval-v1', reportDate: '2026-08-01', expectedSession: sessions[60]!.date,
    deadline: Date.parse('2026-08-01T06:00:00Z'), open: 0, close: 0, auctionAfter: 0, referenceDeadline: 0, startedAt: 1,
    cutoff: Date.parse('2026-08-01T05:30:00Z'), status: 'complete', mappingVersion: 'mapping', sourceReceipts: [], decisions,
    calendar: sessions, calendarFrom: sessions[0]!.date, calendarThrough: sessions[60]!.date };
  return { manifest, observations, splitVolumeVerified: true };
}
it('computes the worked decimal returns and universe-relative strength before momentum filtering', () => {
  const result = screen(fixture(), 'screen-eval-v1');
  expect(result.universe).toEqual(['A','B','C']);
  expect(result.medianR20).toBe('0.040000000000');
  expect(result.rows[0]?.metrics).toMatchObject({ r60: '0.250000000000', r20: '0.136363636364', r5: '0.086956521739', rs20: '0.096363636364', volumeRatio: '1.300000000000' });
  expect(result.rows[0]?.failedGates).toContain('positive_days');
});

function sustained(names = ['A','B','C','D','E','F','G','H','I','J','K']) {
  const input = fixture(names);
  for (const bar of input.observations) {
    const i = sessions.findIndex(s => s.date === bar.session);
    const close = ['A','B','C','D','E'].includes(bar.securityId) ? (2000 + i * 5 + Math.max(0,i - 40) * 10) / 100 : 20;
    bar.value = { ...bar.value, o: String(close), h: String(close), l: String(close), c: String(close) };
  }
  return input;
}
it('freezes exactly three issuer-distinct passers with full ranks, repeat names and normal early-watch confirmation', () => {
  const input = sustained();
  input.manifest.decisions[1]!.identity!.issuerId = 'issuerA';
  const result = screen(input,'screen-eval-v1');
  expect(result.baseline).toEqual(['A','C','D']);
  expect(result.researchQueue).toEqual(['A','C','D']);
  expect(result.rows.filter(r => r.rank !== null).map(r => [r.securityId,r.rank,r.disposition,r.marketConfirmation])).toEqual([
    ['A',1,'research_queue','promotable'], ['B',2,'duplicate_issuer','confirmed_not_selected'], ['C',3,'research_queue','promotable'],
    ['D',4,'research_queue','promotable'], ['E',5,'outside_research_cap','confirmed_not_selected'],
  ]);
  const rerun = screen({ ...input, observations: [...input.observations].reverse(), manifest: { ...input.manifest, decisions: [...input.manifest.decisions].reverse() } },'screen-eval-v1');
  expect(rerun).toEqual(result);
  result.researchQueue.splice(1,1); // A research rejection cannot mutate baseline or a rerun.
  expect(result.baseline).toEqual(['A','C','D']);
  expect(screen(input,'screen-eval-v1').researchQueue).toEqual(['A','C','D']);
});
it('quarantines unsupported identity metadata even when an input decision incorrectly says eligible', () => {
  const input = sustained();
  input.manifest.decisions[0]!.identity!.securityType = 'ETF';
  expect(screen(input,'screen-eval-v1').rows[0]?.exclusion).toBe('unsupported_type');
});
it('rejects observations acquired after the frozen cutoff and never substitutes a later correction', () => {
  const input = sustained();
  input.observations.find(o => o.id === 'A-split-60')!.acquiredAt = input.manifest.cutoff! + 1;
  const result = screen(input,'screen-eval-v1');
  expect(result.rows[0]?.exclusion).toBe('invalid_provenance');
  expect(result.universe).not.toContain('A');
  expect(result.status).toBe('partial');
});
it('retains gaps, conflicting sessions, invalid prices and unresolved actions as exclusions', () => {
  for (const [change, reason] of [
    [(input: ReturnType<typeof fixture>) => input.manifest.decisions[0]!.inputIds.pop(), 'history_missing'],
    [(input: ReturnType<typeof fixture>) => { input.observations.find(o => o.id === 'A-raw-60')!.session = sessions[59]!.date; }, 'conflicting_or_missing_sessions'],
    [(input: ReturnType<typeof fixture>) => { input.observations.find(o => o.id === 'A-split-60')!.value['l'] = '999'; }, 'invalid_bar'],
    [(input: ReturnType<typeof fixture>) => { input.manifest.decisions[0]!.identity!.comparability = 'unknown'; }, 'unresolved_action_comparability'],
  ] as const) {
    const input = sustained(); change(input);
    expect(screen(input,'screen-eval-v1').rows[0]?.exclusion).toBe(reason);
  }
});
it('uses raw dollar volume and raw price for eligibility, with split-adjusted signals on a consistent basis', () => {
  const input = sustained();
  for (const o of input.observations.filter(o => o.securityId === 'A' && o.basis === 'raw')) {
    for (const field of ['o','h','l','c']) o.value[field] = String(Number(o.value[field]) * 2);
    o.value['v'] = String(Number(o.value['v']) / 2);
  }
  const result = screen(input,'screen-eval-v1');
  expect(result.rows[0]!.metrics).toMatchObject({ rawClose: '50.000000000000', latestClose: '25.000000000000', medianDollarVolume: '23575000.000000000000' });
  expect(result.baseline).toEqual(['A','B','C']);
});
it('withholds volume confirmation when split-adjusted volume semantics are unverified', () => {
  const result = screen({ ...sustained(), splitVolumeVerified: false },'screen-eval-v1');
  expect(result.rows[0]!.metrics?.volumeRatio).toBeNull();
  expect(result.rows[0]!.failedGates).toContain('volume_confirmation');
  expect(result.status).toBe('partial'); expect(result.baseline).toEqual([]);
});
it('returns honest empty and unavailable runs without a synthetic median or selections', () => {
  const input = sustained();
  const empty = screen({ ...input, manifest: { ...input.manifest, decisions: [] }, observations: [] },'screen-eval-v1');
  expect(empty).toMatchObject({ universe: [], medianR20: null, baseline: [], researchQueue: [] });
  const unavailable = screen({ ...input, manifest: { ...input.manifest, status: 'unavailable' } },'screen-eval-v1');
  expect(unavailable.baseline).toEqual([]); expect(unavailable.researchQueue).toEqual([]);
  expect(() => screen(input,'future-v2')).toThrow('unsupported');
  expect(() => screen({ ...input, manifest: { ...input.manifest, cutoff: null } },'screen-eval-v1')).toThrow('not frozen');
});
it('applies half-even rounding before inclusive volume and return thresholds', () => {
  for (const [volume, passes] of [['1199999.9999995',true],['1199999.9999985',false]] as const) {
    const input = sustained();
    for (const o of input.observations.filter(o => o.securityId === 'A' && o.basis === 'split' && o.session > sessions[55]!.date)) o.value['v'] = volume;
    expect(screen(input,'screen-eval-v1').rows[0]!.failedGates.includes('volume_confirmation')).toBe(!passes);
  }
  for (const [close, passes] of [['23.099999999989',true],['23.099999999967',false]] as const) {
    const input = sustained();
    for (const o of input.observations.filter(o => o.id === 'A-split-60')) for (const field of ['o','h','l','c']) o.value[field] = close;
    expect(screen(input,'screen-eval-v1').rows[0]!.failedGates.includes('r20')).toBe(!passes);
  }
});
it('counts only positive days, rejects a concentrated jump, and handles zero positive log returns', () => {
  for (const count of [11,12]) {
    const input = sustained();
    for (const o of input.observations.filter(o => o.securityId === 'A' && o.basis === 'split')) {
      const i = sessions.findIndex(s => s.date === o.session);
      const c = i <= 40 ? (i === 0 ? '20' : '22') : String(22 + Math.max(0,i - (60-count)) * 0.25);
      for (const field of ['o','h','l','c']) o.value[field] = c;
    }
    const row = screen(input,'screen-eval-v1').rows[0]!;
    expect(row.metrics!.positiveDays).toBe(count);
    expect(row.failedGates.includes('positive_days')).toBe(count === 11);
  }
  const input = sustained();
  for (const o of input.observations.filter(o => o.securityId === 'A' && o.basis === 'split' && o.session > sessions[40]!.date)) {
    const i = sessions.findIndex(s => s.date === o.session), c = String(24.8 + (i-40)/100);
    for (const field of ['o','h','l','c']) o.value[field] = c;
  }
  const result = screen(input,'screen-eval-v1');
  expect(result.rows[0]!.failedGates).toContain('log_concentration');
  expect(result.rows.find(r => r.securityId === 'F')!.metrics).toMatchObject({ positiveDays: 0, positiveLogSum: '0.000000000000', logConcentration: null });
});
it('uses each ranking key in order with stable security identity as the final tie-break', () => {
  const input = sustained();
  for (const o of input.observations) {
    const i = sessions.findIndex(s => s.date === o.session);
    let c: string | null = null;
    if (o.securityId === 'A' && i === 40) c = '21.5';
    if (o.securityId === 'C' && i === 0) c = '19';
    if (c) for (const field of ['o','h','l','c']) o.value[field] = c;
    if (o.securityId === 'D' && i > 55 && o.basis === 'split') o.value['v'] = '1400000';
    if (o.securityId === 'E' && o.basis === 'raw') o.value['v'] = '2000000';
  }
  const rows = screen(input,'screen-eval-v1').rows.filter(r => r.rank !== null).sort((a,b) => a.rank!-b.rank!);
  expect(rows.map(r => r.securityId)).toEqual(['A','C','D','E','B']);
});
it('accepts inclusive liquidity and R60 bounds while keeping R5 and moving averages strict', () => {
  const input = sustained();
  for (const o of input.observations.filter(o => o.securityId === 'A')) {
    if (o.basis === 'raw') { for (const field of ['o','h','l','c']) o.value[field] = '5'; o.value['v'] = '1000000'; }
    if (o.basis === 'split' && o.session === sessions[0]!.date) for (const field of ['o','h','l','c']) o.value[field] = '22.727272727272727272727272727272727272727272727272727272';
    if (o.basis === 'split' && o.session === sessions[55]!.date) for (const field of ['o','h','l','c']) o.value[field] = '25';
  }
  const result = screen(input,'screen-eval-v1'), row = result.rows[0]!;
  expect(result.universe).toContain('A');
  expect(row.metrics).toMatchObject({ r60: '0.100000000000', r5: '0.000000000000', medianDollarVolume: '5000000.000000000000' });
  expect(row.failedGates).not.toContain('r60'); expect(row.failedGates).toContain('r5');
  expect(result.rows.find(r => r.securityId === 'F')!.failedGates).toContain('moving_averages');
});
it('keeps fewer than three passers and quarantines unknown issuer grouping', () => {
  const input = sustained();
  for (const row of input.manifest.decisions.filter(d => ['B','C','D','E'].includes(d.ticker))) row.identity!.issuerId = '';
  const result = screen(input,'screen-eval-v1');
  expect(result.baseline).toEqual(['A']); expect(result.researchQueue).toEqual(['A']);
  expect(result.rows[1]!.exclusion).toBe('unresolved_identity');
});
it('rounds relative strength after computing its universe median without intermediate rounding drift', () => {
  const input = sustained(['A','B','C']);
  for (const o of input.observations.filter(o => o.basis === 'split' && o.session === sessions[60]!.date)) {
    const c = o.securityId === 'A' ? '23.1000000000132' : '23.1000000000088';
    for (const field of ['o','h','l','c']) o.value[field] = c;
  }
  const row = screen(input,'screen-eval-v1').rows[0]!;
  expect(row.metrics!.rs20).toBe('0.000000000000');
  expect(row.failedGates).toContain('relative_strength');
});
