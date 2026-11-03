import { D, mean, median, rounded } from '../decimal';
import type { Outcome } from './calculate';
export function summarize(outcomes: Outcome[]) {
  const resolved = outcomes.filter(o => o.status==='resolved'), values = resolved.map(o => new D(o.adjusted!));
  const gross = resolved.map(o => new D(o.gross!));
  const downsides = outcomes.filter(o => o.downside.status==='complete').map(o => new D(o.downside.value!));
  return { total: outcomes.length, resolved: resolved.length, pending: outcomes.filter(o => o.status==='pending').length,
    reasons: Object.fromEntries([...new Set(outcomes.flatMap(o => o.reason ? [o.reason] : []))].sort().map(reason => [reason,outcomes.filter(o => o.reason===reason).length])),
    mean: values.length ? rounded(mean(values)) : null, median: values.length ? rounded(median(values)) : null,
    grossMean: gross.length ? rounded(mean(gross)) : null,
    sensitivity0Mean: gross.length ? rounded(mean(gross)) : null,
    sensitivity25Mean: resolved.length ? rounded(mean(resolved.map(o => new D(o.sensitivity25!)))) : null,
    completeDownside: downsides.length, meanDownside: downsides.length ? rounded(mean(downsides)) : null,
    partialDownside: outcomes.filter(o => o.downside.status==='partial').length };
}
export function compare(outcomes: Map<string,Outcome>, baseline: string[], ai: string[]) {
  const select = (ids: string[]) => ids.map(id => { const outcome = outcomes.get(id); if (!outcome) throw new Error('missing denominator member'); return outcome; });
  const paired = baseline.filter(id => ai.includes(id)), resolved = paired.filter(id => outcomes.get(id)?.status==='resolved');
  const rejected = baseline.filter(id => !ai.includes(id));
  return { baseline: summarize(select(baseline)), ai: summarize(select(ai)), abstention: ai.length===0,
    overlap: paired.length, union: new Set([...baseline,...ai]).size, paired: { total: paired.length, resolved: resolved.length, outcomes: summarize(select(paired)) },
    notSelectedByAI: { ids: rejected, outcomes: summarize(select(rejected)) } };
}
