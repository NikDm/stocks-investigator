import { D, mean, rounded } from '../decimal';
import { barSchema, type SavedObservation } from '../market/types';
import type { ScreenRow } from '../screening/screen';
import type { Assessment, Evidence } from '../research/assessment';

export type MarketState = { r20: string; failedGates: string[]; inputIds: string[]; asOf: number };
export type ChangeResult = { material: string[]; invalidated: string[]; gaps: string[]; market: MarketState | null };
const fact = (text: string) => text.toLowerCase().replace(/\s+/g,' ').trim();
// A repeated event/origin is not a new independent fact. Explicit revisions remain changes.
export function evidenceChanges(a: Assessment, evidence: Evidence[], since = a.cutoff) {
  const known = evidence.filter(e => e.acquiredAt<=since);
  const priorEvents = new Set([...a.sources,...known].map(s => `${s.originId}:${s.eventId}`));
  const sentences = (text: string) => text.split(/[.!?\n]+/).map(fact).filter(Boolean);
  const priorFacts = new Set([...a.facts.map(f => fact(f.quote)),...known.flatMap(e => sentences(e.text))]);
  return evidence.filter(e => e.publishedAt!==null && e.acquiredAt>since
    && (!priorEvents.has(`${e.originId}:${e.eventId}`) || e.revisionOf!==null)
    && sentences(e.text).some(s => !priorFacts.has(s)))
    .filter((e,i,all) => all.findIndex(x => x.originId===e.originId && x.eventId===e.eventId && x.revisionOf===e.revisionOf)===i)
    .map(e => `${priorEvents.has(`${e.originId}:${e.eventId}`) ? 'evidence_revision' : 'evidence_event'}:${e.originId}:${e.eventId}:${e.revisionOf ?? 'new'}`);
}
export function materialChanges(a: Assessment, previous: MarketState | null, row: ScreenRow | null, observations: SavedObservation[], evidence: Evidence[], context: { recorded: Assessment; evidenceSince: number; marketSince: number; startSession: string }): ChangeResult {
  const { recorded, evidenceSince, marketSince, startSession } = context;
  const material = evidenceChanges(a,evidence,evidenceSince), invalidated: string[] = [], gaps: string[] = [];
  const series = observations.filter(o => o.kind==='daily' && o.basis==='split').sort((x,y) => x.session.localeCompare(y.session));
  const bars = series.map(o => barSchema.safeParse(o.value));
  const valid = !!row?.metrics && !row.exclusion && row.identity?.comparability==='verified' && bars.every(b => b.success)
    && series.length===61 && new Set(series.map(o => o.session)).size===61;
  if (!valid) { material.push('market_quality_deterioration'); gaps.push('comparable_market_history_unavailable'); }
  else {
    const values = bars.map(b => b.data!), last = values.at(-1)!, prior = values.at(-2)!;
    if (new D(rounded(new D(last.c).div(prior.c).minus(1))).abs().gte('0.05')) material.push('daily_close_move');
    if (!previous) gaps.push('assessment_market_baseline_missing');
    else {
      if (new D(row.metrics!.r20).minus(previous.r20).abs().gte('0.05')) material.push('r20_change');
      if (JSON.stringify([...row.failedGates].sort())!==JSON.stringify([...previous.failedGates].sort())) material.push('momentum_gate_change');
    }
    const volume = mean(values.slice(-21,-1).map(v => new D(v.v)));
    if (volume.gt(0) && new D(rounded(new D(last.v).div(volume))).gte(2)) material.push('daily_volume');
    for (const [index,condition] of recorded.invalidation.entries()) {
      if (condition.predicate?.kind!=='close_below') continue;
      const level = recorded.marketReferences[condition.predicate.metric];
      // Levels are frozen deterministic methods from the recorded thesis, not today's moving target.
      if (values.some((bar,i) => i>0 && series[i]!.eventAt>marketSince && series[i]!.session>=startSession
        && new D(bar.c).lt(level)
        && new D(values[i-1]!.c).gte(level))) {
        material.push(`recorded_price_predicate:${index}`); invalidated.push(`close_below:${index}`);
      }
    }
  }
  for (const [index,condition] of recorded.invalidation.entries()) if (condition.predicate?.kind==='source_text') {
    const predicate = condition.predicate;
    if (evidence.some(e => e.publishedAt!==null && e.acquiredAt>evidenceSince && e.publishedAt>recorded.cutoff && e.originId===predicate.originId && e.text.includes(predicate.contains))) {
      material.push(`recorded_source_predicate:${index}`); invalidated.push(`source_text:${index}`);
    }
  }
  if (evidence.some(e => e.acquiredAt>evidenceSince && e.publishedAt===null)) gaps.push('new_evidence_publication_unknown');
  if (evidence.some(e => e.acquiredAt>evidenceSince && e.eventId===e.originId && !e.revisionOf
    && [...a.sources,...evidence.filter(old => old.acquiredAt<=evidenceSince)].some(old => old.originId===e.originId && old.eventId===e.eventId))) gaps.push('source_event_identity_unverified');
  if (recorded.invalidation.some(i => !i.predicate)) gaps.push('invalidation_requires_manual_evidence_review');
  return { material: [...new Set(material)], invalidated, gaps,
    market: valid ? { r20: row.metrics!.r20, failedGates: row.failedGates, asOf: row.eventThrough!, inputIds: row.inputIds } : null };
}
