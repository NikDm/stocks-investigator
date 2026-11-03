import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';
import { MorningReports } from '../src/morning/publication';
import { planEvaluation } from '../src/market/evaluation';
import { evaluationView } from '../src/outcomes/view';
import { Outcomes } from '../src/outcomes/store';

it('shows frozen pending cohorts, AI abstention and independent feedback denominators', async () => {
  const f = await researchFixture('outcome-view');
  try {
    const runtime = await ResearchRuntime.create(f.foundation,f.lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(f.lease,f.snapshotId,now+1000);i++) {}
    await planEvaluation(f.capture,f.lease,f.snapshotId,'2026-11-02');
    const reports = new MorningReports(f.foundation,() => now);
    await reports.publish(f.lease,f.snapshotId); await reports.certify(f.lease,f.snapshotId);
    const html = (await evaluationView(f.foundation,f.snapshotId,20,now))!;
    expect(html).toContain('AI abstained; no AI return is assigned.');
    expect(html).toContain('0/3 resolved; 3 pending');
    expect(html).toContain('0/1 reports responded');
    expect(html).toContain('Frozen universe (9 members)');
    expect(html).toContain('cannot establish statistical edge');
    expect((await new Outcomes(f.foundation,() => now).members(f.snapshotId,20)).items).toHaveLength(9);
    expect(await evaluationView(f.foundation,'missing',20,now)).toBeNull();
  } finally { await f.foundation.release(f.lease,now); }
});
