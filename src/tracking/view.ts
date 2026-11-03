import { Tracking, type Opportunity } from './store';
import { escape, page } from '../morning/view';
const time = (n: number) => escape(new Date(n).toISOString());
export function trackingForm(csrf: string, action: 'select' | 'archive' | 'renew', securityId: string, revision: number, versionId?: string) {
  return `<form method="post" action="/tracking/commands"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="securityId" value="${escape(securityId)}"><input type="hidden" name="expectedRevision" value="${revision}"><input type="hidden" name="key" value="${crypto.randomUUID()}">${versionId ? `<input type="hidden" name="versionId" value="${escape(versionId)}">` : action==='renew' ? '<label>Current assessment version ID <input required name="versionId" maxlength="100"></label>' : ''}<button>${action==='select' ? 'Track opportunity' : action==='archive' ? 'Archive opportunity' : 'Renew for 20 exchange sessions'}</button></form>`;
}
const state = (r: Opportunity, now: number) => `${escape(r.status)}; thesis ${escape(r.thesisStatus)}; checkpoint ${time(r.checkpointAt)}${now>=r.checkpointAt && r.status!=='archived' ? ' — renewal due; research paused' : ''}`;
export async function trackingList(tracking: Tracking, now: number) {
  await tracking.checkpoints();
  const rows = await tracking.list();
  return page('Tracked opportunities',`<nav><a href="/">Dashboard</a></nav><p>Tracking does not imply ownership. ${rows.filter(r => r.status!=='archived').length}/10 occupied slots. Needs-renewal records retain a slot until explicitly archived.</p>
    ${rows.map(r => `<article><h2><a href="/tracking/${encodeURIComponent(r.securityId)}">${escape(r.securityId)}</a></h2><p>${state(r,now)}</p><p>Last assessment: <a href="/assessments/${encodeURIComponent(r.versionId)}">${escape(r.versionId)}</a></p></article>`).join('') || '<p>No opportunities selected. Select a current main candidate from its morning report.</p>'}`);
}
export async function trackingDetail(tracking: Tracking, securityId: string, now: number, csrf: string) {
  await tracking.checkpoints();
  const row = await tracking.get(securityId); if (!row) return null;
  const history = await tracking.history(securityId), checks = await tracking.checks(securityId), a = await tracking.version(row.versionId);
  return page(`Tracked opportunity · ${securityId}`,`<nav><a href="/">Dashboard</a><a href="/tracking">Tracked opportunities</a></nav><p>Tracking does not imply ownership. Fixed-horizon H10/H20/H30 evaluation continues independently.</p>
    <p class="status">${state(row,now)}</p><p>Interval ${row.interval}, beginning ${escape(row.startSession)}. Revision ${row.revision}.</p>
    <p>Assessment <a href="/assessments/${encodeURIComponent(row.versionId)}">${escape(row.versionId)}</a> — ${a && now<a.expiresAt ? 'within recorded validity' : 'EXPIRED / stale assessment'}. A no-change check does not renew it.</p>
    <p>Recorded thesis: <a href="/assessments/${encodeURIComponent(row.thesisVersionId)}">${escape(row.thesisVersionId)}</a>. ${row.invalidationReasons.map(escape).join(', ')}</p>
    ${row.status!=='archived' ? trackingForm(csrf,'archive',securityId,row.revision) : ''}
    ${now>=row.checkpointAt && row.status!=='archived' ? `<p>Manual renewal requires a current accepted assessment and starts the next exchange session. An invalidated thesis requires a later assessment with revised reasoning.</p>${trackingForm(csrf,'renew',securityId,row.revision)}` : ''}
    <h2>Daily material-change checks</h2>${checks.map(c => `<article><h3>${escape(c.reportDate)} · ${escape(c.status)}</h3><p>Cutoff ${time(c.cutoff)}. Checked ${time(c.at)}.</p><p>Changes: ${c.material.map(escape).join(', ') || 'none established'}.</p><p>Gaps: ${c.gaps.map(escape).join(', ') || 'none recorded'}.</p><a href="/assessments/${encodeURIComponent(c.versionId)}">Assessment</a>${c.versionId!==c.previousVersionId ? ` · <a href="/assessments/${encodeURIComponent(c.previousVersionId)}">Prior version</a>` : ''}</article>`).join('') || '<p>No dated checks yet. Missing checks do not establish no change.</p>'}
    <h2>Lifecycle history</h2>${history.map(e => `<p>${time(e.at)} · ${escape(e.action)} · ${state(e.value,now)} · <a href="/assessments/${encodeURIComponent(e.value.versionId)}">${escape(e.value.versionId)}</a></p>`).join('')}`);
}
