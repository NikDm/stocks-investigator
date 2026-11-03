import { z } from 'zod';
import type { ModelRequest, ResearchModel } from './researcher';
import { boundedResponse } from './http';

export const proposedModelId = 'claude-haiku-4-5-20251001';
export type ModelVerification = { pricingVerifiedAt: number; inputMicrodollarsPerToken: 1; outputMicrodollarsPerToken: 5;
  qualityFixtureVersion: 'research-fixtures-v1' };
// Construction requires a current operator price/quality record and an account-specific
// Models API check. Nothing silently upgrades this proposed legacy model.
export class AnthropicResearchModel implements ResearchModel {
  readonly modelId = proposedModelId;
  private constructor(private readonly key: string, private readonly fetcher: typeof fetch, private readonly clock: () => number) {}
  private headers() { return { 'x-api-key': this.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }; }
  static async verified(key: string, verification: ModelVerification, clock: () => number = Date.now, fetcher: typeof fetch = fetch) {
    if (!key || verification.qualityFixtureVersion!=='research-fixtures-v1' || verification.inputMicrodollarsPerToken!==1 || verification.outputMicrodollarsPerToken!==5
      || !Number.isSafeInteger(verification.pricingVerifiedAt) || verification.pricingVerifiedAt>clock() || clock()-verification.pricingVerifiedAt>30*86400000) throw new Error('model_verification_required');
    const model = new AnthropicResearchModel(key,fetcher,clock);
    const body = await boundedResponse(fetcher,`https://api.anthropic.com/v1/models/${proposedModelId}`,{ headers: model.headers() },clock()+20000,clock,32768,['application/json']);
    const response = z.object({ id: z.literal(proposedModelId) }).parse(JSON.parse(body));
    if (response.id!==proposedModelId) throw new Error('model_unavailable');
    return model;
  }
  async complete(request: ModelRequest, signal: AbortSignal) {
    const started = this.clock(), messages = [{ role: 'user', content: request.context }];
    const input = { model: this.modelId, system: request.system, messages };
    // Count the exact uncached context before the billed request. Estimates are never
    // permission to exceed the already reserved safe input bound.
    const countBody = await boundedResponse(this.fetcher,'https://api.anthropic.com/v1/messages/count_tokens',
      { method: 'POST', headers: this.headers(), body: JSON.stringify(input), signal },started+20000,this.clock,32768,['application/json']);
    const count = z.object({ input_tokens: z.number().int().nonnegative() }).parse(JSON.parse(countBody));
    if (signal.aborted || count.input_tokens>request.inputBound) throw new Error('model_input_bound');
    const body = await boundedResponse(this.fetcher,'https://api.anthropic.com/v1/messages',
      { method: 'POST', headers: this.headers(), body: JSON.stringify({ ...input, max_tokens: request.maxOutput }), signal },started+20000,this.clock,32768,['application/json']);
    const response = z.object({ model: z.literal(proposedModelId), content: z.array(z.object({ type: z.literal('text'), text: z.string().max(24000) })).max(4),
      usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(),
        cache_creation_input_tokens: z.number().int().nonnegative().optional(), cache_read_input_tokens: z.number().int().nonnegative().optional() }) }).parse(JSON.parse(body));
    const usage = { input: response.usage.input_tokens+(response.usage.cache_creation_input_tokens ?? 0)+(response.usage.cache_read_input_tokens ?? 0), output: response.usage.output_tokens };
    // Invalid JSON is returned as invalid output so the bounded repair can run after
    // actual billed usage is settled. Do not lose known usage on schema errors.
    let output: unknown = null;
    try { output = JSON.parse(response.content.map(c => c.text).join('')); } catch {}
    return { output, usage };
  }
}
