import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';
import { MorningReports } from '../src/morning/publication';
import { planEvaluation } from '../src/market/evaluation';
import { retrospectiveView } from '../src/outcomes/retrospective';

it('shows an honest pending denominator from the saved morning universe', async () => {
  const f = await researchFixture('retrospective-pending');
  try {
    const runtime = await ResearchRuntime.create(f.foundation,f.lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(f.lease,f.snapshotId,now+1000);i++) {}
    await planEvaluation(f.capture,f.lease,f.snapshotId,'2026-11-02');
    const reports = new MorningReports(f.foundation,() => now);
    await reports.publish(f.lease,f.snapshotId);
    const html = (await retrospectiveView(f.foundation,f.snapshotId,now))!;
    expect(html).toContain('0/9 resolved; 9 pending');
    expect(html).toContain('No resolved H20 outcomes');
    expect(html).toContain('Not surfaced means absent from morning AI main');
    expect(html).toContain('Coverage ledger');
    expect(html).toContain('H10 coverage: 0/9 resolved; 9 pending');
    expect(html).toContain('H30 coverage: 0/9 resolved; 9 pending');
    expect(await retrospectiveView(f.foundation,'missing',now)).toBeNull();
  } finally { await f.foundation.release(f.lease,now); }
});

it('ranks retained members with equal returns by stable identity and keeps missing outcomes counted', async () => {
  const f = await researchFixture('retrospective-ranked','2026-11-04',false,['A','B','Z']);
  const snapshot = (await f.capture.snapshot(f.snapshotId,0,0))!;
  let time = snapshot.startedAt;
  try {
    const runtime = await ResearchRuntime.create(f.foundation,f.lease,{},() => time);
    for (let i=0;i<15 && !await runtime.step(f.lease,f.snapshotId,time+1000);i++) {}
    await planEvaluation(f.capture,f.lease,f.snapshotId,'2026-11-03');
    await new MorningReports(f.foundation,() => time).publish(f.lease,f.snapshotId);
  } finally { await f.foundation.release(f.lease,time); }
  const days = snapshot.calendar.filter(s => s.date>=snapshot.reportDate);
  time = Date.parse(`${days[21]!.date}T12:00:00Z`);
  const run = await f.foundation.enqueue('retrospective-ranked-mature',{},time);
  const lease = (await f.foundation.claim(run.id,'retrospective',time))!;
  const { MarketCapture } = await import('../src/market/capture');
  const { Outcomes } = await import('../src/outcomes/store');
  const capture = new MarketCapture(f.foundation,() => time);
  const outcomes = new Outcomes(f.foundation,() => time);
  try {
    // Only the saved universe is authoritative; a later broker snapshot drops A.
    const identities = ['A','B'].map(securityId => ({securityId,symbol:securityId}));
    await capture.ingest(lease,f.snapshotId,{task:'opening:retrospective',page:0,nextToken:null,observations:identities.map(i => ({...i,kind:'opening',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:snapshot.open,session:snapshot.reportDate,actionVersion:'v1',mappingVersion:'v1',value:{t:new Date(snapshot.open).toISOString(),p:'100',x:'N',c:'Q'}}))});
    await capture.plan(lease,f.snapshotId,[{id:'outcome:actions:retrospective',kind:'actions',basis:'raw',start:snapshot.reportDate,end:days[19]!.date,securities:(await f.capture.snapshot(f.snapshotId))!.decisions.map(d => d.identity!)}]);
    await capture.ingest(lease,f.snapshotId,{task:'outcome:actions:retrospective',page:0,nextToken:null,observations:[]});
    await capture.taskCheckpoint(lease,f.snapshotId,(await capture.tasks(f.snapshotId)).find(t => t.id==='outcome:actions:retrospective')!);
    await capture.plan(lease,f.snapshotId,[{id:'outcome:closes:retrospective',kind:'bars',basis:'raw',start:snapshot.reportDate,end:days[19]!.date,securities:(await f.capture.snapshot(f.snapshotId))!.decisions.map(d => d.identity!)}]);
    await capture.ingest(lease,f.snapshotId,{task:'outcome:closes:retrospective',page:0,nextToken:null,observations:identities.flatMap(i => days.slice(0,20).map(s => ({...i,kind:'daily',asof:snapshot.reportDate,feed:'sip',basis:'raw',eventAt:Date.parse(`${s.date}T21:00:00Z`),session:s.date,actionVersion:'v1',mappingVersion:'v1',value:{c:'110'}})))});
    for (const id of ['B','A']) {
      await outcomes.calculate(lease,f.snapshotId,id,20);
      await outcomes.calculate(lease,f.snapshotId,id,20,'Retrospective test: late retained data correction');
    }
    const html = (await retrospectiveView(f.foundation,f.snapshotId,time))!;
    expect(html).toContain('2/3 resolved; 0 pending');
    expect(html).toContain('awaiting_calculation');
    expect(html).toContain('9.78%');
    expect(html.indexOf('data-security="A"')).toBeLessThan(html.indexOf('data-security="B"'));
    expect(html).toContain('correction');
    expect(html).toContain('H10');
    expect(html).toContain('H30');
  } finally { await f.foundation.release(lease,time); }
});
