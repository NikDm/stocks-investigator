import { z } from 'zod';
import { Foundation, type Lease } from '../persistence';
import { MarketCapture } from '../market/capture';
import { ResearchPublisher } from './publisher';
import { ResearchTools } from './tools';
import { AnthropicResearchModel, type ModelVerification } from './model';
import { BoundedResearcher, type ResearchModel } from './researcher';
import { ResearchIntake, issuerMappingsSchema } from './intake';

export type ResearchEnv = { RESEARCH_ENABLED?: string; ANTHROPIC_API_KEY?: string; BRAVE_SEARCH_KEY?: string; SEC_USER_AGENT?: string;
  RESEARCH_MODEL_VERIFICATION?: string; RESEARCH_ISSUER_MAPPINGS?: string };
const verificationSchema = z.object({ pricingVerifiedAt: z.number().int().nonnegative(), inputMicrodollarsPerToken: z.literal(1),
  outputMicrodollarsPerToken: z.literal(5), qualityFixtureVersion: z.literal('research-fixtures-v1') }).strict();
// Conservative local stage allowance. Actual combined hosted CPU/heap remains a deployment gate.
export const RESEARCH_STAGE_CPU_RESERVATION_MS = 1500;
export class ResearchRuntime {
  private constructor(readonly publisher: ResearchPublisher, readonly researcher: BoundedResearcher, readonly intake: ResearchIntake,
    readonly clock: () => number) {}
  static async create(store: Foundation, lease: Lease, env: ResearchEnv, clock: () => number = Date.now, fetcher: typeof fetch = fetch) {
    let model: ResearchModel | null = null;
    if (env.RESEARCH_ENABLED==='true' && env.ANTHROPIC_API_KEY && env.RESEARCH_MODEL_VERIFICATION) {
      try {
        const record: ModelVerification = verificationSchema.parse(JSON.parse(env.RESEARCH_MODEL_VERIFICATION));
        model = await AnthropicResearchModel.verified(env.ANTHROPIC_API_KEY,record,clock,fetcher);
      } catch { /* Missing/expired/account-unavailable verification is an explicit model gap. */ }
    }
    const publisher = new ResearchPublisher(store,clock), config = { secUserAgent: env.SEC_USER_AGENT ?? '', ...(env.BRAVE_SEARCH_KEY ? { braveKey: env.BRAVE_SEARCH_KEY } : {}) };
    let mappings: z.infer<typeof issuerMappingsSchema> = [];
    try { mappings = issuerMappingsSchema.parse(JSON.parse(env.RESEARCH_ISSUER_MAPPINGS ?? '[]')); } catch {}
    const tools = new ResearchTools(store,lease,{ ...config, issuerCiks: Object.fromEntries(mappings.map(m => [m.securityId,m.cik])) },clock,fetcher);
    return new ResearchRuntime(publisher,new BoundedResearcher(publisher,tools,model,clock),new ResearchIntake(publisher,tools,model,mappings,clock),clock);
  }
  async step(lease: Lease, snapshotId: string, deadline: number): Promise<boolean> {
    if (!await this.publisher.plan(snapshotId)) {
      const snapshot = await new MarketCapture(this.publisher.foundation,this.clock).snapshot(snapshotId,0,0);
      if (!snapshot || snapshot.cutoff===null) throw new Error('frozen snapshot required');
      await this.publisher.begin(lease,snapshotId,{ cutoff: Math.max(snapshot.cutoff,snapshot.deadline-10*60000), expiresAt: snapshot.referenceDeadline });
    }
    const plan = (await this.publisher.plan(snapshotId))!;
    this.researcher.tools.config.issuerCiks = Object.fromEntries(this.intake.mappings.filter(m => plan.queue.some(q => q.securityId===m.securityId && q.issuerId===m.issuerId)).map(m => [m.securityId,m.cik]));
    if (!await this.intake.step(lease,snapshotId,deadline)) return false;
    return this.researcher.step(lease,snapshotId,deadline);
  }
}
