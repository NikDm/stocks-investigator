import type { ScreenRow } from '../screening/screen';
import { RefreshPublication } from '../refresh/publication';
import { Refreshes } from '../refresh/store';
import { historicalDiscoveryView } from './retrospective-history';
import { D } from '../decimal';
import { Foundation } from '../persistence';
import { MorningReports } from '../morning/publication';
import { page, escape } from '../morning/view';
import { Outcomes } from './store';
import { summarize } from './comparison';

export async function retrospectiveView(store:Foundation,id:string,now:number,coverageAfter='') {
  const morning = await new MorningReports(store).get(id);
  if (!morning) return null;
  const outcomes = new Outcomes(store,() => now);
  const summaries = new Map<number,ReturnType<typeof summarize>>();
  const leaders: Awaited<ReturnType<Outcomes['members']>>['items'] = [];
  for (const horizon of [10,20,30] as const) {
    const values = [];
    let after = '';
    do {
      const members = await outcomes.members(id,horizon,after);
      values.push(...members.items.map(m => m.outcome));
      if (horizon===20) leaders.push(...members.items.filter(m => m.outcome.status==='resolved'));
      leaders.sort((a,b) => new D(b.outcome.adjusted!).cmp(a.outcome.adjusted!) || (a.securityId<b.securityId ? -1 : a.securityId>b.securityId ? 1 : 0));
      leaders.splice(10);
      after = members.next ?? '';
    } while (after);
    summaries.set(horizon,summarize(values));
  }
  const summary = summaries.get(20)!;
  const pct = (value:string|null) => value===null ? 'unavailable' : `${(Number(value)*100).toFixed(2)}%`;
  const ledgerCondition = "(d.reason!='eligible' OR json_extract(m.value,'$.exclusion') IS NOT NULL)";
  const ledgerReason = "COALESCE(json_extract(m.value,'$.exclusion'),d.reason)";
  const coverage = (await store.db.prepare(`SELECT ${ledgerReason} AS reason,COUNT(*) AS count FROM market_decisions d
    LEFT JOIN screening_metrics m ON m.snapshot_id=d.snapshot_id AND m.ticker=d.ticker
    WHERE d.snapshot_id=? AND ${ledgerCondition} GROUP BY ${ledgerReason} ORDER BY reason`).bind(id).all<{reason:string;count:number}>()).results;
  const ledger = (await store.db.prepare(`SELECT d.ticker,d.security_id AS securityId,${ledgerReason} AS reason FROM market_decisions d
    LEFT JOIN screening_metrics m ON m.snapshot_id=d.snapshot_id AND m.ticker=d.ticker
    WHERE d.snapshot_id=? AND ${ledgerCondition} AND d.ticker>? ORDER BY d.ticker LIMIT 100`).bind(id,coverageAfter).all<{ticker:string;securityId:string|null;reason:string}>()).results;
  const refreshes = [];
  const requests = (await store.db.prepare('SELECT run_id FROM refresh_requests WHERE morning_id=? ORDER BY accepted_at LIMIT 2').bind(id).all<{run_id:string}>()).results;
  for (const request of requests) {
    const refresh = await new RefreshPublication(new Refreshes(store,() => now)).get(request.run_id);
    refreshes.push(refresh ? `<p><a href="/refresh/${encodeURIComponent(request.run_id)}">${escape(request.run_id)}</a>: ${refresh.evaluated ? 'evaluated' : 'research-only'}; ${escape(refresh.timing)}; AI ${escape(refresh.value.main.join(', ') || 'abstained')}; baseline ${escape(refresh.value.baseline.join(', ') || 'empty')}.</p>`
      : `<p>${escape(request.run_id)}: pending or unavailable refresh.</p>`);
  }
  const articles = [];
  for (const member of leaders) {
    const supporting = [];
    for (const horizon of [10,30] as const) {
      const result = (await outcomes.member(id,member.securityId,horizon))!.outcome;
      supporting.push(`H${horizon}: ${result.status}${result.reason ? ` (${escape(result.reason)})` : ''}; adjusted ${pct(result.adjusted)}`);
    }
    const revision = member.revision!;
    const screenRow = await store.db.prepare(`SELECT m.value AS metric,r.value AS rank FROM market_decisions d
      JOIN screening_metrics m ON m.snapshot_id=d.snapshot_id AND m.ticker=d.ticker
      JOIN screening_ranks r ON r.snapshot_id=m.snapshot_id AND r.ticker=m.ticker
      WHERE d.snapshot_id=? AND d.security_id=?`).bind(id,member.securityId).first<{metric:string;rank:string}>();
    const screen = screenRow ? JSON.parse(screenRow.metric) as ScreenRow : null;
    if (screen && screenRow) {
      const {rs20,...ranking} = JSON.parse(screenRow.rank);
      Object.assign(screen,ranking);
      if (screen.metrics) screen.metrics.rs20=rs20;
    }
    const decision = morning.value.decisions.find(d => d.securityId===member.securityId) ?? null;
    const watch = morning.value.watch.active.filter(w => w.securityId===member.securityId);
    const evidenceIds = [...new Set([...(decision?.assessment?.sources.map(s => s.id) ?? []),...watch.flatMap(w => w.citations.map(c => c.evidenceId))])];
    // Read exact immutable content IDs, never today's search results or a corrected assessment.
    const evidence = evidenceIds.length ? (await store.db.prepare(`SELECT id,json_extract(value,'$.acquiredAt') AS acquiredAt,
      json_extract(value,'$.publishedAt') AS publishedAt FROM research_evidence WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`)
      .bind(JSON.stringify(evidenceIds)).all<{id:string;acquiredAt:number;publishedAt:number|null}>()).results : [];
    const history = historicalDiscoveryView({securityId:member.securityId,cutoff:morning.cutoff,main:morning.value.main,baseline:morning.value.baseline,
      watch:watch.length>0,research:decision,disposition:screen?.disposition ?? null,failedGates:screen?.failedGates ?? [],inputIds:screen?.inputIds ?? [],evidence,missingEvidence:evidenceIds.filter(id => !evidence.some(e => e.id===id))});
    articles.push(`<article data-security="${escape(member.securityId)}"><h2>${escape(member.securityId)}</h2>
      ${history}<p>Saved signals: R5 ${pct(screen?.metrics?.r5 ?? null)}, R20 ${pct(screen?.metrics?.r20 ?? null)}, R60 ${pct(screen?.metrics?.r60 ?? null)}; volume confirmation ratio ${escape(screen?.metrics?.volumeRatio ?? "unavailable")}; acquired through ${screen?.acquiredThrough===null || screen?.acquiredThrough===undefined ? 'unavailable' : new Date(screen.acquiredThrough).toISOString()}; event through ${screen?.eventThrough===null || screen?.eventThrough===undefined ? 'unavailable' : new Date(screen.eventThrough).toISOString()}.</p><p>H20 adjusted ${pct(member.outcome.adjusted)}; gross ${pct(member.outcome.gross)}. ${supporting.join('; ')}.</p>
      <p>Daily-close downside: ${member.outcome.downside.status}, ${member.outcome.downside.observed}/${member.outcome.downside.expected} sessions; ${pct(member.outcome.downside.value)}.</p>
      <p>Outcome ${revision.kind} ${escape(revision.id)}, recorded ${new Date(revision.recordedAt).toISOString()}; cutoff ${new Date(revision.cutoff).toISOString()}.
      <a href="/evaluation/${encodeURIComponent(id)}/${encodeURIComponent(member.securityId)}/history?horizon=20">Revision history and calculation inputs</a></p></article>`);
  }
  return page(`Not-surfaced review — ${morning.report_date}`,`<a href="/evaluation/${encodeURIComponent(id)}">Prospective evaluation</a>
    <p>Saved morning universe: ${morning.value.universe.count} members; rule ${escape(morning.rule_version)}; input hash ${escape(morning.value.inputHash)}; publication ${escape(morning.timing)}, report ${escape(morning.value.status)}.</p>
    <p>Not surfaced means absent from morning AI main, not automatically detectable.</p>
    <p>${summary.resolved}/${summary.total} resolved; ${summary.pending} pending; ${summary.total-summary.resolved-summary.pending} unresolved. Reasons: ${escape(JSON.stringify(summary.reasons))}.</p>
    ${[10,30].map(horizon => { const s=summaries.get(horizon)!; return `<p>H${horizon} coverage: ${s.resolved}/${s.total} resolved; ${s.pending} pending; ${s.total-s.resolved-s.pending} unresolved. Reasons: ${escape(JSON.stringify(s.reasons))}.</p>`; }).join('')}
    <p>Top ten resolved H20 cost-adjusted results, descending; ties by stable security identity. H10/H30 support H20. Same official opening reference and 10bp per side cost policy as prospective evaluation.</p>
    ${articles.join('') || '<p>No resolved H20 outcomes; awaiting history or calculation.</p>'}
    <section><h2>Separate refresh provenance</h2><p>Refreshes never change morning flags or the historical eligible universe.</p>${refreshes.join('') || '<p>No refresh recorded.</p>'}</section>
    <section><h2>Coverage ledger</h2><p>Saved eligibility exclusions and screening/history gaps, separate from the ranked results. Securities outside the saved eligible universe are not counted as misses. Eligible members with screening gaps still retain their outcome denominator. No present-day broker filter is used.</p>
    <p>${escape(JSON.stringify(coverage))}</p>
    ${ledger.map(row => `<p>${escape(row.ticker)} / ${escape(row.securityId ?? 'identity unavailable')}: ${escape(row.reason)}</p>`).join('') || '<p>No coverage gaps on this page.</p>'}
    ${ledger.length===100 ? `<a href="/retrospective/${encodeURIComponent(id)}?coverageAfter=${encodeURIComponent(ledger.at(-1)!.ticker)}">Next coverage entries</a>` : ''}</section>
    <p>This ranking is retrospective analysis, not a historical prediction or evidence of investment edge. Hypothetical references and daily closes cannot establish executable prices or intraday downside. Small samples, overlapping cohorts and coverage gaps limit interpretation.</p>`);
}
