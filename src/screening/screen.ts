import type Decimal from 'decimal.js';
import { D, rounded, mean, median } from '../decimal';
import { validBar, liquidity } from '../market/quality';
import { barSchema, type Decision, type SavedObservation, type Snapshot } from '../market/types';

export type ScreeningInput = { manifest: Snapshot; observations: SavedObservation[]; splitVolumeVerified: boolean };
export type Metrics = { latestClose: string; rawClose: string; medianDollarVolume: string; r5: string; r20: string; r20Calculation: string; r60: string;
  sma20: string; sma60: string; positiveDays: number; positiveLogSum: string; largestPositiveLog: string; logConcentration: string | null;
  volumeRatio: string | null; rs20: string | null };
export type MomentumGate = 'r20' | 'r60' | 'r5' | 'moving_averages' | 'positive_days' | 'log_concentration' | 'relative_strength' | 'volume_confirmation';
export type Disposition = 'excluded' | 'momentum_gate_failure' | 'duplicate_issuer' | 'research_queue' | 'outside_research_cap' | 'run_unavailable';
export type MarketConfirmation = 'ineligible' | 'unconfirmed' | 'promotable' | 'confirmed_not_selected' | 'unavailable';
export type ScreenStatus = 'complete' | 'partial' | 'unavailable';
export type ScreenRow = { ticker: string; securityId: string | null; identity: Decision['identity']; inputIds: string[];
  exclusion: string | null; metrics: Metrics | null; acquiredThrough: number | null; eventThrough: number | null;
  failedGates: MomentumGate[]; rank: number | null; disposition: Disposition; marketConfirmation: MarketConfirmation };
export type ScreenResult = { snapshotId: string; ruleVersion: string; cutoff: number; expectedSession: string; status: ScreenStatus;
  universe: string[]; medianR20: string | null; rows: ScreenRow[]; baseline: string[]; researchQueue: string[] };
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function checkVersion(manifest: Snapshot, version: string) {
  if (version !== 'screen-eval-v1' || manifest.ruleVersion !== version) throw new Error('unsupported screening rule version');
  if (manifest.cutoff === null || manifest.status === 'acquiring') throw new Error('snapshot not frozen');
}

// Partitionable per-security work. Only the exact IDs frozen by market capture are used.
export function measure(input: ScreeningInput): ScreenRow[] {
  const { manifest, observations } = input;
  const expected = manifest.calendar.filter(s => s.date <= manifest.expectedSession).slice(-61).map(s => s.date);
  const byId = new Map(observations.map(o => [o.id, o]));
  return manifest.decisions.map(decision => {
    const row: ScreenRow = { ticker: decision.ticker, securityId: decision.identity?.securityId ?? null, identity: decision.identity,
      inputIds: [...decision.inputIds].sort(lexical), exclusion: decision.reason === 'eligible' ? null : decision.reason,
      metrics: null, acquiredThrough: null, eventThrough: null, failedGates: [], rank: null, disposition: 'excluded', marketConfirmation: 'ineligible' };
    if (row.exclusion) return row;
    if (!decision.identity || decision.identity.listing !== 'verified' || !decision.identity.issuerId.trim()) row.exclusion = 'unresolved_identity';
    else if (!['Common Stock','ADR','REIT','NY Reg Shrs'].includes(decision.identity.securityType)) row.exclusion = 'unsupported_type';
    else if (decision.identity.comparability !== 'verified') row.exclusion = 'unresolved_action_comparability';
    else if (expected.length !== 61 || expected[60] !== manifest.expectedSession || new Set(expected).size !== 61) row.exclusion = 'calendar_history_missing';
    const selected = decision.inputIds.map(id => byId.get(id));
    if (!row.exclusion && (selected.length !== 122 || selected.some(o => !o))) row.exclusion = 'history_missing';
    if (row.exclusion) return row;
    const bars = selected as SavedObservation[];
    if (bars.some(o => o.securityId !== row.securityId || o.kind !== 'daily' || o.feed !== 'sip' || o.acquiredAt > manifest.cutoff!
      || o.eventAt > manifest.cutoff! || o.basis === 'split' && o.actionVersion !== decision.identity!.actionVersion)) {
      row.exclusion = 'invalid_provenance'; return row;
    }
    const series = (basis: 'raw' | 'split') => expected.map(session => bars.filter(o => o.session === session && o.basis === basis));
    const rawGroups = series('raw'), splitGroups = series('split');
    if ([...rawGroups,...splitGroups].some(group => group.length !== 1)) { row.exclusion = 'conflicting_or_missing_sessions'; return row; }
    if (bars.some(o => !validBar(o.value))) { row.exclusion = 'invalid_bar'; return row; }
    const raw = rawGroups.map(group => barSchema.parse(group[0]!.value)), split = splitGroups.map(group => barSchema.parse(group[0]!.value));
    const closes = split.map(b => new D(b.c)), latest = closes[60]!;
    const { rawClose, medianDollarVolume: dollars, reason } = liquidity(raw);
    if (reason !== 'eligible') { row.exclusion = reason; return row; }
    const logs: Decimal[] = [];
    for (let i = 41; i <= 60; i++) if (closes[i]!.gt(closes[i - 1]!)) logs.push(closes[i]!.div(closes[i - 1]!).ln());
    const sum = logs.reduce((sum, value) => sum.plus(value),new D(0)), largest = logs.length ? D.max(...logs) : new D(0);
    row.metrics = { latestClose: rounded(latest), rawClose: rounded(rawClose), medianDollarVolume: rounded(dollars),
      r5: rounded(latest.div(closes[55]!).minus(1)), r20: rounded(latest.div(closes[40]!).minus(1)), r20Calculation: latest.div(closes[40]!).minus(1).toString(), r60: rounded(latest.div(closes[0]!).minus(1)),
      sma20: rounded(mean(closes.slice(-20))), sma60: rounded(mean(closes.slice(-60))), positiveDays: logs.length,
      positiveLogSum: rounded(sum), largestPositiveLog: rounded(largest), logConcentration: sum.isZero() ? null : rounded(largest.div(sum)),
      volumeRatio: input.splitVolumeVerified ? rounded(mean(split.slice(-5).map(b => new D(b.v))).div(mean(split.slice(-25,-5).map(b => new D(b.v))))) : null, rs20: null };
    row.acquiredThrough = Math.max(...bars.map(o => o.acquiredAt)); row.eventThrough = Math.max(...bars.map(o => o.eventAt));
    return row;
  });
}

