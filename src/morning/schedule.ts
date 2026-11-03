import { Foundation } from '../persistence';
import { instant, localDate } from '../market/calendar';
import type { Snapshot } from '../market/types';
export async function morningStatus(store: Foundation, now: number) {
  const date = localDate(now,'Europe/Zagreb'), deadline = instant(date,'08:00','Europe/Zagreb');
  const row = await store.db.prepare('SELECT manifest FROM market_snapshots WHERE report_date<=? ORDER BY report_date DESC,id DESC LIMIT 1').bind(date).first<{ manifest: string }>();
  const snapshot = row ? JSON.parse(row.manifest) as Snapshot : null;
  const known = snapshot && snapshot.calendarFrom<=date && snapshot.calendarThrough>=date;
  const session = known ? snapshot.calendar.find(s => s.date===date) : undefined;
  const current = await store.db.prepare('SELECT id FROM morning_reports WHERE report_date=?').bind(date).first<{ id: string }>();
  return { date, deadline, session: !known ? 'unknown' as const : session ? 'open' as const : 'closed' as const, expectedSession: known ? snapshot.calendar.filter(s => s.date<date).at(-1)?.date ?? null : null,
    state: !known ? 'Calendar unavailable; current session unverified' : !session ? 'Exchange closed; no morning report due'
      : current ? 'Current trading day' : now>=deadline ? 'Overdue / unavailable: current morning report missing' : 'Current morning report pending' };
}
