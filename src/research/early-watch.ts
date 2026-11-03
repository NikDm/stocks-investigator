import { localDate } from '../market/calendar';
import type { MarketConfirmation } from '../screening/screen';

export type WatchUniverse = { securityId: string; issuerId: string; marketConfirmation: MarketConfirmation };
export type WatchCitation = { evidenceId: string; originId: string; quote: string; primary: boolean; publishedAt: number; acquiredAt: number };
export type WatchEvent = { securityId: string; eventId: string; note: string; citations: WatchCitation[]; contradicted: boolean };
export type WatchEntry = WatchEvent & { issuerId: string; firstSession: string; primary: boolean; independentOrigins: number; publishedAt: number };
export type WatchStatus = 'active' | 'expired' | 'promoted' | 'confirmed_not_selected' | 'lost_eligibility' | 'disproven_event'
  | 'insufficient_event_evidence' | 'capacity' | 'replaced_event';
export type WatchHistory = { securityId: string; eventId: string; status: WatchStatus; entry: WatchEntry | null };
export type WatchResult = { active: WatchEntry[]; history: WatchHistory[] };
const lexical = (a: string,b: string) => a<b ? -1 : a>b ? 1 : 0;
function order(a: WatchEntry,b: WatchEntry) {
  return Number(b.primary)-Number(a.primary) || Math.min(3,b.independentOrigins)-Math.min(3,a.independentOrigins)
    || b.publishedAt-a.publishedAt || lexical(a.securityId,b.securityId) || lexical(a.eventId,b.eventId);
}
// Input events are validated against actually acquired evidence by the intake boundary.
// The model does not choose origins, first appearance, eligibility, promotion or order.
export function updateEarlyWatch(input: { session: string; sessions: string[]; universe: WatchUniverse[];
  previous: WatchEntry[]; disprovenEvents?: { securityId: string; eventId: string }[]; firstAppearances?: { securityId: string; eventId: string; firstSession: string }[]; events: WatchEvent[]; cutoff: number }): WatchResult {
  const sessions = [...new Set(input.sessions)].sort(), index = sessions.indexOf(input.session);
  if (index<0) throw new Error('watch calendar incomplete');
  const earliest = sessions[Math.max(0,index-2)]!, universe = new Map(input.universe.map(u => [u.securityId,u]));
  const history: WatchHistory[] = [], contenders = new Map<string,WatchEntry>();
  const eventKey = (event: Pick<WatchEvent,'securityId' | 'eventId'>) => JSON.stringify([event.securityId,event.eventId]);
  const disproven = new Set([...(input.disprovenEvents ?? []),...input.events.filter(e => e.contradicted)].map(eventKey));
  const record = (event: Pick<WatchEvent,'securityId' | 'eventId'>, status: WatchStatus, entry: WatchEntry | null = null) => history.push({ securityId: event.securityId, eventId: event.eventId, status, entry });
  for (const previous of input.previous) {
    const identity = universe.get(previous.securityId), first = sessions.indexOf(previous.firstSession);
    if (disproven.has(eventKey(previous))) record(previous,'disproven_event',previous);
    else if (!identity || identity.marketConfirmation==='ineligible' || identity.marketConfirmation==='unavailable') record(previous,'lost_eligibility',previous);
    else if (identity.marketConfirmation==='promotable') record(previous,'promoted',previous);
    else if (identity.marketConfirmation==='confirmed_not_selected') record(previous,'confirmed_not_selected',previous);
    else if (first<0 && previous.firstSession<sessions[0]! && index>=4) record(previous,'expired',previous);
    else if (first<0) throw new Error('watch history calendar incomplete');
    else if (index-first>=5) record(previous,'expired',previous);
    else contenders.set(previous.securityId,previous);
  }
  for (const event of input.events) {
    const identity = universe.get(event.securityId);
    if (!identity || identity.marketConfirmation==='ineligible' || identity.marketConfirmation==='unavailable') { record(event,'lost_eligibility'); continue; }
    if (identity.marketConfirmation==='promotable') { record(event,'promoted'); continue; }
    if (identity.marketConfirmation==='confirmed_not_selected') { record(event,'confirmed_not_selected'); continue; }
    if (disproven.has(eventKey(event))) {
      if (contenders.get(event.securityId)?.eventId===event.eventId) contenders.delete(event.securityId);
      record(event,'disproven_event'); continue;
    }
    const citations = event.citations.filter(c => c.acquiredAt<=input.cutoff && c.publishedAt<=input.cutoff
      && localDate(c.publishedAt,'America/New_York')>=earliest && localDate(c.publishedAt,'America/New_York')<=input.session);
    const origins = new Set(citations.map(c => c.originId)), primary = citations.some(c => c.primary);
    if (!citations.length || !primary && origins.size<2) { record(event,'insufficient_event_evidence'); continue; }
    const previous = input.previous.find(p => p.securityId===event.securityId && p.eventId===event.eventId);
    const recorded = input.firstAppearances?.find(p => p.securityId===event.securityId && p.eventId===event.eventId);
    const firstSession = previous?.firstSession ?? recorded?.firstSession ?? input.session;
    if (index-sessions.indexOf(firstSession)>=5) { record(event,'expired',previous ?? null); continue; }
    const candidate: WatchEntry = { ...event, citations, issuerId: identity.issuerId, firstSession, primary,
      independentOrigins: origins.size, publishedAt: Math.max(...citations.map(c => c.publishedAt)) };
    const retained = contenders.get(event.securityId);
    if (!retained || retained.eventId===candidate.eventId || candidate.publishedAt>retained.publishedAt) {
      if (retained && retained.eventId!==candidate.eventId) record(retained,'replaced_event',retained);
      contenders.set(event.securityId,candidate);
    }
  }
  const active: WatchEntry[] = [], issuers = new Set<string>();
  for (const entry of [...contenders.values()].sort(order)) {
    if (active.length>=5 || issuers.has(entry.issuerId)) record(entry,'capacity',entry);
    else { active.push(entry); issuers.add(entry.issuerId); record(entry,'active',entry); }
  }
  return { active, history };
}
