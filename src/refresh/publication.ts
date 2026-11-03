import { D, rounded } from '../decimal';
import { insufficient } from '../research/researcher';
import { refreshPolicy } from './policy';
import { z } from 'zod';
import { hash, type Lease } from '../persistence';
import { validateAssessment, proposalEvidenceIds, type Assessment } from '../research/assessment';
import { acquiredEvidence } from '../research/evidence';
import { Tracking } from '../tracking/store';
import { Refreshes, type RefreshPlan } from './store';

export const premarketSchema = z.object({ price: z.string().regex(/^\d+(\.\d+)?$/), volume: z.string().regex(/^\d+(\.\d+)?$/).nullable(),
  eventAt: z.number().int().nonnegative(), acquiredAt: z.number().int().nonnegative(), delayMs: z.literal(refreshPolicy.priceDelayMs), source: z.literal('alpaca_sip'), basis: z.literal('raw') }).strict();
export type Premarket = z.infer<typeof premarketSchema>;
export type RefreshDecision = { securityId: string; proposal: unknown | null; gap: string | null; modelId: string | null; price: Premarket | null };
export type RefreshValue = { morningId: string; inputHash: string; baseline: string[]; main: string[]; complete: boolean;
  entries: { securityId: string; versionId: string | null; previousId: string | null; morningVersionId: string | null; assessment: Assessment | null;
    gap: string | null; changes: string[]; newEvidence: string[]; price: Premarket | null; priceStatus: 'delayed' | 'stale' | 'missing'; marketChange: { morningClose: NonNullable<import('./store').RefreshEntry['morningClose']>; fraction: string } | null; invalidated: string[] }[] };
