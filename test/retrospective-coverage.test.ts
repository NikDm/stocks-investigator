import { expect, it } from 'vitest';
import { researchFixture } from './helpers/research';
import { retrospectiveView } from '../src/outcomes/retrospective';
import type { Outcome } from '../src/outcomes/calculate';

it('ranks top ten across the complete saved universe, excludes historical outsiders and ignores a later broker universe', async () => {
  const f = await researchFixture('retrospective-scale-seed','2026-11-05',false,['A']);
  const snapshot = (await f.capture.snapshot(f.snapshotId,0,0))!;
  const original = (await f.capture.snapshot(f.snapshotId))!.decisions[0]!;
  const id = 'retrospective-scale', total = 5078, time = snapshot.startedAt;
  const members = Array.from({length:total},(_,i) => {
    const name = `S${String(i).padStart(5,'0')}`;
    return {...original,ticker:name,identity:{...original.identity!,securityId:name,symbol:name,brokerTicker:name}};
  });
  const excluded = {...original,ticker:'OUTSIDE',reason:'history_missing',identity:{...original.identity!,securityId:'OUTSIDE'}};
  const db = f.foundation.db;
  let released = false;
  try {
    // Seed immutable saved artifacts at the agreed universe/outcomes → view boundary.
    await f.foundation.fenced(f.lease,time,[db.prepare('INSERT INTO market_snapshots(id,run_id,fingerprint,manifest,report_date,horizon_end) VALUES(?,?,?,?,?,?)')
      .bind(id,f.lease.runId,'retrospective-scale-fixture',JSON.stringify({...snapshot,id}),snapshot.reportDate,'2026-12-16')]);
    const decisions = [...members,excluded];
    for (let offset=0;offset<decisions.length;offset+=100) await f.foundation.fenced(f.lease,time,[db.prepare(`INSERT INTO market_decisions(snapshot_id,ticker,security_id,reason,value)
      SELECT ?,json_extract(value,'$.ticker'),json_extract(value,'$.identity.securityId'),json_extract(value,'$.reason'),value FROM json_each(?)`).bind(id,JSON.stringify(decisions.slice(offset,offset+100)))]);
    const morning = {universe:{snapshotId:id,count:total},inputHash:'frozen-hash',main:['S00000'],baseline:['S00000','S00001'],decisions:[],watch:{active:[]},status:'complete'};
    await f.foundation.fenced(f.lease,time,[db.prepare('UPDATE market_snapshots SET frozen=1 WHERE id=?').bind(id),
      db.prepare('INSERT INTO morning_reports(id,run_id,report_date,rule_version,cutoff,deadline,artifact_at,hash,value) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(id,f.lease.runId,snapshot.reportDate,snapshot.ruleVersion,time,snapshot.deadline,time,'fixture',JSON.stringify(morning))]);
    const result:Outcome = {endpoint:'2026-12-03',sensitivity0:'0.1',inputIds:[],status:'resolved',reason:null,gross:'0.1',adjusted:'0.097802197802',sensitivity25:'0.094513715711',downside:{status:'complete',value:'-0.20',observed:20,expected:20}};
    for (let offset=0;offset<total-1;offset+=100) {
      const rows = members.slice(offset,Math.min(offset+100,total-1)).map((d,i) => ({securityId:d.identity.securityId,
        // The largest return is on the last page, tied with the preceding member.
        outcome:{...result,adjusted:offset+i>=total-3 ? '0.2' : result.adjusted}}));
      await f.foundation.fenced(f.lease,time,[db.prepare(`INSERT INTO outcome_revisions(id,snapshot_id,security_id,horizon,kind,cutoff,recorded_at,reason,input_hash,inputs,value)
        SELECT ?||json_extract(value,'$.securityId'),?,json_extract(value,'$.securityId'),20,'initial',?,?,'fixture','fixture','{}',json_extract(value,'$.outcome') FROM json_each(?)`)
        .bind(id,id,time,time,JSON.stringify(rows))]);
    }
    // New broker membership excludes the historical top performers and adds a new stock.
    await f.foundation.release(f.lease,time); released = true;
    const later = await researchFixture('retrospective-current','2026-11-06',false,['NEW']);
    await later.foundation.release(later.lease,Date.parse('2026-11-06T06:30:00Z'));
    const html = (await retrospectiveView(f.foundation,id,Date.parse('2026-12-10T12:00:00Z')))!;
    const ranked = [...html.matchAll(/data-security="([^"]+)"/g)].map(m => m[1]);
    expect(ranked).toEqual(['S05075','S05076','S00000','S00001','S00002','S00003','S00004','S00005','S00006','S00007']);
    expect(html).toContain('5077/5078 resolved; 0 pending');
    expect(html).toContain('awaiting_calculation');
    expect(html).toContain('OUTSIDE / OUTSIDE: history_missing');
    expect(html).not.toContain('data-security="NEW"');
    expect(html).toContain('AI-main');
    expect(html).toContain('baseline-only');
    expect(html).toContain('-20.00%');
  } finally { if (!released) await f.foundation.release(f.lease,time); }
},30000);
