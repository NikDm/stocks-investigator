import { escape, page } from '../morning/view';
import { Purchases, type Purchase } from './store';

function form(csrf: string, action: 'record' | 'correct' | 'remove', purchase?: Purchase) {
  return `<form method="post" action="/purchases/commands"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="purchaseId" value="${escape(purchase?.purchaseId ?? crypto.randomUUID())}"><input type="hidden" name="expectedRevision" value="${purchase?.revision ?? 0}"><input type="hidden" name="key" value="${crypto.randomUUID()}">
    ${action==='remove' ? '' : `<label>Stable security ID <input required name="securityId" maxlength="200" value="${escape(purchase?.securityId ?? '')}" ${purchase ? 'readonly' : ''}></label><label>Actual purchase date (date precision) <input required type="date" name="purchaseDate" value="${escape(purchase?.purchaseDate ?? '')}"></label><label>Actual entry price (USD) <input required name="entryPriceUsd" maxlength="60" value="${escape(purchase?.entryPriceUsd ?? '')}"></label><label>Linked opportunity security ID (optional) <input name="opportunityId" maxlength="200" value="${escape(purchase?.opportunityId ?? '')}"></label><label>Note (optional) <input name="note" maxlength="500" value="${escape(purchase?.note ?? '')}"></label>`}
    <button>${action==='record' ? 'Record actual purchase' : action==='correct' ? 'Append correction' : 'Remove purchase (retain history)'}</button></form>`;
}
export async function purchaseList(store: Purchases, csrf: string, after: string) {
  const rows = await store.list(after);
  return page('Actual purchase records',`<a href="/">Dashboard</a><p>Optional manual records. Tracking does not imply ownership. Actual entry prices are separate from hypothetical evaluation reference prices. Dates have date precision; no execution time is inferred.</p>
    ${rows.map(p => `<p><a href="/purchases/${encodeURIComponent(p.purchaseId)}">${escape(p.securityId)} · ${escape(p.purchaseDate)} · USD ${escape(p.entryPriceUsd)} · ${p.status}</a></p>`).join('') || '<p>No purchase records on this page.</p>'}
    ${rows.length===100 ? `<a href="?after=${encodeURIComponent(rows.at(-1)!.purchaseId)}">Next records</a>` : ''}<h2>Record an actual purchase</h2>${form(csrf,'record')}`);
}
export async function purchaseDetail(store: Purchases, id: string, csrf: string, after: number) {
  const purchase = await store.get(id); if (!purchase) return null;
  const events = await store.history(id,after);
  return page('Actual purchase history',`<a href="/purchases">Actual purchases</a><p>${escape(purchase.securityId)} · ${purchase.status} · revision ${purchase.revision}. Actual entry USD ${escape(purchase.entryPriceUsd)} on ${escape(purchase.purchaseDate)} (date precision). Separate from hypothetical reference prices and research outcomes.</p>
    ${purchase.opportunityId ? `<a href="/tracking/${encodeURIComponent(purchase.opportunityId)}">Linked opportunity</a>` : ''}
    ${purchase.status==='recorded' ? `<h2>Correct record</h2><p>Corrections replace the current fields and retain every prior revision. To correct a security identity, remove this record and record a separate purchase.</p>${form(csrf,'correct',purchase)}${form(csrf,'remove',purchase)}` : ''}
    <h2>Append-only history</h2>${events.map(e => `<article><h3>Revision ${e.value.revision} · ${escape(e.action)}</h3><pre>${escape(JSON.stringify(e.value,null,2))}</pre></article>`).join('')}
    ${events.length===100 ? `<a href="?after=${events.at(-1)!.sequence}">Next revisions</a>` : ''}`);
}
