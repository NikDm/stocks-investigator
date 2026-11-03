import { expect, it } from 'vitest';
import { researchFixture, researchNow as now } from './helpers/research';
import { ResearchRuntime } from '../src/research/runtime';

it('completes checkpointed research with explicit gaps and no outbound calls when live verification is absent', async () => {
  const { foundation, lease, screener } = await researchFixture('research:disabled');
  try {
    const runtime = await ResearchRuntime.create(foundation,lease,{ RESEARCH_ENABLED: 'true' },() => now,async () => { throw new Error('No network request is permitted'); });
    for (let i=0;i<10 && !await runtime.step(lease,'research:disabled',now+1000);i++) {}
    const result = (await runtime.publisher.publication('research:disabled'))!;
    expect(result.decisions.map(d => d.outcome)).toEqual(['unresearched','unresearched','unresearched']);
    expect(result.status).toBe('partial');
    expect((await runtime.intake.publication('research:disabled'))!.gaps).toContain('intake_model_unavailable');
    expect((await screener.result('research:disabled'))!.baseline).toEqual(['A','B','C']);
  } finally { await foundation.release(lease,now); }
});
