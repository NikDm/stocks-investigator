import { refreshPolicy } from './policy';
import { Foundation } from '../persistence';
import { page, escape } from '../morning/view';
import { Refreshes } from './store';
import { RefreshPublication } from './publication';
const time = (at: number) => escape(new Date(at).toISOString());
export async function refreshControls(store: Foundation, morningId: string, csrf: string, now: number, enabled: boolean) {
  const refreshes = new Refreshes(store,() => now), disabled = !enabled ? 'Refresh jobs disabled' : await refreshes.availability(morningId);
  const requests = await refreshes.list(morningId);
  return `<section><h2>Pre-opening re-review</h2><p>Morning three plus active tracked names; at most ${refreshPolicy.sessionLimit} runs per session, ${refreshPolicy.cooldownMs/60000}-minute cooldown. Queued for the next five-minute tick. Morning history stays frozen.</p>
    <form method="post" action="/refresh/commands"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="morningId" value="${escape(morningId)}"><input type="hidden" name="key" value="${crypto.randomUUID()}"><button ${disabled ? 'disabled' : ''}>Request re-review</button></form>${disabled ? `<p>${escape(disabled)}</p>` : ''}
    ${requests.map(r => r ? `<p><a href="/refresh/${encodeURIComponent(r.run.id)}">Refresh ${escape(r.run.id)}</a>: ${escape(r.run.state)}${r.run.state==='failed' ? ' — Failed refresh; prior versions preserved.' : ''}</p>` : '').join('')}</section>`;
}
export async function refreshView(store: Foundation, runId: string, now: number) {
  const refreshes = new Refreshes(store,() => now), request = await refreshes.get(runId); if (!request) return null;
  const publication = await new RefreshPublication(refreshes).get(runId);
  return page('Pre-opening re-review',`<a href="/morning/${encodeURIComponent(request.plan.morningId)}">Frozen morning report</a><p>Run ${escape(runId)}: ${escape(request.run.state)}. Cutoff: ${time(request.plan.cutoff)}.</p>
    <p class="status">Delayed, stale or missing prices leave current entry conditions unvalidated. Check Trading 212 live before acting. Missing prices never imply unchanged conditions.</p>
    ${request.run.state==='failed' ? '<p>Failed refresh; prior versions preserved.</p>' : ''}
    ${publication ? `<p>Information cutoff: ${time(publication.cutoff)}; observed availability: ${publication.receipt ? time(publication.receipt.observed_at) : 'unverified'}. ${publication.evaluated ? 'Separate matched refresh AI/baseline cohort' : 'Research-only: late, incomplete or timing unverified'}. Morning baseline remains ${escape(request.plan.baseline.join(', '))}.</p>
      ${publication.value.entries.map(e => `<article><h2>${escape(e.securityId)}</h2><p>Changes versus morning: ${escape(e.changes.join(', ') || 'no assessment content changes')}. Attractiveness: ${escape(e.assessment?.attractiveness ?? 'unavailable')}; recorded invalidation: ${escape(e.invalidated.join(', ') || 'not established; see dated conditions')}.</p>
      <p>Evidence changes: ${e.newEvidence.map(id => `<a href="/evidence/${encodeURIComponent(id)}">${escape(id)}</a>`).join(', ') || 'No newly acquired dated evidence established'}.</p>
      <p>Premarket: ${e.priceStatus}${e.price ? `; raw price ${escape(e.price.price)}; minute volume ${escape(e.price.volume ?? 'unavailable')}; event ${time(e.price.eventAt)}, acquired ${time(e.price.acquiredAt)}, delay at least ${e.price.delayMs/60000} minutes` : '; price unavailable'}. Current entry unvalidated.</p>
      <p>Market comparison: ${e.marketChange ? `raw premarket price versus saved raw morning close ${escape(e.marketChange.morningClose.price)} at ${time(e.marketChange.morningClose.eventAt)} (acquired ${time(e.marketChange.morningClose.acquiredAt)}): ${escape(e.marketChange.fraction)} fractional change. Corporate actions after the morning snapshot are unverified; this is an unadjusted descriptive comparison.` : 'unavailable; missing observations do not establish unchanged conditions'}.</p>
      ${e.morningVersionId ? `<a href="/assessments/${encodeURIComponent(e.morningVersionId)}">Morning immutable version</a>` : '<p>Morning assessment unavailable.</p>'} ${e.previousId ? `<a href="/assessments/${encodeURIComponent(e.previousId)}">Prior immutable version</a>` : ''}
      ${e.versionId ? `<p><a href="/assessments/${encodeURIComponent(e.versionId)}">New assessment, reasoning, invalidation and citations</a></p>` : `<p>Failed refresh for this name: ${escape(e.gap ?? 'incomplete')}; prior version preserved.</p>`}${e.gap && e.versionId ? `<p>Research gaps: ${escape(e.gap)}</p>` : ''}</article>`).join('')}` : '<p>Refresh pending or failed; prior versions preserved. Reload this page for durable progress.</p>'}`);
}
