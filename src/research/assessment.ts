import { z } from 'zod';

const text = z.string().trim().min(1).max(1000);
export const evidenceSchema = z.object({
  id: z.string().min(1).max(100), securityId: z.string().min(1).max(200), url: z.url().max(2048),
  originId: z.string().min(1).max(200), eventId: z.string().min(1).max(200), primary: z.boolean(),
  publishedAt: z.number().int().nonnegative().nullable(), acquiredAt: z.number().int().nonnegative(), hash: z.string().regex(/^[a-f0-9]{64}$/),
  revisionOf: z.string().nullable(), scheduledEventAt: z.number().int().nonnegative().nullable().optional(), replayGap: z.literal('sanitized_excerpt_only').optional(), text: z.string().max(32768), retention: z.literal('public_document'),
}).strict();
export type Evidence = z.infer<typeof evidenceSchema>;
const temporal = z.enum(['time_sensitive','background']).optional();
const cited = z.object({ text, evidenceIds: z.array(z.string()).max(6), metricKeys: z.array(z.enum(['sma20','latestClose'])).max(2).optional(), temporal }).strict()
  .refine(c => c.evidenceIds.length || c.metricKeys?.length,'citation or deterministic metric required');
export const proposalSchema = z.object({
  outcome: z.enum(['accepted','rejected','insufficient_evidence']),
  thesisKind: z.enum(['supported','unexplained','undetermined']).optional(),
  validity: z.discriminatedUnion('kind',[z.object({ kind: z.literal('next_report') }).strict(),z.object({ kind: z.literal('before_open') }).strict(),z.object({ kind: z.literal('before_event'), evidenceId: z.string() }).strict()]).optional(),
  facts: z.array(z.object({ evidenceId: z.string(), quote: text, role: z.enum(['support','contradict','context']), temporal }).strict()).max(12),
  interpretations: z.array(cited).max(6), unknowns: z.array(text).max(12),
  thesis: cited.nullable(), invalidation: z.array(cited).max(6), horizonSessions: z.literal(20),
  attractiveness: z.enum(['conditional','unattractive','undetermined']), priceCondition: z.enum(['none','sma20','latest_close']),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type AssessmentContext = { securityId: string; cutoff: number; marketAsOf: number; expiresAt: number;
  evidence: Evidence[]; modelId?: string | null; openAt?: number; metrics: { sma20: string; latestClose: string } };

export function validateAssessment(raw: unknown, context: AssessmentContext) {
  const proposal = proposalSchema.parse(raw);
  if (![context.cutoff,context.marketAsOf,context.expiresAt].every(Number.isSafeInteger)
    || context.marketAsOf>context.cutoff || context.expiresAt<=context.cutoff) throw new Error('invalid assessment times');
  const acquired = context.evidence.map(e => evidenceSchema.parse(e));
  if (new Set(acquired.map(e => e.id)).size!==acquired.length) throw new Error('duplicate evidence identity');
  if (acquired.some(e => e.securityId!==context.securityId || e.acquiredAt>context.cutoff || e.publishedAt!==null && e.publishedAt>context.cutoff)) throw new Error('evidence outside cutoff or identity');
  const byId = new Map(acquired.map(e => [e.id,e]));
  for (const fact of proposal.facts) {
    const evidence = byId.get(fact.evidenceId);
    if (!evidence?.text.includes(fact.quote)) throw new Error('unverifiable citation');
    if (evidence.publishedAt===null && (fact.temporal!=='background' || fact.role!=='context')) throw new Error('unknown publication time cannot establish time-sensitive fact');
  }
  const claims = [...proposal.interpretations,...proposal.invalidation,...(proposal.thesis ? [proposal.thesis] : [])];
  for (const claim of claims) {
    if (claim.evidenceIds.some(id => !byId.has(id))) throw new Error('unverifiable citation');
    if (claim.temporal!=='background' && claim.evidenceIds.some(id => byId.get(id)!.publishedAt===null)) throw new Error('unknown publication time cannot establish time-sensitive claim');
    // Numeric levels belong to deterministic methods; prose cannot introduce an unsupported target.
    if (/\b(price target|target price|buy at|sell at|stop.loss)\b|[$€£]/i.test(claim.text)) throw new Error('unsupported price target');
    const sourceText = claim.evidenceIds.map(id => byId.get(id)!.text).join(' ')+' '+(claim.metricKeys ?? []).map(key => context.metrics[key]).join(' ');
    for (const number of claim.text.match(/\d+(?:\.\d+)?/g) ?? []) if (!sourceText.includes(number)) throw new Error('unsupported numeric claim');
  }
  const reasonedSupport = proposal.facts.some(f => f.role==='support' && proposal.interpretations.some(c => c.evidenceIds.includes(f.evidenceId)));
  const thesisKind = proposal.thesisKind ?? (reasonedSupport ? 'supported' : proposal.outcome==='accepted' ? 'unexplained' : 'undetermined');
  if (proposal.outcome==='accepted') {
    if (!proposal.thesis || !proposal.invalidation.length || proposal.attractiveness!=='conditional' || proposal.facts.some(f => f.role==='contradict')) throw new Error('unsupported acceptance');
    if (thesisKind==='supported' && !reasonedSupport) throw new Error('supported thesis needs a cited fact and reasoned connection');
    if (thesisKind==='unexplained' && (!proposal.unknowns.length || !proposal.thesis.metricKeys?.length || proposal.thesis.evidenceIds.length)) throw new Error('unexplained momentum needs an explicit conditional market thesis and explanation gap');
    if (thesisKind==='undetermined') throw new Error('accepted thesis classification required');
  }
  if (proposal.outcome==='rejected' && !proposal.facts.some(f => f.role==='contradict')) throw new Error('rejection requires contradictory evidence');
  if (proposal.outcome==='insufficient_evidence' && (!proposal.unknowns.length || proposal.attractiveness!=='undetermined')) throw new Error('abstention needs explicit gaps');
  let expiresAt = context.expiresAt;
  if (proposal.validity?.kind==='before_open') {
    if (!Number.isSafeInteger(context.openAt)) throw new Error('opening time unavailable');
    expiresAt = Math.min(expiresAt,context.openAt!);
  } else if (proposal.validity?.kind==='before_event') {
    const event = byId.get(proposal.validity.evidenceId);
    if (!event?.scheduledEventAt || !proposal.facts.some(f => f.evidenceId===event.id)) throw new Error('unverifiable event expiry');
    expiresAt = Math.min(expiresAt,event.scheduledEventAt);
  }
  if (expiresAt<=context.cutoff) throw new Error('assessment already expired');
  const citedIds = new Set([...proposal.facts.map(f => f.evidenceId),...claims.flatMap(c => c.evidenceIds)]);
  const sources = acquired.filter(e => citedIds.has(e.id)).map(({ text: _text, ...metadata }) => metadata);
  return { ...proposal, thesisKind, marketReferences: { ...context.metrics, asOf: context.marketAsOf }, modelId: context.modelId ?? null, securityId: context.securityId, cutoff: context.cutoff, marketAsOf: context.marketAsOf, expiresAt,
    priceCondition: proposal.priceCondition==='none' ? { method: 'none' as const, currentEntryValidated: false as const }
      : { method: proposal.priceCondition, value: proposal.priceCondition==='sma20' ? context.metrics.sma20 : context.metrics.latestClose,
        asOf: context.marketAsOf, currentEntryValidated: false as const },
    sources, independentOrigins: new Set(sources.map(e => e.originId)).size,
    causation: 'unverified' as const };
}
export type Assessment = ReturnType<typeof validateAssessment>;

export function proposalEvidenceIds(raw: unknown) {
  const p = proposalSchema.parse(raw);
  return [...new Set([...p.facts.map(f => f.evidenceId),...p.interpretations.flatMap(c => c.evidenceIds),...p.invalidation.flatMap(c => c.evidenceIds),...(p.thesis?.evidenceIds ?? [])])];
}
