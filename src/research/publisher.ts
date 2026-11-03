import { z } from 'zod';
import { Foundation, hash, type Lease } from '../persistence';
import { acquiredEvidence } from './evidence';
import { MarketCapture } from '../market/capture';
import type { ScreenRow } from '../screening/screen';
import { validateAssessment, proposalEvidenceIds, type Assessment } from './assessment';

const decisionSchema = z.discriminatedUnion('kind',[
  z.object({ securityId: z.string(), kind: z.literal('unresearched'), gap: z.string().regex(/^[a-z_]{1,100}$/) }).strict(),
  z.object({ securityId: z.string(), kind: z.literal('assessed'), proposal: z.unknown() }).strict(),
]);
export type CandidateDecision = z.infer<typeof decisionSchema>;
export type QueueEntry = { ticker: string; securityId: string; issuerId: string; symbol: string; marketAsOf: number; openAt: number;
  metrics: { sma20: string; latestClose: string }; inputIds: string[] };
export type ResearchPlan = { snapshotId: string; inputHash: string; marketCutoff: number; cutoff: number; expiresAt: number; queue: QueueEntry[]; baseline: string[] };
export type PublishedDecision = { securityId: string; outcome: 'unresearched'; gap: string; assessment: null; versionId: null }
  | { securityId: string; outcome: Assessment['outcome']; gap: null; assessment: Assessment; versionId: string };
export type ResearchPublication = { snapshotId: string; inputHash: string; cutoff: number; publishedAt: number;
  baseline: string[]; main: string[]; decisions: PublishedDecision[]; status: 'complete' | 'partial' };

