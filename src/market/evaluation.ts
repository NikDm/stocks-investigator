import { instant } from './calendar';
import type { Lease } from '../persistence';
import { MarketCapture } from './capture';
import type { Decision, Identity, Snapshot } from './types';

export async function planEvaluation(capture: MarketCapture, lease: Lease, anchorId: string, endpointSession: string) {
  const anchor = await capture.snapshot(anchorId);
  if (!anchor || anchor.cutoff === null) throw new Error('saved universe required');
  const nextSession = anchor.calendar.find(s => s.date > endpointSession);
  if (!nextSession) throw new Error('endpoint calendar deadline missing');
  const endpointDeadline = instant(nextSession.date,'08:00','Europe/Zagreb');
  const db = capture.foundation.db;
  const union = new Map<string, Identity>();
  for (let offset = 0; ; offset += 100) {
    const rows = (await db.prepare(`WITH latest AS (
      SELECT d.value,ROW_NUMBER() OVER(PARTITION BY d.security_id ORDER BY s.report_date DESC,s.id DESC) AS rank
      FROM market_decisions d JOIN market_snapshots s ON s.id=d.snapshot_id
      WHERE s.frozen=1 AND d.reason='eligible' AND s.report_date<=? AND (s.horizon_end IS NULL OR s.horizon_end>=?))
      SELECT value FROM latest WHERE rank=1 LIMIT 100 OFFSET ?`).bind(anchor.reportDate,endpointSession,offset).all<{ value: string }>()).results;
    for (const row of rows) { const d = JSON.parse(row.value) as Decision; if (d.identity) union.set(d.identity.securityId,d.identity); }
    if (rows.length < 100) break;
  }
  const groups = new Map<string, Identity[]>();
  for (const identity of union.values()) {
    const group = groups.get(identity.asof) ?? []; group.push(identity); groups.set(identity.asof,group);
  }
  const all = [...union.values()];
  for (let offset = 0; offset < all.length; offset += 100) await capture.foundation.fenced(lease,capture.clock(),[
    db.prepare(`INSERT INTO market_collection_identities(snapshot_id,security_id,asof,value)
      SELECT ?,json_extract(value,'$.securityId'),json_extract(value,'$.asof'),value FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`)
      .bind(anchorId,JSON.stringify(all.slice(offset,offset+100))),
  ]);
  for (const [asof, identities] of groups) for (let offset = 0; offset < identities.length; offset += 100) {
    const securities = identities.slice(offset,offset+100), suffix = `${endpointSession}:${asof}:${offset}`;
    await capture.plan(lease,anchorId,[
      { id: `outcome:close:${suffix}`, kind: 'bars', basis: 'raw', start: endpointSession, end: endpointSession, securities, deadline: endpointDeadline },
      { id: `outcome:actions:${suffix}`, kind: 'actions', basis: 'raw', start: anchor.calendarFrom, end: endpointSession, securities, deadline: endpointDeadline },
    ]);
  }
  // Entry references belong to each saved U_D, including stocks never selected.
  const eligible: Decision[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = (await capture.snapshot(anchorId,offset))!;
    eligible.push(...page.decisions.filter(d => d.reason === 'eligible' && d.identity));
    if (page.decisions.length < 100) break;
  }
  for (let offset = 0; offset < eligible.length; offset += 100) await capture.plan(lease,anchorId,[{
    id: `opening:${offset}`, kind: 'auctions', basis: 'raw', start: anchor.reportDate, end: anchor.reportDate,
    securities: eligible.slice(offset,offset+100).map(d => d.identity!), notBefore: anchor.auctionAfter, deadline: anchor.referenceDeadline,
  }]);
}

export async function freezeDueReferences(capture: MarketCapture, lease: Lease, limit = 100) {
  const db = capture.foundation.db;
  const due = (await db.prepare(`SELECT d.snapshot_id,d.security_id,s.manifest FROM market_decisions d
    JOIN market_snapshots s ON s.id=d.snapshot_id WHERE s.frozen=1 AND d.reason='eligible'
    AND json_extract(s.manifest,'$.referenceDeadline')<=? AND NOT EXISTS(
      SELECT 1 FROM market_reference_versions r WHERE r.snapshot_id=d.snapshot_id AND r.security_id=d.security_id AND r.kind='initial') LIMIT ?`)
    .bind(capture.clock(),limit).all<{ snapshot_id: string; security_id: string; manifest: string }>()).results;
  for (const d of due) await capture.freezeReference(lease,d.snapshot_id,d.security_id,(JSON.parse(d.manifest) as Snapshot).reportDate);
  return due.length;
}