// Compact final stage: universe median precedes all momentum filtering and issuer selection.
export function rank(manifest: Snapshot, measured: ScreenRow[], version: string): ScreenResult {
  checkVersion(manifest,version);
  const rows = structuredClone(measured).sort((a,b) => lexical(a.ticker,b.ticker));
  const eligible = rows.filter(row => row.metrics !== null && row.exclusion === null);
  const medianValue = eligible.length ? median(eligible.map(row => new D(row.metrics!.r20Calculation))) : null;
  const middle = medianValue === null ? null : rounded(medianValue);
  for (const row of eligible) {
    const m = row.metrics!;
    m.rs20 = rounded(new D(m.r20Calculation).minus(medianValue!));
    const gates: [MomentumGate, boolean][] = [
      ['r20', new D(m.r20).gte('0.05')], ['r60', new D(m.r60).gte('0.10')], ['r5', new D(m.r5).gt(0)],
      ['moving_averages', new D(m.latestClose).gt(m.sma20) && new D(m.sma20).gt(m.sma60)],
      ['positive_days', m.positiveDays >= 12], ['log_concentration', m.logConcentration !== null && new D(m.logConcentration).lte('0.50')],
      ['relative_strength', new D(m.rs20).gt(0)], ['volume_confirmation', m.volumeRatio !== null && new D(m.volumeRatio).gte('1.20')],
    ];
    row.failedGates = gates.filter(([,passes]) => !passes).map(([gate]) => gate);
    row.disposition = 'momentum_gate_failure'; row.marketConfirmation = 'unconfirmed';
  }
  const passers = eligible.filter(row => !row.failedGates.length).sort((a,b) => {
    for (const key of ['rs20','r60','volumeRatio','medianDollarVolume'] as const) {
      const difference = new D(b.metrics![key]!).cmp(a.metrics![key]!); if (difference) return difference;
    }
    for (const key of ['compositeFIGI','shareClassFIGI','isin'] as const) { const difference = lexical(a.identity![key],b.identity![key]); if (difference) return difference; }
    return lexical(a.securityId!,b.securityId!);
  });
  const issuers = new Set<string>(), baseline: string[] = [];
  passers.forEach((row,i) => {
    row.rank = i + 1; row.marketConfirmation = 'confirmed_not_selected';
    if (issuers.has(row.identity!.issuerId)) row.disposition = 'duplicate_issuer';
    else { issuers.add(row.identity!.issuerId); row.disposition = baseline.length < 3 ? 'research_queue' : 'outside_research_cap';
      if (baseline.length < 3) { baseline.push(row.securityId!); row.marketConfirmation = 'promotable'; } }
  });
  const unavailable = manifest.status === 'unavailable';
  if (unavailable) for (const row of rows) { row.disposition = 'run_unavailable'; row.marketConfirmation = 'unavailable'; }
  return { snapshotId: manifest.id, ruleVersion: version, cutoff: manifest.cutoff!, expectedSession: manifest.expectedSession,
    status: unavailable ? 'unavailable' : rows.some(r => r.exclusion && !['outside_scope','unsupported_type','below_price','below_liquidity','insufficient_listing_history'].includes(r.exclusion)) || eligible.some(r => r.metrics!.volumeRatio === null) || manifest.status === 'partial' ? 'partial' : 'complete',
    universe: eligible.map(r => r.securityId!).sort(lexical), medianR20: middle, rows, baseline: unavailable ? [] : baseline, researchQueue: unavailable ? [] : [...baseline] };
}
export function screen(input: ScreeningInput, ruleVersion: string): ScreenResult {
  checkVersion(input.manifest,ruleVersion);
  return rank(input.manifest,measure(input),ruleVersion);
}
