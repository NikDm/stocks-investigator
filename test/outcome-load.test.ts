import { expect, it } from 'vitest';
import { researchFixture } from './helpers/research';
import { Outcomes } from '../src/outcomes/store';
import { instant } from '../src/market/calendar';

it('keeps the full 5078-member frozen denominator while calculating and reading bounded partitions', async () => {
  const f = await researchFixture('outcome-scale-seed','2026-11-03',false,['A']);
  const snapshot = (await f.capture.snapshot(f.snapshotId,0,0))!;
  const decision = (await f.capture.snapshot(f.snapshotId))!.decisions[0]!;
  const id = 'outcome-scale', total = 5078;
  const decisions = Array.from({length:total},(_,i) => ({...decision,ticker:`T${String(i).padStart(5,'0')}`,identity:{...decision.identity!,securityId:`S${String(i).padStart(5,'0')}`}}));
  // Seed an already-frozen retained universe; the approved boundary starts after market eligibility.
  await f.foundation.fenced(f.lease,snapshot.startedAt,[
    f.foundation.db.prepare('INSERT INTO market_snapshots(id,run_id,fingerprint,manifest,report_date,horizon_end) VALUES(?,?,?,?,?,?)')
      .bind(id,f.lease.runId,'scale-fixture',JSON.stringify({...snapshot,id}),snapshot.reportDate,'2026-12-15'),
  ]);
  for (let offset=0;offset<decisions.length;offset+=100) await f.foundation.fenced(f.lease,snapshot.startedAt,[
    f.foundation.db.prepare(`INSERT INTO market_decisions(snapshot_id,ticker,security_id,reason,value)
      SELECT ?,json_extract(value,'$.ticker'),json_extract(value,'$.identity.securityId'),'eligible',value FROM json_each(?)`).bind(id,JSON.stringify(decisions.slice(offset,offset+100))),
  ]);
  await f.foundation.fenced(f.lease,snapshot.startedAt,[f.foundation.db.prepare('UPDATE market_snapshots SET frozen=1 WHERE id=?').bind(id)]);
  const planned = new Outcomes(f.foundation,() => snapshot.startedAt);
  await planned.plan(f.lease,id); await f.foundation.release(f.lease,snapshot.startedAt);
  const dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate), now = instant(dates[20]!.date,'08:00','Europe/Zagreb');
  const run = await f.foundation.enqueue('outcome-scale-calculation',{},now), lease = (await f.foundation.claim(run.id,'outcome-scale',now))!;
  try {
    const outcomes = new Outcomes(f.foundation,() => now), started = performance.now();
    const calculated = await outcomes.tick(lease);
    expect(calculated).toBeGreaterThan(0); expect(calculated).toBeLessThanOrEqual(240);
    const elapsed = performance.now()-started;
    expect(elapsed).toBeLessThan(15000);
    let count = 0, after = '';
    do {
      const page = await outcomes.members(id,20,after);
      expect(page.items.length).toBeLessThanOrEqual(100);
      count += page.items.length; after = page.next ?? '';
    } while (after);
    expect(count).toBe(total);
    console.info(JSON.stringify({outcomeUniverse:total,calculated,stageMs:Math.round(elapsed),pageSize:100}));
  } finally { await f.foundation.release(lease,now); }
});