type Row = { run_id: string; cutoff: number; artifact_at: number; hash: string; value: string };
export class RefreshPublication {
  constructor(readonly refreshes: Refreshes) {}
  private get store() { return this.refreshes.foundation; }
  private get clock() { return this.refreshes.clock; }
  async get(runId: string) {
    const db = this.store.db.withSession('first-primary');
    const row = await db.prepare('SELECT * FROM refresh_reports WHERE run_id=?').bind(runId).first<Row>();
    if (!row) return null;
    const receipt = await db.prepare('SELECT hash,observed_at FROM refresh_receipts WHERE run_id=?').bind(runId).first<{ hash: string; observed_at: number }>();
    const request = (await this.refreshes.get(runId))!, value = JSON.parse(row.value) as RefreshValue;
    const valid = receipt?.hash===row.hash && receipt.observed_at>=Math.max(row.cutoff,row.artifact_at);
    const timing = !valid ? 'unverified' : receipt.observed_at<request.plan.cutoff ? 'on_time' : 'late';
    const evaluated = timing==='on_time' && value.complete;
    const cohorts = evaluated ? (await db.prepare('SELECT arm,security_id,input_hash,cutoff FROM refresh_cohorts WHERE run_id=? ORDER BY arm,security_id').bind(runId).all()).results : [];
    return { ...row, value, receipt, timing, evaluated, cohorts };
  }
  async publish(lease: Lease, decisions: RefreshDecision[]) {
    const prior = await this.get(lease.runId); if (prior) return prior;
    const request = (await this.refreshes.get(lease.runId))!, plan = request.plan, now = this.clock(), cutoff = Math.min(now,plan.cutoff), db = this.store.db;
    if (decisions.length!==plan.entries.length || new Set(decisions.map(d => d.securityId)).size!==decisions.length
      || decisions.some(d => !plan.entries.some(e => e.securityId===d.securityId))) throw new Error('exact refresh scope required');
    const tracking = new Tracking(this.store,this.clock), trackingWrites: D1PreparedStatement[] = [], entries: RefreshValue['entries'] = [];
    for (const candidate of plan.entries) {
      const decision = decisions.find(d => d.securityId===candidate.securityId)!;
      const evidence = (await acquiredEvidence(db,candidate.securityId,cutoff,decision.proposal ? proposalEvidenceIds(decision.proposal) : []))
        .filter(e => e.publishedAt===null || e.publishedAt<=cutoff);
      let assessment: Assessment | null = decision.proposal ? validateAssessment(decision.proposal,{ ...candidate, evidence, cutoff, expiresAt: plan.open, modelId: decision.modelId }) : null;
      const morning = candidate.morningVersionId ? await tracking.version(candidate.morningVersionId) : null;
      const previous = candidate.previousId ? await tracking.version(candidate.previousId) : null;
      const price = decision.price===null ? null : premarketSchema.parse(decision.price);
      if (price && (price.acquiredAt>cutoff || price.eventAt>price.acquiredAt-price.delayMs || price.eventAt<plan.open-refreshPolicy.premarketBeforeOpenMs || price.eventAt>=plan.open)) throw new Error('premarket outside cutoff or session');
      const recorded = candidate.tracked ? await tracking.version(candidate.tracked.thesisVersionId) : previous;
      const invalidated = (recorded?.invalidation ?? []).flatMap((condition,i) => {
        const p = condition.predicate;
        // Only explicit issuer-text confirmation can invalidate on new intraday evidence. A minute price is not a daily close.
        return p?.kind==='source_text' && evidence.some(e => e.acquiredAt>(previous?.cutoff ?? recorded!.cutoff) && e.publishedAt!==null && e.publishedAt>recorded!.cutoff && e.publishedAt<=cutoff && e.originId===p.originId && e.text.includes(p.contains)) ? [`source_text:${i}`] : [];
      });
      const current = candidate.tracked ? await tracking.get(candidate.securityId) : null;
      if (candidate.tracked && (!current || current.revision!==candidate.tracked.revision)) throw new Error('tracking changed during refresh');
      const isInvalidated = invalidated.length>0 || current?.thesisStatus==='invalidated';
      if (isInvalidated && (!assessment || assessment.outcome==='accepted')) assessment = validateAssessment(insufficient('recorded_invalidation_confirmed'),{ ...candidate, evidence: [], cutoff, expiresAt: plan.open });
      if (candidate.tracked && assessment && recorded) {
        assessment = { ...assessment, thesisKind: recorded.thesisKind, thesis: recorded.thesis, invalidation: recorded.invalidation,
          sources: [...new Map([...assessment.sources,...recorded.sources].map(s => [s.id,s])).values()],
          independentOrigins: new Set([...assessment.sources,...recorded.sources].map(s => s.originId)).size };
        if (isInvalidated) assessment.trackingJudgment = { recordedVersionId: candidate.tracked.thesisVersionId, thesisStatus: 'invalidated',
          confirmedAt: current?.invalidatedAt ?? now, reasons: [...new Set([...(current?.invalidationReasons ?? []),...invalidated])] };
      }
      const changes = !morning ? ['morning_assessment_unavailable'] : assessment ? (['outcome','attractiveness','thesis','invalidation','facts','unknowns'] as const)
        .filter(key => JSON.stringify(morning[key])!==JSON.stringify(assessment[key])) : ['refresh_failed_prior_version_preserved'];
      const versionId = assessment ? await hash(`refresh:${lease.runId}:${candidate.securityId}`) : null;
      if (current && (assessment || invalidated.length)) {
        const next = { ...current, revision: current.revision+1, versionId: versionId ?? current.versionId, updatedAt: now,
          thesisStatus: isInvalidated ? 'invalidated' as const : assessment?.outcome==='accepted' ? 'positive' as const : 'insufficient_evidence' as const,
          invalidatedAt: isInvalidated ? current.invalidatedAt ?? now : null,
          invalidationReasons: [...new Set([...current.invalidationReasons,...invalidated])] };
        trackingWrites.push(db.prepare('INSERT INTO tracking_events(identity,command_key,request_hash,security_id,revision,at,action,value) VALUES(?,?,?,?,?,?,?,?)')
          .bind('system',`refresh-${lease.runId}-${candidate.securityId}`,await hash(JSON.stringify(next)),candidate.securityId,next.revision,now,'refresh_check',JSON.stringify(next)));
      }
      entries.push({ securityId: candidate.securityId, previousId: candidate.previousId, morningVersionId: candidate.morningVersionId,
        versionId, assessment, changes,
        gap: decision.gap, newEvidence: evidence.filter(e => e.acquiredAt>(morning?.cutoff ?? previous?.cutoff ?? 0) && e.publishedAt!==null && e.publishedAt<=cutoff).map(e => e.id),
        price, marketChange: price && candidate.morningClose && new D(candidate.morningClose.price).gt(0) ? { morningClose: candidate.morningClose, fraction: rounded(new D(price.price).div(candidate.morningClose.price).minus(1)) } : null, priceStatus: !price ? 'missing' : cutoff-price.eventAt>refreshPolicy.staleAfterMs ? 'stale' : 'delayed', invalidated });
    }
    const complete = entries.every(e => e.assessment && !e.gap && e.assessment.outcome!=='insufficient_evidence');
    const value: RefreshValue = { morningId: plan.morningId, inputHash: plan.inputHash, baseline: plan.baseline,
      main: entries.filter(e => plan.baseline.includes(e.securityId) && e.assessment?.outcome==='accepted')
        .sort((a,b) => Number(b.assessment?.thesisKind==='supported')-Number(a.assessment?.thesisKind==='supported')).map(e => e.securityId), complete, entries };
    const encoded = JSON.stringify(value), digest = await hash(encoded);
    await this.store.fenced(lease,now,[
      db.prepare('INSERT INTO refresh_reports(run_id,cutoff,artifact_at,hash,value) VALUES(?,?,?,?,?)').bind(lease.runId,cutoff,now,digest,encoded),
      ...entries.flatMap(e => e.assessment ? [db.prepare('INSERT INTO refresh_versions(id,run_id,security_id,previous_id,cutoff,value) VALUES(?,?,?,?,?,?)')
        .bind(e.versionId,lease.runId,e.securityId,e.previousId,cutoff,JSON.stringify(e.assessment))] : []),
      ...trackingWrites,
      ...(['ai','baseline'] as const).map(arm => db.prepare('INSERT INTO refresh_cohorts(run_id,arm,security_id,input_hash,cutoff) SELECT ?,?,value,?,? FROM json_each(?)')
        .bind(lease.runId,arm,plan.inputHash,cutoff,JSON.stringify(!complete ? [] : arm==='ai' ? value.main : value.baseline))),
    ]);
    return (await this.get(lease.runId))!;
  }
  async certify(lease: Lease) {
    const db = this.store.db.withSession('first-primary');
    const row = await db.prepare('SELECT * FROM refresh_reports WHERE run_id=?').bind(lease.runId).first<Row>();
    if (!row || await hash(row.value)!==row.hash) throw new Error('refresh readback mismatch');
    const value = JSON.parse(row.value) as RefreshValue;
    const cohorts = (await db.prepare('SELECT arm,security_id,input_hash,cutoff FROM refresh_cohorts WHERE run_id=? ORDER BY arm,security_id').bind(lease.runId)
      .all<{ arm: string; security_id: string; input_hash: string; cutoff: number }>()).results;
    const expected = !value.complete ? [] : [...value.baseline.map(security_id => ({ arm: 'baseline', security_id })),...value.main.map(security_id => ({ arm: 'ai', security_id }))]
      .sort((a,b) => a.arm.localeCompare(b.arm) || a.security_id.localeCompare(b.security_id));
    if (JSON.stringify(cohorts.map(({ arm,security_id }) => ({ arm,security_id })))!==JSON.stringify(expected)
      || cohorts.some(c => c.input_hash!==value.inputHash || c.cutoff!==row.cutoff)) throw new Error('refresh cohort readback mismatch');
    for (const entry of value.entries) if (entry.assessment) {
      const version = await db.prepare('SELECT value FROM refresh_versions WHERE id=? AND run_id=?').bind(entry.versionId,lease.runId).first<{ value: string }>();
      if (!version || version.value!==JSON.stringify(entry.assessment)) throw new Error('refresh version readback mismatch');
    }
    const request = await db.prepare('SELECT plan FROM refresh_requests WHERE run_id=?').bind(lease.runId).first<{ plan: string }>();
    const plan = JSON.parse(request!.plan) as RefreshPlan;
    const morning = await db.prepare('SELECT value FROM morning_reports WHERE id=?').bind(plan.morningId).first<{ value: string }>();
    if (!morning || JSON.parse(morning.value).inputHash!==value.inputHash) throw new Error('refresh input readback mismatch');
    const now = this.clock();
    await this.store.fenced(lease,now,[this.store.db.prepare('INSERT INTO refresh_receipts(run_id,hash,observed_at,generation) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(lease.runId,row.hash,now,lease.generation)]);
  }
}
