import { identitySchema } from './types';
import { instant, localDate } from './calendar';
import { hash, type Lease } from '../persistence';
import { MarketCapture } from './capture';
import type { Decision, Identity, Snapshot } from './types';

type HoldingWindow = { start: string; end: string | null };
type CollectionMember = { identity: Identity; firstSession: string; lastSession: string; holdingWindows: HoldingWindow[] };
function mergeWindows(windows: HoldingWindow[]) {
  const merged: HoldingWindow[] = [];
  for (const window of windows.map(w => ({ ...w })).sort((a,b) => a.start.localeCompare(b.start))) {
    const previous = merged.at(-1);
    if (previous && (previous.end===null || previous.end>=window.start)) {
      previous.end = previous.end===null || window.end===null ? null : [previous.end,window.end].sort().at(-1)!;
    } else merged.push(window);
  }
  return merged;
}

export async function planEvaluation(capture: MarketCapture, lease: Lease, anchorId: string, endpointSession: string) {
  const anchor = await capture.snapshot(anchorId,0,0);
  if (!anchor || anchor.cutoff === null) throw new Error('saved universe required');
  const nextSession = anchor.calendar.find(s => s.date > endpointSession);
  if (!nextSession) throw new Error('endpoint calendar deadline missing');
  const endpointDeadline = instant(nextSession.date,'08:00','Europe/Zagreb');
  const db = capture.foundation.db;
  const calendarDates = new Map(anchor.calendar.map(s => [s.date,s]));
  for (let offset = 0; ; offset += 100) {
    const rows = (await db.prepare('SELECT manifest FROM market_snapshots WHERE frozen=1 ORDER BY id LIMIT 100 OFFSET ?').bind(offset).all<{ manifest: string }>()).results;
    for (const row of rows) for (const session of (JSON.parse(row.manifest) as Snapshot).calendar) if (!calendarDates.has(session.date)) calendarDates.set(session.date,session);
    if (rows.length<100) break;
  }
  const calendar = [...calendarDates.values()].sort((a,b) => a.date.localeCompare(b.date));
  const members = new Map<string,CollectionMember>();
  for (let offset = 0; ; offset += 100) {
    const rows = (await db.prepare(`WITH latest AS (
      SELECT d.value,MIN(s.report_date) OVER(PARTITION BY d.security_id) AS first_session,MAX(s.horizon_end) OVER(PARTITION BY d.security_id) AS last_session,
      json_group_array(json_object('start',s.report_date,'end',s.horizon_end)) OVER(PARTITION BY d.security_id) AS windows,ROW_NUMBER() OVER(PARTITION BY d.security_id ORDER BY s.report_date DESC,s.id DESC) AS rank
      FROM market_decisions d JOIN market_snapshots s ON s.id=d.snapshot_id
      WHERE s.frozen=1 AND d.reason='eligible' AND s.report_date<=?)
      SELECT value,first_session,last_session,windows FROM latest WHERE rank=1 LIMIT 100 OFFSET ?`).bind(anchor.reportDate,offset).all<{ value: string; first_session: string; last_session: string | null; windows: string }>()).results;
    for (const row of rows) {
      const decision = JSON.parse(row.value) as Decision;
      if (decision.identity) members.set(decision.identity.securityId,{ identity: decision.identity, firstSession: row.first_session,
        lastSession: row.last_session ?? endpointSession, holdingWindows: mergeWindows(JSON.parse(row.windows) as HoldingWindow[]) });
    }
    if (rows.length < 100) break;
  }
  const queryDate = localDate(capture.clock(),'Europe/Zagreb');
  const reviews = (await db.prepare(`SELECT value FROM market_identity_reviews WHERE acquired_at<=? AND valid_from<=? AND valid_through>=? ORDER BY acquired_at DESC,id DESC`)
    .bind(capture.clock(),queryDate,queryDate).all<{ value: string }>()).results;
  const reviewed = new Map<string,Identity>();
  for (const row of reviews) {
    const parsed = identitySchema.safeParse(JSON.parse(row.value));
    if (parsed.success && parsed.data.listing==='verified' && !reviewed.has(parsed.data.securityId)) reviewed.set(parsed.data.securityId,{ ...parsed.data, asof: queryDate });
  }
  // A rename preserves the security ID; a successor is an independently reviewed
  // security collected alongside its parent. Neither operation rewrites U_D.
  for (const [id,member] of members) if (reviewed.has(id)) member.identity = reviewed.get(id)!;
  const links = (await db.prepare('SELECT parent_id,successor_id,effective_session,action_id,evidence FROM market_successor_links WHERE acquired_at<=? AND effective_session<=?')
    .bind(capture.clock(),endpointSession).all<{ parent_id: string; successor_id: string; effective_session: string; action_id: string; evidence: string }>()).results;
  for (let pass = 0; pass < links.length; pass++) {
    let expanded = false;
    for (const link of links) {
      const parent = members.get(link.parent_id), existing = members.get(link.successor_id);
      const identity = reviewed.get(link.successor_id) ?? existing?.identity;
      if (!parent || !identity || link.effective_session>parent.lastSession
        || !link.action_id || !identitySchema.shape.evidence.safeParse(JSON.parse(link.evidence)).success) continue;
      const inherited = parent.holdingWindows.map(w => ({ start: [w.start,link.effective_session].sort().at(-1)!, end: w.end }))
        .filter(w => w.end===null || w.start<=w.end);
      const holdingWindows = mergeWindows([...(existing?.holdingWindows ?? []),...inherited]);
      if (!holdingWindows.length || existing && JSON.stringify(existing.holdingWindows)===JSON.stringify(holdingWindows)) continue;
      members.set(link.successor_id,{ identity, firstSession: holdingWindows[0]!.start,
        lastSession: holdingWindows.some(w => w.end===null) ? endpointSession : holdingWindows.map(w => w.end!).sort().at(-1)!, holdingWindows });
      expanded = true;
    }
    if (!expanded) break;
  }
  const all = [...members.values()].map(member => member.identity);
  const closeGroups = new Map<string,Identity[]>(), actionGroups = new Map<string,Identity[]>();
  for (let offset = 0; offset < all.length; offset += 100) {
    const identities = all.slice(offset,offset+100);
    await capture.foundation.fenced(lease,capture.clock(),[
      db.prepare(`INSERT INTO market_collection_identities(snapshot_id,security_id,asof,value)
        SELECT ?,json_extract(value,'$.securityId'),json_extract(value,'$.asof'),value FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`)
        .bind(anchorId,JSON.stringify(identities)),
    ]);
    const known = (await db.prepare(`SELECT security_id,session FROM market_observations WHERE kind='daily' AND basis='raw'
      AND security_id IN (SELECT json_extract(value,'$.securityId') FROM json_each(?)) AND session>=? AND session<=? GROUP BY security_id,session`)
      .bind(JSON.stringify(identities),[...members.values()].map(m => m.firstSession).sort()[0]!,endpointSession).all<{ security_id: string; session: string }>()).results;
    for (const identity of identities) {
      const member = members.get(identity.securityId)!;
      const first = member.firstSession;
      const sessions = new Set(known.filter(r => r.security_id === identity.securityId).map(r => r.session));
      const end = [endpointSession,member.lastSession].sort()[0]!;
      let rangeStart: string | null = null, rangeEnd: string | null = null;
      const flushRange = () => {
        if (rangeStart === null) return;
        const key = `${identity.asof}:${rangeStart}:${rangeEnd}`;
        const group = closeGroups.get(key) ?? []; group.push(identity); closeGroups.set(key,group); rangeStart = null;
      };
      for (const session of calendar.filter(s => s.date>=first && s.date<=end)) {
        const needed = !sessions.has(session.date) && member.holdingWindows.some(w => session.date>=w.start && (w.end===null || session.date<=w.end));
        if (needed) { rangeStart ??= session.date; rangeEnd = session.date; } else flushRange();
      }
      flushRange();
      const key = `${identity.asof}:${end}`;
      const group = actionGroups.get(key) ?? []; group.push(identity); actionGroups.set(key,group);
    }
  }
  const initialDeadlines = (start: string,end: string) => calendar.filter(s => s.date>=start && s.date<=end).map(s => {
    const next = calendar.find(n => n.date>s.date);
    if (!next) throw new Error('endpoint deadline missing');
    return { session: s.date, cutoff: instant(next.date,'08:00','Europe/Zagreb') };
  });
  const append = async (kind: 'bars' | 'actions', start: string, end: string, identities: Identity[]) => {
    for (let offset = 0; offset < identities.length; offset += 100) {
      const securities = identities.slice(offset,offset+100);
      const deadlines = initialDeadlines(start,end);
      const deadline = deadlines.at(-1)?.cutoff ?? endpointDeadline;
      const purpose = deadlines.some(d => d.cutoff<=capture.clock()) ? 'revision' as const : 'initial' as const;
      const request = { kind, basis: 'raw' as const, start, end, securities, initialDeadlines: deadlines, purpose,
        ...(deadline>capture.clock() ? { deadline } : {}) };
      const key = await hash(JSON.stringify(request));
      await capture.plan(lease,anchorId,[{ ...request, id: `outcome:${kind === 'bars' ? 'close' : 'actions'}:${endpointSession}:${key.slice(0,20)}` }]);
    }
  };
  for (const [key,identities] of closeGroups) await append('bars',key.split(':')[1]!,key.split(':')[2]!,identities);
  for (const [key,identities] of actionGroups) {
    const end = key.split(':')[1]!;
    await append('actions',[...identities.map(i => members.get(i.securityId)!.firstSession),end].sort()[0]!,end,identities);
  }
  // Entry references belong to each saved U_D, including stocks never selected.
  const eligible: Identity[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = (await capture.snapshot(anchorId,offset))!;
    eligible.push(...page.decisions.filter(d => d.reason === 'eligible' && d.identity).map(d => d.identity!));
    if (page.decisions.length < 100) break;
  }
  for (let offset = 0; offset < eligible.length; offset += 100) await capture.plan(lease,anchorId,[{
    id: `opening:${offset}`, kind: 'auctions', basis: 'raw', start: anchor.reportDate, end: anchor.reportDate,
    securities: eligible.slice(offset,offset+100), notBefore: anchor.auctionAfter, deadline: anchor.referenceDeadline,
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
