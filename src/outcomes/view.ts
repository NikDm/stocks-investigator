import { Foundation } from '../persistence';
import { MorningReports } from '../morning/publication';
import { ReviewFeedback } from '../morning/feedback';
import { RefreshPublication } from '../refresh/publication';
import { Refreshes } from '../refresh/store';
import { page, escape } from '../morning/view';
import { Outcomes } from './store';
import { compare, summarize } from './comparison';
import type { Outcome } from './calculate';

const pct = (v:string|null) => v===null ? 'unavailable' : `${(Number(v)*100).toFixed(2)}%`;
function summary(label:string,s:ReturnType<typeof summarize>) {
  return `<section><h3>${escape(label)}</h3><p>${s.resolved}/${s.total} resolved; ${s.pending} pending. Reasons: ${escape(JSON.stringify(s.reasons))}.</p>
    <p>Adjusted mean ${pct(s.mean)}; median ${pct(s.median)}. Gross mean ${pct(s.grossMean)}. Resolved members only.</p>
    <p>Cost sensitivity (per side): 0bp ${pct(s.sensitivity0Mean)}; 10bp ${pct(s.mean)}; 25bp ${pct(s.sensitivity25Mean)}.</p>
    <p>Worst observed daily-close return from reference: mean ${pct(s.meanDownside)} among ${s.completeDownside} complete paths; ${s.partialDownside} partial paths kept separate.</p></section>`;
}
export async function evaluationView(store:Foundation,id:string,horizon:10|20|30,now:number,after='') {
  const morning = await new MorningReports(store).get(id); if (!morning) return null;
  const outcomes = new Outcomes(store,() => now), members = await outcomes.members(id,horizon,after), base = `/evaluation/${encodeURIComponent(id)}`;
  const ids = new Set([...morning.value.baseline,...morning.value.main]);
  const refreshIds = (await store.db.prepare('SELECT run_id FROM refresh_requests WHERE morning_id=? ORDER BY accepted_at LIMIT 2').bind(id).all<{run_id:string}>()).results;
  const refreshes = [];
  for (const row of refreshIds) {
    const refresh = await new RefreshPublication(new Refreshes(store,() => now)).get(row.run_id);
    if (refresh) { refreshes.push(refresh); for (const member of [...refresh.value.main,...refresh.value.baseline]) ids.add(member); }
  }
  const observations = new Map<string,Outcome>();
  for (const securityId of ids) {
    const prior = await outcomes.latest(id,securityId,horizon);
    if (prior) observations.set(securityId,prior.value);
    else {
      // Selected members use the same frozen-universe pending/gap result as every other security.
      const member = await outcomes.member(id,securityId,horizon);
      if (!member) throw new Error('cohort member absent from frozen universe');
      observations.set(securityId,member.outcome);
    }
  }
  function comparison(label:string,baseline:string[],ai:string[]) {
    const c = compare(observations,baseline,ai);
    return `<section><h2>${escape(label)}</h2><p>${c.abstention ? 'AI abstained; no AI return is assigned.' : `${c.ai.total} AI selections.`}
      Overlap ${c.overlap}/${c.union} union members; matched paired coverage ${c.paired.resolved}/${c.paired.total}. Overlap uses the identical outcome in both arms.</p>
      ${summary('Screener',c.baseline)}${summary('AI',c.ai)}${summary('Baseline not selected by AI (rejections and research gaps)',c.notSelectedByAI.outcomes)}
      <p>Not selected by AI: ${escape(c.notSelectedByAI.ids.join(', ') || 'none')}.</p></section>`;
  }
  const feedback = await new ReviewFeedback(store).summary(morning.report_date.slice(0,7));
  return page(`Prospective evaluation — ${morning.report_date}`,`<nav><a href="/retrospective/${encodeURIComponent(id)}">Not-surfaced review</a><a href="/morning/${encodeURIComponent(id)}">Morning report</a>${([10,20,30] as const).map(h => `<a href="${base}?horizon=${h}">H${h}${h===20 ? ' (primary)' : ''}</a>`).join('')}</nav>
    <p>Rule ${escape(morning.rule_version)}. H${horizon}; entry ${morning.report_date} is session one; endpoint ${escape(members.endpoint ?? 'calendar unavailable')}. Provider daily close includes eligible extended-session activity.</p>
    <p>Hypothetical references, not executable fills or actual purchase returns. Gross dividends include entitled receivables; no tax, FX or reinvestment. Daily-close downside does not describe intraday losses.</p>
    <p>Small samples, overlapping daily cohorts and missing-data coverage bias cannot establish statistical edge or outperformance. Outcomes never change historical selections.</p>
    ${morning.timing==='on_time' && morning.value.status!=='unavailable' ? comparison('Morning comparison',morning.value.baseline,morning.value.main) : `<p>Morning comparison excluded: publication ${morning.timing}, report ${morning.value.status}. Frozen universe remains available.</p>`}
    ${refreshes.map(r => r.evaluated ? comparison(`Separate refresh ${r.run_id}`,r.value.baseline,r.value.main) : `<p>Refresh ${escape(r.run_id)} excluded: ${escape(r.timing)} or incomplete.</p>`).join('')}
    <section><h2>Usefulness and review effort — ${morning.report_date.slice(0,7)}</h2><p>${feedback.responses}/${feedback.eligible} reports responded; ${feedback.explicitNoResponse} explicit no-response; ${feedback.missing} missing.</p>
      <p>Review-time median ${feedback.medianMinutes ?? 'unavailable'} minutes (${feedback.timedResponses} timed responses); ${feedback.within15}/${feedback.timedResponses} within 15 minutes.</p>
      <p>Usefulness: ${escape(JSON.stringify(feedback.usefulness))}; ${feedback.usefulnessResponses} usefulness responses. No-response does not mean satisfaction. These measures are separate from returns.</p></section>
    <section><h2>Frozen universe (${morning.value.universe.count} members)</h2><p>Showing at most 100 by stable security identity. Excluded and unavailable outcomes retain their original denominator. Awaiting calculations and partial downside are explicit.</p>
      ${members.items.map(m => `<article><h3>${escape(m.securityId)}</h3><p>${m.outcome.status}${m.outcome.reason ? `: ${escape(m.outcome.reason)}` : ''}. Gross ${pct(m.outcome.gross)}; adjusted ${pct(m.outcome.adjusted)}.</p>
      <p>Daily-close downside: ${m.outcome.downside.status}, ${m.outcome.downside.observed}/${m.outcome.downside.expected} sessions; ${pct(m.outcome.downside.value)}.</p>
      ${m.revision ? `<p>Calculation ${escape(m.revision.kind)}, recorded ${new Date(m.revision.recordedAt).toISOString()}; cutoff ${new Date(m.revision.cutoff).toISOString()}. <a href="/evaluation/${encodeURIComponent(id)}/${encodeURIComponent(m.securityId)}/history?horizon=${horizon}">Calculation history and provenance</a></p>` : ''}</article>`).join('')}
      ${members.next ? `<a href="${base}?horizon=${horizon}&amp;after=${encodeURIComponent(members.next)}">Next members</a>` : ''}</section>`);
}
