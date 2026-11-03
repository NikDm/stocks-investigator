import { Foundation } from '../persistence';
import { localDate } from '../market/calendar';
import { morningStatus } from './schedule';
import type { Assessment } from '../research/assessment';
import { MorningReports } from './publication';
import { ReviewFeedback } from './feedback';
export const escape = (value: string) => value.replace(/[&<>"']/g,c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const sourceHref = (url: string) => escape(/^https?:\/\//.test(url) ? url : '#');
export const page = (title: string, content: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><link rel="stylesheet" href="/dashboard.css"></head><body><main><h1>${escape(title)}</h1>${content}</main></body></html>`;
const time = (at: number) => escape(new Date(at).toISOString());
const list = (items: string[]) => `<ul>${items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>`;
export const css = `:root{font:17px/1.55 system-ui,sans-serif;color:#193333;background:#f5f7f4}body{margin:0}main{max-width:960px;margin:auto;padding:24px}h1,h2,h3{line-height:1.2}a{color:#075b79}article,section,details{padding:18px;margin:18px 0;border:1px solid #bdcbc5;border-radius:8px;background:white}summary{cursor:pointer;font-weight:600}label{display:block;margin:12px 0}input,select,textarea,button{font:inherit;max-width:100%;padding:6px}button{cursor:pointer}button:disabled{cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{border-left:3px solid #b9c6bd;margin:12px 0;padding-left:16px}.status{border-left:5px solid #9b6b1d;padding:12px;background:#fff5db}small{color:#435d58}nav a{margin-right:18px}`;
export async function dashboard(store: Foundation, now: number, enabled: boolean) {
  const status = await morningStatus(store,now), report = await new MorningReports(store).latest();
  const runs = await store.status(), budgets = await store.budgets();
  const researchUsage = (await store.db.prepare("SELECT scope,period,resource,SUM(COALESCE(actual,amount)) AS charged_or_reserved FROM research_charges GROUP BY scope,period,resource ORDER BY period DESC LIMIT 60").all()).results;
  return page('Morning review',`<p>Aim for a 10–15 minute review. Research supports your judgment; check live prices in Trading 212 before acting.</p>
    <p class="status">${escape(status.state)} — ${status.date}. Expected completed US session: ${escape(status.expectedSession ?? 'unavailable')}. Deadline: ${time(status.deadline)}.</p>
    <p>Scheduled jobs: ${enabled ? 'enabled' : 'disabled'}. Local implementation; hosted morning availability has not been verified.</p>
    ${report ? `<section><h2>${report.report_date===status.date ? 'Morning report' : 'Retained previous report'}</h2><a href="/morning/${encodeURIComponent(report.id)}">Review ${report.report_date}</a> — ${report.value.status}; publication ${report.timing}. ${report.value.main.length} main / ${report.value.watch.active.length} early watch.</section>` : '<p>No published morning report is available.</p>'}
    <details><summary>Run status, failures and retries</summary>${runs.map(r => `<p>${escape(r.id)}: ${escape(r.state)}, attempts ${r.attempts}, next attempt ${time(r.next_at)}${r.error_code ? `; ${escape(r.error_code)}` : ''}</p>`).join('') || '<p>No runs recorded.</p>'}</details>
    <details><summary>Budgets and reserved usage</summary><pre>${escape(JSON.stringify({ budgets,researchUsage },null,2))}</pre><p>Unknown billed calls retain their reservations. Model ceiling: $15/month; search: 30/day and 1,000/month; source fetches: 50/day. Limits and gaps do not establish service readiness.</p></details>`);
}
function assessment(a: Assessment, now: number) {
  const cite = (ids: string[]) => ids.map(id => `<a href="#source-${escape(id)}">source ${escape(id.slice(0,10))}</a>`).join(', ');
  const claims = (items: { text: string; evidenceIds: string[]; metricKeys?: string[] | undefined }[]) => `<ul>${items.map(c => `<li>${escape(c.text)} ${cite(c.evidenceIds)} ${c.metricKeys?.length ? `(market metrics: ${escape(c.metricKeys.join(', '))})` : ''}</li>`).join('')}</ul>`;
  return `<p>${escape(a.thesisKind)}; attractiveness: ${escape(a.attractiveness)}; horizon: ${a.horizonSessions} exchange sessions. Causation unverified.</p>
    <p>Information cutoff ${time(a.cutoff)}. Market as of ${time(a.marketAsOf)}. Expires ${time(a.expiresAt)} — ${now>=a.expiresAt ? 'EXPIRED / stale assessment' : 'within recorded validity'}.</p>
    <h4>Opportunity thesis (interpretation)</h4>${a.thesis ? claims([a.thesis]) : '<p>No supported thesis.</p>'}
    <h4>Invalidation conditions</h4>${claims(a.invalidation)}<h4>Facts</h4>${a.facts.map(f => `<blockquote>${escape(f.quote)} — ${escape(f.role)}; ${cite([f.evidenceId])}</blockquote>`).join('') || '<p>No cited facts.</p>'}
    <h4>Interpretations</h4>${claims(a.interpretations)}<h4>Unknowns / evidence gaps</h4>${list(a.unknowns)}
    <p>Entry condition: ${escape(a.priceCondition.method)}${a.priceCondition.method!=='none' ? ` ${escape(a.priceCondition.value)}, as of ${time(a.priceCondition.asOf)}` : ''}. Historical / delayed data; current entry is unresolved. Check the live broker price before acting.</p>
    <h4>Sources (${a.independentOrigins} independent origins)</h4>${a.sources.map(s => `<p id="source-${escape(s.id)}"><a href="${sourceHref(s.url)}">${escape(s.url)}</a><br><small>Published ${s.publishedAt===null ? 'unknown' : time(s.publishedAt)}; acquired ${time(s.acquiredAt)}; origin ${escape(s.originId)}; replay: sanitized excerpt only; hash ${escape(s.hash)}</small></p>`).join('')}`;
}
export async function reportView(store: Foundation, id: string, now: number, csrf: string) {
  const report = await new MorningReports(store).get(id); if (!report) return null;
  const { value: v } = report;
  const label = (securityId: string) => {
    const identity = v.securities.find(s => s.securityId===securityId);
    return identity ? `${identity.symbol} (${identity.brokerTicker})` : securityId;
  };
  const summary = await new ReviewFeedback(store).summary(report.report_date.slice(0,7));
  const url = `/morning/${encodeURIComponent(id)}/feedback`;
  return page(`Morning report · ${report.report_date}`,`<nav><a href="/">Dashboard</a><a href="#main">Main candidates</a><a href="#watch">Early watch</a><a href="#feedback">Review feedback</a></nav>
    <p class="status">${report.report_date===localDate(now,'Europe/Zagreb') ? 'Current dated report' : 'Retained previous report — stale for today'}. Status: ${v.status}. Publication: ${report.timing}. ${report.timing!=='on_time' ? 'Research-only: excluded from on-time evaluated cohorts.' : 'Observed by the morning deadline.'}</p>
    <p>Cutoff ${time(report.cutoff)}; committed ${time(report.artifact_at)}; observed availability ${report.receipt ? time(report.receipt.observed_at) : 'unverified'}. Deadline ${time(report.deadline)}.</p>
    <p>Expected completed US session ${v.snapshot.expectedSession}; historical SIP daily feed (provider daily close, may include eligible extended-hours activity). Acquired by market cutoff ${time(v.snapshot.cutoff!)}. Delayed data cannot validate current entry. Early-close volume ratios may be distorted.</p>
    <p>Rule ${escape(report.rule_version)}; saved eligible universe ${v.universe.count}. <a href="/api/market/snapshots/${encodeURIComponent(id)}">Exact saved universe, inputs, ranks and coverage (paged)</a></p>
    <p>Account availability unverified: catalogue presence does not establish availability in your account. Confirm availability in Trading 212 before acting.</p><h2 id="main">Main candidates (${v.main.length}/3)</h2>${v.main.length ? v.main.map(securityId => {
      const d = v.decisions.find(d => d.securityId===securityId)!, n = v.novelty.find(n => n.securityId===securityId)!;
      return `<article><h3>${escape(label(securityId))} · ${escape(n.kind)}</h3>${n.previousDate ? `<p>Prior main: ${n.previousDate}. <a href="/assessments/${encodeURIComponent(n.previousVersion!)}">Compare prior immutable assessment</a>; new version ${escape(d.versionId!)}. Assessment changes: ${escape(n.changes.join(', ') || 'no content changes')}.</p>` : ''}<p>Stable security ID: ${escape(securityId)}; identity as of ${v.snapshot.reportDate}.</p>${assessment(d.assessment!,now)}<button disabled>Track opportunity</button><p>Tracking becomes available in issue 09.</p></article>`;
    }).join('') : '<p>No main candidates. No quota filling or backfill.</p><p>Tracking becomes available in issue 09.</p>'}
    <h2 id="watch">Early watch (${v.watch.active.length}/5)</h2><p>Emerging attention without market confirmation; these are not confirmed momentum selections.</p>${v.watch.active.map(w => `<details><summary>${escape(label(w.securityId))} — ${escape(w.note)}</summary><p>First session ${w.firstSession}; publication ${time(w.publishedAt)}; ${w.independentOrigins} independent origins.</p>${w.citations.map(c => `<blockquote>${escape(c.quote)} — <a href="/evidence/${encodeURIComponent(c.evidenceId)}">Evidence</a>; published ${time(c.publishedAt)}, acquired ${time(c.acquiredAt)}</blockquote>`).join('')}</details>`).join('') || '<p>No early-watch entries.</p>'}
    <details><summary>Baseline, dispositions and gaps</summary><p>Screener baseline: ${escape(v.baseline.join(', ') || 'empty')}. Same saved market inputs as AI.</p>${v.decisions.map(d => `<p>${escape(d.securityId)}: ${escape(d.outcome)}${d.gap ? ` — ${escape(d.gap)}` : ''}${d.versionId ? `; <a href="/assessments/${encodeURIComponent(d.versionId)}">Assessment and citations</a>` : ''}</p>`).join('')}${list(v.gaps)}</details>
    <section id="feedback"><h2>Review feedback (optional)</h2><p>${summary.responses} responses / ${summary.eligible} eligible reports in ${report.report_date.slice(0,7)}. Explicit no-response: ${summary.explicitNoResponse}; missing: ${summary.missing}. No-response is not satisfaction.</p>
    <p>Median review: ${summary.medianMinutes ?? 'unavailable'} minutes. Within 15 minutes: ${summary.within15}/${summary.timedResponses} timed responses. Usefulness: ${escape(JSON.stringify(summary.usefulness))} (${summary.usefulnessResponses} answered). Independent of investment outcomes.</p>${list(summary.notes)}
    <form method="post" action="${url}"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="id" value="${crypto.randomUUID()}"><input type="hidden" name="response" value="responded">
    <label>Review minutes <input type="number" name="minutes" min="0" max="1440" step="0.5"></label><label>Usefulness <select name="usefulness"><option value="">Skip</option><option value="useful">Useful</option><option value="mixed">Mixed</option><option value="not_useful">Not useful</option></select></label>
    ${[['understanding','Added understanding'],['effort','Saved effort'],['decision','Changed a research decision']].map(([name,label]) => `<label>${label} <select name="${name}"><option value="">Skip</option><option value="true">Yes</option><option value="false">No</option></select></label>`).join('')}
    <label>Decision note <textarea name="note" maxlength="1000"></textarea></label><button>Save feedback</button></form>
    <form method="post" action="${url}"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="id" value="${crypto.randomUUID()}"><input type="hidden" name="response" value="no_response"><button>Record no response</button></form></section>`);
}
export const assessmentView = (a: Assessment, now: number) => page(`Assessment · ${a.securityId}`,`<a href="/">Dashboard</a>${assessment(a,now)}`);
