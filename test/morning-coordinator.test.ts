import { expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { researchFixture } from './helpers/research';
import { Foundation } from '../src/persistence';
import { drainMarket, enqueueMarket } from '../src/market/runtime';
import { MorningReports } from '../src/morning/publication';
import { instant } from '../src/market/calendar';

it('resumes screening through research and evaluation planning into a certified report, preserving the same artifacts on replay', async () => {
  const date = '2026-11-06', now = Date.parse('2026-11-06T06:50:00Z');
  const { foundation, lease, snapshotId } = await researchFixture('morning:coordinator',date,true);
  await foundation.fenced(lease,Date.parse(`${date}T06:30:00Z`),[
    foundation.db.prepare("INSERT INTO market_run_state(run_id,phase) VALUES(?,'screening')").bind(lease.runId),
  ]);
  await foundation.release(lease,Date.parse(`${date}T06:30:00Z`));
  // The run's real command remains an authorized market morning command.
  await foundation.db.prepare('UPDATE runs SET payload=? WHERE id=?').bind(JSON.stringify({ kind: 'market', reportDate: date, seed: false }),lease.runId).run();
  for (let i=0;i<10 && (await foundation.run(lease.runId))?.state!=='completed';i++) {
    await drainMarket(foundation,{},(await foundation.run(lease.runId))!,() => now,async () => { throw new Error('No live calls'); });
  }
  const reports = new MorningReports(foundation,() => now), result = await reports.get(snapshotId);
  expect(result?.timing).toBe('on_time');
  expect(result?.value.baseline).toEqual(['A','B','C']);
  expect(result?.value.status).toBe('partial');
  expect((await foundation.run(lease.runId))?.state).toBe('completed');
  await drainMarket(foundation,{},(await foundation.run(lease.runId))!,() => now);
  expect((await reports.get(snapshotId))?.hash).toBe(result?.hash);
});

it('uses exchange sessions and Zagreb DST for due ticks and independently records a missing current report after 08:00', async () => {
  const { foundation, lease } = await researchFixture('morning:schedule','2026-11-02');
  await foundation.release(lease,Date.parse('2026-11-02T06:30:00Z'));
  const count = async (date: string) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE json_extract(payload,'$.kind')='market' AND json_extract(payload,'$.reportDate')=?").bind(date).first<{ n: number }>())!.n;
  await enqueueMarket(foundation,() => instant('2026-11-26','06:35','Europe/Zagreb'));
  expect(await count('2026-11-26')).toBe(0);
  await enqueueMarket(foundation,() => instant('2026-11-03','06:29','Europe/Zagreb'));
  expect(await count('2026-11-03')).toBe(0);
  await enqueueMarket(foundation,() => instant('2026-11-03','06:30','Europe/Zagreb'));
  expect(await count('2026-11-03')).toBe(1);
  await enqueueMarket(foundation,() => instant('2026-11-03','08:01','Europe/Zagreb'));
  expect(await env.DB.prepare("SELECT code FROM morning_due_events WHERE report_date='2026-11-03'").first()).toEqual({ code: 'overdue' });
  // EU has left DST while the US has not on this date.
  expect(instant('2026-10-28','06:30','Europe/Zagreb')).toBe(Date.parse('2026-10-28T05:30:00Z'));
  expect(instant('2026-10-28','09:30','America/New_York')).toBe(Date.parse('2026-10-28T13:30:00Z'));
});
