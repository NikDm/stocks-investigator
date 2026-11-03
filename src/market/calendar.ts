import { z } from 'zod';

export const dateSchema = z.iso.date();
export const calendarSchema = z.array(z.object({ date: dateSchema, open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) })).min(1);
export type Session = z.infer<typeof calendarSchema>[number];
export function localDate(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function instant(date: string, time: string, zone: string) {
  dateSchema.parse(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('invalid time');
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = formatter.formatToParts(guess);
    const get = (key: string) => p.find(v => v.type === key)!.value;
    const rendered = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
    if (rendered === target) return guess;
    guess += target - rendered;
  }
  throw new Error('unresolved local time');
}
export function schedule(reportDate: string, raw: Session[], from: string, through: string) {
  const sessions = calendarSchema.parse(raw).sort((a,b) => a.date.localeCompare(b.date));
  dateSchema.parse(from); dateSchema.parse(through);
  if (from >= reportDate || through <= reportDate || new Set(sessions.map(s => s.date)).size !== sessions.length
    || sessions.some(s => s.date < from || s.date > through)) throw new Error('incomplete calendar');
  for (const session of sessions) if (instant(session.date, session.open, 'America/New_York') >= instant(session.date, session.close, 'America/New_York')) throw new Error('invalid session');
  const current = sessions.find(s => s.date === reportDate);
  const previous = sessions.filter(s => s.date < reportDate).at(-1);
  const next = sessions.find(s => s.date > reportDate);
  if (!current || !previous || !next) throw new Error('not a report session or calendar incomplete');
  const open = instant(current.date, current.open, 'America/New_York');
  return { expectedSession: previous.date, deadline: instant(reportDate, '08:00', 'Europe/Zagreb'),
    open, close: instant(current.date, current.close, 'America/New_York'), auctionAfter: open + 45 * 60000,
    referenceDeadline: instant(next.date, '08:00', 'Europe/Zagreb'), sessions };
}
