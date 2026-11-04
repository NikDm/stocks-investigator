import { escape } from '../morning/view';
import type { PublishedDecision } from '../research/publisher';
import type { ScreenRow } from '../screening/screen';

/** Only frozen morning inputs belong here; latest research versions are not historical signals. */
export type HistoricalDiscovery = {
  securityId:string; cutoff:number; main:string[]; baseline:string[]; watch:boolean;
  research:Pick<PublishedDecision,'outcome'|'versionId'|'gap'>|null;
  disposition:ScreenRow['disposition']|null; failedGates:string[]; inputIds:string[];
  missingEvidence?:string[];
  evidence:{id:string;acquiredAt:number;publishedAt:number|null}[];
};
export function historicalDiscoveryView(input:HistoricalDiscovery) {
  const ai = input.main.includes(input.securityId), baseline = input.baseline.includes(input.securityId);
  const flags = [ai ? 'AI-main' : 'Not surfaced', baseline && !ai ? 'baseline-only' : null,
    input.watch ? 'early watch' : null, input.watch && !ai && !baseline ? 'early-watch-only' : null,
    input.research?.outcome==='rejected' ? 'researched/rejected' : null,
    input.disposition==='outside_research_cap' ? 'outside research cap' : null,
    input.disposition==='momentum_gate_failure' ? 'momentum-gate failure' : null,
    !ai && !baseline && !input.watch && !input.research ? 'absent from main, baseline, early watch and research' : null,
  ].filter(Boolean);
  const historical = input.evidence.filter(e => e.acquiredAt<=input.cutoff && (e.publishedAt===null || e.publishedAt<=input.cutoff));
  const hindsight = input.evidence.filter(e => !historical.includes(e));
  const links = (items:typeof input.evidence) => items.map(e => `<a href="/evidence/${encodeURIComponent(e.id)}">${escape(e.id)}</a> (acquired ${new Date(e.acquiredAt).toISOString()}, published ${e.publishedAt===null ? 'unknown' : new Date(e.publishedAt).toISOString()})`).join('; ') || 'none recorded';
  return `<section><h3>Historical discovery</h3><p>${flags.join('; ')}.</p>
    <p>Morning research: ${escape(input.research?.outcome ?? 'not in research queue')}${input.research?.gap ? `: ${escape(input.research.gap)}` : ''}.
    ${input.research?.versionId ? `<a href="/assessments/${encodeURIComponent(input.research.versionId)}">Frozen assessment ${escape(input.research.versionId)}</a>` : ''}</p>
    <p>Saved screening disposition: ${escape(input.disposition ?? 'unavailable')}; failed gates: ${escape(input.failedGates.join(', ') || 'none recorded')}.
    Immutable market input IDs: ${escape(input.inputIds.join(', ') || 'none recorded')}. Morning cutoff ${new Date(input.cutoff).toISOString()}.</p>
    <p>Contemporaneous evidence: ${links(historical)}. Unknown publication time establishes availability only, not event timing.</p>
    ${input.missingEvidence?.length ? `<p>Missing retained evidence IDs: ${escape(input.missingEvidence.join(', '))}.</p>` : ''}
    ${hindsight.length ? `<p>Hindsight evidence (excluded from historical detectability): ${links(hindsight)}.</p>` : ''}
    <p>These recorded signals do not establish that subsequent performance was predictable.</p></section>`;
}
