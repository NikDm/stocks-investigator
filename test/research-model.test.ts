import { expect, it } from 'vitest';
import { AnthropicResearchModel, proposedModelId } from '../src/research/model';

const now = Date.parse('2026-11-03T06:30:00Z');
const record = { pricingVerifiedAt: now, inputMicrodollarsPerToken: 1 as const, outputMicrodollarsPerToken: 5 as const, qualityFixtureVersion: 'research-fixtures-v1' as const };
it('checks account availability and exact input count before any billed model call and never upgrades', async () => {
  const paths: string[] = [];
  const model = await AnthropicResearchModel.verified('fixture-secret',record,() => now,async request => {
    const url = new URL(String(request)); paths.push(url.pathname);
    return new Response(JSON.stringify(url.pathname.includes('/models/') ? { id: proposedModelId } : { input_tokens: 200 }),{ headers: { 'Content-Type': 'application/json' } });
  });
  await expect(model.complete({ system: 'Policy', context: 'Untrusted data', inputBound: 100, maxOutput: 100 },new AbortController().signal)).rejects.toThrow('input_bound');
  expect(paths).toEqual([`/v1/models/${proposedModelId}`,'/v1/messages/count_tokens']);
  await expect(AnthropicResearchModel.verified('fixture-secret',{ ...record, pricingVerifiedAt: now-31*86400000 },() => now)).rejects.toThrow('verification');
  await expect(AnthropicResearchModel.verified('fixture-secret',record,() => now,async () => new Response(JSON.stringify({ id: 'different-model' }),{ headers: { 'Content-Type': 'application/json' } }))).rejects.toThrow();
});
