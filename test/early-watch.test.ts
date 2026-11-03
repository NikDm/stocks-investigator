import { expect, it } from 'vitest';
import { updateEarlyWatch, type WatchEvent, type WatchUniverse } from '../src/research/early-watch';

const sessions = ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09'];
const universe: WatchUniverse[] = ['A','B','C','D','E','F','G'].map(securityId => ({ securityId, issuerId: securityId, marketConfirmation: 'unconfirmed' }));
const event = (securityId: string, origins: string[], primary = false): WatchEvent => ({ securityId, eventId: `event:${securityId}`,
  note: 'A concrete event may attract attention.', citations: origins.map((originId,i) => ({ evidenceId: `${securityId}:${i}`, originId, quote: 'A contract was signed.', primary,
    publishedAt: Date.parse('2026-11-03T12:00:00Z'), acquiredAt: Date.parse('2026-11-03T13:00:00Z') })), contradicted: false });
it('caps early watch at five, deduplicates origins and retains expiry/promotion history without backfill', () => {
  const first = updateEarlyWatch({ session: sessions[1]!, sessions, universe, previous: [], events: [event('A',['wire','wire']),event('B',['issuer'],true),...['C','D','E','F','G'].map(s => event(s,['editorial-1','editorial-2']))], cutoff: Date.parse('2026-11-03T14:00:00Z') });
  expect(first.active.map(e => e.securityId)).toEqual(['B','C','D','E','F']);
  expect(first.history.find(e => e.securityId==='A')?.status).toBe('insufficient_event_evidence');
  const confirmed = universe.map(u => ({ ...u, marketConfirmation: u.securityId==='B' ? 'confirmed_not_selected' as const : u.marketConfirmation }));
  const second = updateEarlyWatch({ session: sessions[2]!, sessions, universe: confirmed, previous: first.active, events: [], cutoff: Date.parse('2026-11-04T14:00:00Z') });
  expect(second.history.find(e => e.securityId==='B')?.status).toBe('confirmed_not_selected');
  const expired = updateEarlyWatch({ session: sessions[5]!, sessions, universe, previous: first.active, events: [event('B',['issuer'],true)], cutoff: Date.parse('2026-11-09T14:00:00Z') });
  expect(expired.active.map(e => e.securityId)).toContain('B');
  // First appearance is session one: Tuesday through Monday is five sessions.
  const nextSessions = [...sessions,'2026-11-10'];
  const ended = updateEarlyWatch({ session: '2026-11-10', sessions: nextSessions, universe, previous: expired.active, events: [event('B',['issuer'],true)], cutoff: Date.parse('2026-11-10T14:00:00Z') });
  expect(ended.active).toEqual([]);
  expect(ended.history.some(e => e.status==='expired')).toBe(true);
});

it('does not re-admit an expired event after it has left the active list', () => {
  const later = [...sessions,'2026-11-10'];
  const repeated = event('B',['issuer'],true);
  repeated.citations = repeated.citations.map(c => ({ ...c, publishedAt: Date.parse('2026-11-10T12:00:00Z'), acquiredAt: Date.parse('2026-11-10T13:00:00Z') }));
  const result = updateEarlyWatch({ session: '2026-11-10', sessions: later, universe, previous: [],
    firstAppearances: [{ securityId: 'B', eventId: 'event:B', firstSession: '2026-11-03' }], events: [repeated], cutoff: Date.parse('2026-11-10T14:00:00Z') });
  expect(result.active).toEqual([]);
  expect(result.history[0]!.status).toBe('expired');
  const distinct = updateEarlyWatch({ session: '2026-11-10', sessions: later, universe, previous: [],
    firstAppearances: [{ securityId: 'B', eventId: 'event:B', firstSession: '2026-11-03' }], events: [{ ...repeated, eventId: 'verified-distinct-event' }], cutoff: Date.parse('2026-11-10T14:00:00Z') });
  expect(distinct.active[0]!.firstSession).toBe('2026-11-10');
});

it('keeps disproven events removed and expires an old retained entry after a long outage', () => {
  const first = updateEarlyWatch({ session: sessions[1]!, sessions, universe, previous: [], events: [event('B',['issuer'],true)], cutoff: Date.parse('2026-11-03T14:00:00Z') });
  const removed = updateEarlyWatch({ session: sessions[2]!, sessions, universe, previous: [], events: [event('B',['issuer'],true)],
    disprovenEvents: [{ securityId: 'B', eventId: 'event:B' }], cutoff: Date.parse('2026-11-04T14:00:00Z') });
  expect(removed.active).toEqual([]);
  expect(removed.history[0]!.status).toBe('disproven_event');
  const old = first.active.map(e => ({ ...e, firstSession: '2026-01-01' }));
  const expired = updateEarlyWatch({ session: sessions[5]!, sessions, universe, previous: old, events: [], cutoff: Date.parse('2026-11-09T14:00:00Z') });
  expect(expired.active).toEqual([]);
  expect(expired.history[0]!.status).toBe('expired');
});

it('combines contradictory notes by event without removing a distinct newer verified event', () => {
  const positive = event('B',['issuer'],true), negative = { ...positive, contradicted: true };
  const conflict = updateEarlyWatch({ session: sessions[1]!, sessions, universe, previous: [], events: [negative,positive], cutoff: Date.parse('2026-11-03T14:00:00Z') });
  expect(conflict.active).toEqual([]);
  const previous = updateEarlyWatch({ session: sessions[1]!, sessions, universe, previous: [], events: [{ ...positive, eventId: 'verified-new-event' }], cutoff: Date.parse('2026-11-03T14:00:00Z') }).active;
  const retained = updateEarlyWatch({ session: sessions[2]!, sessions, universe, previous, events: [negative],
    disprovenEvents: [{ securityId: 'B', eventId: positive.eventId }], cutoff: Date.parse('2026-11-04T14:00:00Z') });
  expect(retained.active.map(e => e.eventId)).toEqual(['verified-new-event']);
});