export class ResearchPublisher {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  async begin(lease: Lease, snapshotId: string, times: { cutoff: number; expiresAt: number }) {
    const db = this.foundation.db;
    const saved = await db.prepare('SELECT value FROM screening_results WHERE snapshot_id=?').bind(snapshotId).first<{ value: string }>();
    if (!saved) throw new Error('screening unavailable');
    const screen = JSON.parse(saved.value) as { inputHash: string; cutoff: number; researchQueue: string[]; baseline: string[] };
    if (![times.cutoff,times.expiresAt].every(Number.isSafeInteger) || times.cutoff<screen.cutoff || times.expiresAt<0
      || screen.researchQueue.length>3 || JSON.stringify(screen.researchQueue)!==JSON.stringify(screen.baseline)) throw new Error('invalid research plan');
    const market = await new MarketCapture(this.foundation,this.clock).snapshot(snapshotId,0,0);
    if (!market) throw new Error('market snapshot unavailable');
    const queue: QueueEntry[] = [];
    for (const securityId of screen.researchQueue) {
      const row = await db.prepare(`SELECT m.value FROM market_decisions d CROSS JOIN screening_metrics m ON m.snapshot_id=d.snapshot_id AND m.ticker=d.ticker
        JOIN screening_ranks r ON r.snapshot_id=m.snapshot_id AND r.ticker=m.ticker WHERE d.snapshot_id=? AND d.security_id=? AND json_extract(r.value,'$.disposition')='research_queue'`)
        .bind(snapshotId,securityId).first<{ value: string }>();
      const metric = row ? JSON.parse(row.value) as ScreenRow : null;
      if (!metric?.securityId || !metric.identity || !metric.metrics || metric.eventThrough===null) throw new Error('queue identity unavailable');
      queue.push({ ticker: metric.ticker, securityId: metric.securityId, issuerId: metric.identity.issuerId, symbol: metric.identity.symbol,
        metrics: { sma20: metric.metrics.sma20, latestClose: metric.metrics.latestClose }, marketAsOf: metric.eventThrough, openAt: market.open, inputIds: metric.inputIds });
    }
    if (new Set(queue.map(q => q.securityId)).size!==queue.length || new Set(queue.map(q => q.issuerId)).size!==queue.length) throw new Error('duplicate queue identity');
    const plan: ResearchPlan = { snapshotId, inputHash: screen.inputHash, marketCutoff: screen.cutoff, ...times, queue, baseline: screen.baseline };
    const existing = await this.plan(snapshotId);
    if (existing) {
      if (JSON.stringify(existing)!==JSON.stringify(plan)) throw new Error('research plan conflict');
      return existing;
    }
    await this.foundation.fenced(lease,this.clock(),[db.prepare('INSERT INTO research_plans(snapshot_id,run_id,input_hash,cutoff,expires_at,value) VALUES(?,?,?,?,?,?)')
      .bind(snapshotId,lease.runId,plan.inputHash,plan.cutoff,plan.expiresAt,JSON.stringify(plan))]);
    return plan;
  }
  async plan(snapshotId: string): Promise<ResearchPlan | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM research_plans WHERE snapshot_id=?').bind(snapshotId).first<{ value: string }>();
    return row ? JSON.parse(row.value) as ResearchPlan : null;
  }
  async publication(snapshotId: string): Promise<ResearchPublication | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM research_publications WHERE snapshot_id=?').bind(snapshotId).first<{ value: string }>();
    return row ? JSON.parse(row.value) as ResearchPublication : null;
  }
  async publish(lease: Lease, snapshotId: string, raw: unknown): Promise<ResearchPublication> {
    const decisions = z.array(decisionSchema).max(3).parse(raw), plan = await this.plan(snapshotId), db = this.foundation.db;
    if (!plan || decisions.length!==plan.queue.length || new Set(decisions.map(d => d.securityId)).size!==decisions.length
      || decisions.some(d => !plan.queue.some(q => q.securityId===d.securityId))) throw new Error('exact research queue required');
    const ordered = plan.queue.map(q => decisions.find(d => d.securityId===q.securityId)!);
    const requestHash = await hash(JSON.stringify(ordered));
    const prior = await db.prepare('SELECT request_hash,value FROM research_publications WHERE snapshot_id=?').bind(snapshotId).first<{ request_hash: string; value: string }>();
    if (prior) {
      if (prior.request_hash!==requestHash) throw new Error('publication idempotency conflict');
      return JSON.parse(prior.value) as ResearchPublication;
    }
    const publishedAt = this.clock(), cutoff = Math.min(plan.cutoff,publishedAt);
    if (cutoff<plan.marketCutoff) throw new Error('clock before frozen market cutoff');
    const output: PublishedDecision[] = [];
    for (const decision of ordered) {
      if (decision.kind==='unresearched') { output.push({ securityId: decision.securityId, outcome: 'unresearched', gap: decision.gap, assessment: null, versionId: null }); continue; }
      const candidate = plan.queue.find(q => q.securityId===decision.securityId)!;
      const evidence = await acquiredEvidence(db,candidate.securityId,cutoff,proposalEvidenceIds(decision.proposal));
      const model = await db.prepare("SELECT json_extract(value,'$.modelId') AS modelId FROM research_passes WHERE snapshot_id=? AND security_id=?").bind(snapshotId,candidate.securityId).first<{ modelId: string | null }>();
      const assessment = validateAssessment(decision.proposal,{ ...candidate, evidence, cutoff, expiresAt: plan.expiresAt, modelId: model?.modelId ?? null });
      output.push({ securityId: decision.securityId, outcome: assessment.outcome, gap: null, assessment, versionId: await hash(`${snapshotId}:${decision.securityId}:initial`) });
    }
    const publication: ResearchPublication = { snapshotId, inputHash: plan.inputHash, cutoff, publishedAt, baseline: plan.baseline,
      main: output.filter(d => d.outcome==='accepted').sort((a,b) => Number(b.assessment?.thesisKind==='supported')-Number(a.assessment?.thesisKind==='supported')).map(d => d.securityId), decisions: output,
      status: output.some(d => d.outcome==='unresearched' || d.outcome==='insufficient_evidence') ? 'partial' : 'complete' };
    await this.foundation.fenced(lease,publishedAt,[db.prepare('INSERT INTO research_publications(snapshot_id,request_hash,cutoff,published_at,value) VALUES(?,?,?,?,?)')
      .bind(snapshotId,requestHash,cutoff,publishedAt,JSON.stringify(publication)),
      ...output.map(d => db.prepare('INSERT INTO research_decisions(snapshot_id,security_id,outcome,value) VALUES(?,?,?,?)')
        .bind(snapshotId,d.securityId,d.outcome,JSON.stringify(d))),
      ...output.flatMap(d => d.assessment ? [db.prepare('INSERT INTO research_assessment_versions(id,snapshot_id,security_id,previous_id,command_key,request_hash,cutoff,value) VALUES(?,?,?,NULL,?,?,?,?)')
        .bind(d.versionId,snapshotId,d.securityId,'initial',requestHash,cutoff,JSON.stringify(d.assessment))] : []),
    ]);
    return publication;
  }
  async version(id: string): Promise<Assessment | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM research_assessment_versions WHERE id=?').bind(id).first<{ value: string }>();
    return row ? JSON.parse(row.value) as Assessment : null;
  }
  // A correction supplements the original research; it never changes the frozen
  // morning selection or its candidate dispositions.
  async appendVersion(lease: Lease, command: { snapshotId: string; securityId: string; previousId: string; key: string;
    cutoff: number; expiresAt: number; proposal: unknown }) {
    if (!/^[\w-]{1,100}$/.test(command.key) || command.key==='initial' || command.cutoff>this.clock()) throw new Error('invalid correction');
    const db = this.foundation.db, requestHash = await hash(JSON.stringify(command));
    const prior = await db.prepare('SELECT id,request_hash FROM research_assessment_versions WHERE snapshot_id=? AND security_id=? AND command_key=?')
      .bind(command.snapshotId,command.securityId,command.key).first<{ id: string; request_hash: string }>();
    if (prior) {
      if (prior.request_hash!==requestHash) throw new Error('correction idempotency conflict');
      return { id: prior.id, assessment: (await this.version(prior.id))! };
    }
    const previous = await db.prepare('SELECT cutoff FROM research_assessment_versions WHERE id=? AND snapshot_id=? AND security_id=?')
      .bind(command.previousId,command.snapshotId,command.securityId).first<{ cutoff: number }>();
    const plan = await this.plan(command.snapshotId), candidate = plan?.queue.find(q => q.securityId===command.securityId);
    if (!previous || !candidate || command.cutoff<previous.cutoff) throw new Error('invalid predecessor');
    const evidence = await acquiredEvidence(db,command.securityId,command.cutoff,proposalEvidenceIds(command.proposal));
    const assessment = validateAssessment(command.proposal,{ ...candidate, evidence, cutoff: command.cutoff, expiresAt: command.expiresAt });
    const id = await hash(`${command.snapshotId}:${command.securityId}:${command.key}`);
    await this.foundation.fenced(lease,this.clock(),[db.prepare('INSERT INTO research_assessment_versions(id,snapshot_id,security_id,previous_id,command_key,request_hash,cutoff,value) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id,command.snapshotId,command.securityId,command.previousId,command.key,requestHash,command.cutoff,JSON.stringify(assessment))]);
    return { id, assessment };
  }

}
