import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { researchFixture } from './helpers/research';
import { Outcomes } from '../src/outcomes/store';
import { Foundation } from '../src/persistence';
import { MarketCapture } from '../src/market/capture';
import { instant } from '../src/market/calendar';

it('freezes all universe members, closes initial acquisition on its deadline and appends a correction without changing history', async () => {
  const f = await researchFixture('outcome-history','2026-11-03',false,['A','Z']);
  const snapshot = (await f.capture.snapshot(f.snapshotId,0,0))!;
  await new Outcomes(f.foundation,() => snapshot.startedAt).plan(f.lease,f.snapshotId);
  expect((await new Outcomes(f.foundation,() => snapshot.startedAt).members(f.snapshotId,20)).items.map(r => [r.securityId,r.outcome.status])).toEqual([['A','pending'],['Z','pending']]);
  await f.foundation.release(f.lease,snapshot.startedAt);
  const days = snapshot.calendar.filter(s => s.date>=snapshot.reportDate), endpoint = days[19]!, next = days[20]!;
  let now = instant(next.date,'08:00','Europe/Zagreb');
  const foundation = new Foundation(env.DB), run = await foundation.enqueue('outcome-mature',{},now), lease = (await foundation.claim(run.id,'outcomes',now))!;
  const outcomes = new Outcomes(foundation,() => now), capture = new MarketCapture(foundation,() => now);
  try {
    const initial = await outcomes.calculate(lease,f.snapshotId,'A',20);
    expect(initial.value).toMatchObject({ status: 'unresolved', reason: 'missing_reference' });
    now += 1000; await foundation.renew(lease,now);
    await capture.ingest(lease,f.snapshotId,{ task: 'opening:late', page: 0, nextToken: null, observations: [{ securityId: 'A',kind:'opening',symbol:'A',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:snapshot.open,session:snapshot.reportDate,actionVersion:'v1',mappingVersion:'v1',value:{t:new Date(snapshot.open).toISOString(),p:'100',x:'N',c:'Q'} }] });
    // A completed action request with retained terminal page establishes the queried interval, including empty responses.
    await capture.plan(lease,f.snapshotId,[{id:'outcome:actions:test',kind:'actions',basis:'raw',start:snapshot.reportDate,end:endpoint.date,securities:[(await capture.decision(f.snapshotId,'A'))!.identity!] }]);
    await capture.ingest(lease,f.snapshotId,{task:'outcome:actions:test',page:0,nextToken:null,observations:[]});
    await capture.taskCheckpoint(lease,f.snapshotId,(await capture.tasks(f.snapshotId)).find(t => t.id==='outcome:actions:test')!);
    await capture.plan(lease,f.snapshotId,[{id:'outcome:close:test',kind:'bars',basis:'raw',start:snapshot.reportDate,end:endpoint.date,securities:[(await capture.decision(f.snapshotId,'A'))!.identity!] }]);
    await capture.ingest(lease,f.snapshotId,{task:'outcome:close:test',page:0,nextToken:null,observations:days.slice(0,20).map(s => ({securityId:'A',kind:'daily',symbol:'A',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:instant(s.date,s.close,'America/New_York'),session:s.date,actionVersion:'v1',mappingVersion:'v1',value:{c:'110'}}))});
    expect((await outcomes.calculate(lease,f.snapshotId,'A',20)).id).toBe(initial.id);
    const correction = await outcomes.calculate(lease,f.snapshotId,'A',20,'Late official Q and close acquisition');
    expect(correction.value).toMatchObject({status:'resolved',gross:'0.100000000000'});
    expect(correction.revisionOf).toBe(initial.id);
    expect((await outcomes.history(f.snapshotId,'A',20)).map(r => r.value.status)).toEqual(['unresolved','resolved']);
    expect((await outcomes.members(f.snapshotId,20)).items).toHaveLength(2);
    now += 1000;
    await capture.ingest(lease,f.snapshotId,{task:'outcome:actions:dividend',page:0,nextToken:null,observations:[{securityId:'A',kind:'action',symbol:'A',asof:snapshot.reportDate,feed:'not_applicable',basis:'raw',eventAt:0,session:days[2]!.date,actionVersion:'v1',mappingVersion:'v1',value:{id:'dividend-event',cash:'1',verification:'unverified_provider_record'}}]});
    const unknown = await outcomes.calculate(lease,f.snapshotId,'A',20,'New unverified action');
    expect(unknown.value).toMatchObject({status:'unresolved',reason:'unresolved_action'});
    const action = (await capture.observations('A')).find(o => o.kind==='action')!;
    await outcomes.reviewAction(lease,{inputId:action.id,reason:'Verified USD dividend and ex-date against issuer notice',evidence:['https://example.com/issuer-dividend'],currency:'USD',timing:'verified_effective_session',order:0,entitlement:{kind:'dividend',cash:'1'}});
    const verified = await outcomes.calculate(lease,f.snapshotId,'A',20,'Verified gross dividend receivable');
    expect(verified.value).toMatchObject({status:'resolved',gross:'0.110000000000'});
    expect(verified.revisionOf).toBe(unknown.id);

    expect((await f.capture.snapshot(f.snapshotId))!.decisions.map(d => d.identity?.securityId)).toEqual(['A','Z']);
    await expect(env.DB.prepare('UPDATE outcome_revisions SET reason=? WHERE id=?').bind('overwrite',initial.id).run()).rejects.toThrow('immutable outcome');
  } finally { await foundation.release(lease,now); }
});
