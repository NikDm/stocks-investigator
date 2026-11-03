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
    now += 1000;
    await capture.ingest(lease,f.snapshotId,{ task:'opening:corrected',page:0,nextToken:null,observations:[{securityId:'A',kind:'opening',symbol:'A',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:snapshot.open,session:snapshot.reportDate,actionVersion:'v1',mappingVersion:'v1',value:{t:new Date(snapshot.open).toISOString(),p:'101',x:'N',c:'Q'}}] });
    const correctedOpen=await outcomes.calculate(lease,f.snapshotId,'A',20,'Sourced correction to the same official Q event');
    expect(correctedOpen.value).toMatchObject({status:'resolved',gross:'0.099009900990'});
    now += 1000;
    await capture.ingest(lease,f.snapshotId,{task:'outcome:actions:corrected-date',page:0,nextToken:null,observations:[{securityId:'A',kind:'action',symbol:'A',asof:snapshot.reportDate,feed:'not_applicable',basis:'raw',eventAt:0,session:days[3]!.date,actionVersion:'v1',mappingVersion:'v1',value:{id:'dividend-event',cash:'1',verification:'unverified_provider_record'}}]});
    const correctedAction=(await capture.observations('A')).find(o => o.kind==='action' && o.session===days[3]!.date)!;
    await outcomes.reviewAction(lease,{inputId:correctedAction.id,reason:'Issuer corrected ex-date',evidence:['https://example.com/corrected-dividend'],currency:'USD',timing:'verified_effective_session',order:0,entitlement:{kind:'dividend',cash:'1'}});
    const correctedDate=await outcomes.calculate(lease,f.snapshotId,'A',20,'Sourced corrected dividend ex-date');
    expect(correctedDate.value).toMatchObject({status:'resolved',gross:'0.099009900990'});
    expect(correctedDate.inputs.actions).toHaveLength(1);


    expect((await f.capture.snapshot(f.snapshotId))!.decisions.map(d => d.identity?.securityId)).toEqual(['A','Z']);
    await expect(env.DB.prepare('UPDATE outcome_revisions SET reason=? WHERE id=?').bind('overwrite',initial.id).run()).rejects.toThrow('immutable outcome');
  } finally { await foundation.release(lease,now); }
});

it('gives selected and unselected frozen members identical reference outcomes through individual and partition calculations', async () => {
  const f=await researchFixture('outcome-parity','2026-11-03',false,['B','Y']);
  const snapshot=(await f.capture.snapshot(f.snapshotId,0,0))!, days=snapshot.calendar.filter(s => s.date>=snapshot.reportDate);
  await f.foundation.release(f.lease,snapshot.startedAt);
  let now=snapshot.referenceDeadline-1000;
  const openingRun=await f.foundation.enqueue('outcome-parity-opening',{},now), openingLease=(await f.foundation.claim(openingRun.id,'opening',now))!;
  const capture=new MarketCapture(f.foundation,()=>now);
  for (const securityId of ['B','Y']) await capture.ingest(openingLease,f.snapshotId,{task:`opening:${securityId}`,page:0,nextToken:null,observations:[{securityId,kind:'opening',symbol:securityId,asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:snapshot.open,session:snapshot.reportDate,actionVersion:'v1',mappingVersion:'v1',value:{t:new Date(snapshot.open).toISOString(),p:'100',x:'N',c:'Q'}}]});
  await f.foundation.release(openingLease,now);
  const deadline=instant(days[20]!.date,'08:00','Europe/Zagreb'); now=deadline-1000;
  const endpointRun=await f.foundation.enqueue('outcome-parity-endpoint',{},now), endpointLease=(await f.foundation.claim(endpointRun.id,'endpoint',now))!;
  const identities=(await f.capture.snapshot(f.snapshotId))!.decisions.map(d=>d.identity!);
  await capture.plan(endpointLease,f.snapshotId,[{id:'outcome:parity:closes',kind:'bars',basis:'raw',start:snapshot.reportDate,end:days[19]!.date,securities:identities},{id:'outcome:parity:actions',kind:'actions',basis:'raw',start:snapshot.reportDate,end:days[19]!.date,securities:identities}]);
  await capture.ingest(endpointLease,f.snapshotId,{task:'outcome:parity:closes',page:0,nextToken:null,observations:identities.flatMap(identity => days.slice(0,20).map(s=>({securityId:identity.securityId,kind:'daily',symbol:identity.symbol,asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:instant(s.date,s.close,'America/New_York'),session:s.date,actionVersion:'v1',mappingVersion:'v1',value:{c:'110'}})))});
  await capture.ingest(endpointLease,f.snapshotId,{task:'outcome:parity:actions',page:0,nextToken:null,observations:[]});
  await capture.taskCheckpoint(endpointLease,f.snapshotId,(await capture.tasks(f.snapshotId)).find(t=>t.id==='outcome:parity:actions')!);
  const outcomes=new Outcomes(f.foundation,()=>now); await outcomes.plan(endpointLease,f.snapshotId);
  await expect(outcomes.calculate(endpointLease,f.snapshotId,'B',20)).rejects.toThrow('initial acquisition still open');
  now=deadline; await f.foundation.renew(endpointLease,now);
  try {
    const selected=await outcomes.calculate(endpointLease,f.snapshotId,'B',20);
    await outcomes.tick(endpointLease);
    const unselected=(await outcomes.latest(f.snapshotId,'Y',20))!;
    expect(selected.value).toMatchObject({status:'resolved',gross:'0.100000000000',adjusted:'0.097802197802'});
    expect(unselected.value).toMatchObject({status:'resolved',gross:selected.value.gross,adjusted:selected.value.adjusted,downside:selected.value.downside});
    expect((await outcomes.members(f.snapshotId,20)).items.map(m=>m.outcome.status)).toEqual(['resolved','resolved']);
    for (const [page,price] of [[1,'120'],[2,'110']] as const) {
      now+=1000;
      await capture.ingest(endpointLease,f.snapshotId,{task:'outcome:parity:closes',page,nextToken:null,observations:[{securityId:'B',kind:'daily',symbol:'B',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:instant(days[19]!.date,days[19]!.close,'America/New_York'),session:days[19]!.date,actionVersion:'v1',mappingVersion:'v1',value:{c:price}}]});
      const correction=await outcomes.calculate(endpointLease,f.snapshotId,'B',20,`Sourced endpoint revision ${page}`);
      expect(correction.value.gross).toBe(page===1 ? '0.200000000000' : '0.100000000000');
    }

  } finally { await f.foundation.release(endpointLease,now); }
});

