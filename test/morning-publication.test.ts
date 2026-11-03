import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';
import { MorningReports } from '../src/morning/publication';
import { planEvaluation } from '../src/market/evaluation';

it('freezes a partial morning with its exact baseline and universe, then certifies observed availability without contradictory replay', async () => {
  const id = 'morning:publication';
  const { foundation, lease, capture } = await researchFixture(id);
  try {
    const runtime = await ResearchRuntime.create(foundation,lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(lease,id,now+1000);i++) {}
    await planEvaluation(capture,lease,id,'2026-11-02');
    const reports = new MorningReports(foundation,() => now);
    const report = await reports.publish(lease,id);
    expect(report.value.status).toBe('partial');
    expect(report.value.baseline).toEqual(['A','B','C']);
    expect(report.value.main).toEqual([]);
    expect(report.value.universe.count).toBe(9);
    expect(report.timing).toBe('unverified');
    expect(report.value.decisions.map(d => d.outcome)).toEqual(['unresearched','unresearched','unresearched']);
    await reports.certify(lease,id);
    expect((await reports.get(id))?.timing).toBe('on_time');
    expect((await reports.publish(lease,id)).hash).toBe(report.hash);
    const cohorts = (await foundation.db.prepare('SELECT arm,security_id FROM morning_cohorts WHERE report_id=? ORDER BY arm,security_id').bind(id).all()).results;
    expect(cohorts).toEqual(['A','B','C'].map(security_id => ({ arm: 'baseline', security_id })));
  } finally { await foundation.release(lease,now); }
});

it('keeps a committed report research-only when interrupted before certification and recovered after the deadline', async () => {
  const id = 'morning:late-recovery', now = Date.parse('2026-11-04T06:30:00Z');
  const { foundation, lease, capture } = await researchFixture(id,'2026-11-04');
  let at = now;
  try {
    const runtime = await ResearchRuntime.create(foundation,lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(lease,id,now+1000);i++) {}
    await planEvaluation(capture,lease,id,'2026-11-03');
    const reports = new MorningReports(foundation,() => at);
    await reports.publish(lease,id);
    await foundation.release(lease,now);
    at = Date.parse('2026-11-04T07:01:00Z');
    const recovered = (await foundation.claim(lease.runId,'recovery',at))!;
    await reports.certify(recovered,id);
    expect((await reports.get(id))?.timing).toBe('late');
    expect((await reports.get(id))?.receipt?.observed_at).toBe(at);
    await foundation.release(recovered,at);
  } catch (error) { await foundation.release(lease,now); throw error; }
});

it('rolls back report and cohort together when the cohort write is interrupted', async () => {
  const id = 'morning:rollback', now = Date.parse('2026-11-05T06:30:00Z');
  const { foundation, lease, capture } = await researchFixture(id,'2026-11-05');
  try {
    const runtime = await ResearchRuntime.create(foundation,lease,{},() => now);
    for (let i=0;i<15 && !await runtime.step(lease,id,now+1000);i++) {}
    const reports = new MorningReports(foundation,() => now);
    await expect(reports.publish(lease,id)).rejects.toThrow('evaluation collection');
    await planEvaluation(capture,lease,id,'2026-11-04');
    await foundation.db.prepare("CREATE TRIGGER interrupt_cohort BEFORE INSERT ON morning_cohorts BEGIN SELECT RAISE(ABORT,'interrupted transaction'); END").run();
    await expect(reports.publish(lease,id)).rejects.toThrow('interrupted transaction');
    expect(await reports.get(id)).toBeNull();
    await foundation.db.prepare('DROP TRIGGER interrupt_cohort').run();
    expect((await reports.publish(lease,id)).value.baseline).toEqual(['A','B','C']);
    await expect(foundation.db.prepare("UPDATE morning_reports SET value='{}' WHERE id=?").bind(id).run()).rejects.toThrow('immutable');
  } finally { await foundation.release(lease,now); }
});