it('preserves venue, condition and nanosecond auction identity and accepts sourced reversions', async () => {
  const f=await researchFixture('outcome-auction-revisions','2026-11-03',false,['C']);
  const snapshot=(await f.capture.snapshot(f.snapshotId,0,0))!, days=snapshot.calendar.filter(s=>s.date>=snapshot.reportDate);
  await f.foundation.release(f.lease,snapshot.startedAt);
  let now=instant(days[20]!.date,'08:00','Europe/Zagreb');
  const run=await f.foundation.enqueue('outcome-auction-correction',{},now), lease=(await f.foundation.claim(run.id,'auction-correction',now))!;
  const outcomes=new Outcomes(f.foundation,()=>now), capture=new MarketCapture(f.foundation,()=>now);
  const t=new Date(snapshot.open).toISOString().replace('.000Z','.000000001Z');
  const acquire=async (key:string,p:string,x='N',c='Q',timestamp=t) => {
    now+=1000;
    await capture.ingest(lease,f.snapshotId,{task:key,page:0,nextToken:null,observations:[{securityId:'C',kind:'opening',symbol:'C',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:snapshot.open,session:snapshot.reportDate,actionVersion:'v1',mappingVersion:'v1',value:{t:timestamp,p,x,c}}]});
  };
  try {
    await outcomes.calculate(lease,f.snapshotId,'C',20);
    await acquire('primary-Q','100'); await acquire('other-venue','90','P'); await acquire('condition-O','80','N','O');
    expect((await outcomes.calculate(lease,f.snapshotId,'C',20,'Retained primary Q')).inputs.reference?.price).toBe('100');
    await acquire('distinct-primary-Q','101','N','Q',t.replace('001Z','002Z'));
    expect((await outcomes.calculate(lease,f.snapshotId,'C',20,'Distinct primary Q conflict')).inputs.reference).toBeNull();
    await acquire('corrected-primary-Q','101');
    expect((await outcomes.calculate(lease,f.snapshotId,'C',20,'Same-event sourced correction')).inputs.reference?.price).toBe('101');
    await acquire('reverted-primary-Q','100');
    expect((await outcomes.calculate(lease,f.snapshotId,'C',20,'Sourced reversion preserves distinct-event conflict')).inputs.reference).toBeNull();
    await acquire('reverted-second-Q','100','N','Q',t.replace('001Z','002Z'));
    expect((await outcomes.calculate(lease,f.snapshotId,'C',20,'Both distinct events corrected to 100')).inputs.reference?.price).toBe('100');
  } finally {await f.foundation.release(lease,now);}
});
