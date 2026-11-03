import { hash, Conflict, type Lease } from '../persistence';
import { MarketCapture } from '../market/capture';
import { ResearchPublisher } from '../research/publisher';
import { validateAssessment, type Assessment } from '../research/assessment';
import { ResearchTools, type ToolRequest } from '../research/tools';
import { dispatchModel } from '../research/model-call';
import { researchSystem, researchResponseSchema, insufficient, type ResearchModel } from '../research/researcher';
import type { ScreenRow } from '../screening/screen';
import { type SavedObservation, type Snapshot } from '../market/types';
import { Tracking, type Opportunity } from './store';
import { materialChanges, type MarketState } from './changes';

export type TrackingCheck = { snapshotId: string; securityId: string; reportDate: string; cutoff: number; at: number;
  status: 'no_material_change' | 'material_change' | 'incomplete' | 'paused' | 'superseded';
  material: string[]; gaps: string[]; versionId: string; previousVersionId: string; invalidated: string[]; market: MarketState | null };
type Plan = { snapshotId: string; reportDate: string; cutoff: number; expiresAt: number; entries: Opportunity[] };
type Work = { phase: 'search' | 'filings' | 'read' | 'assess'; pending: string | null; reads: string[]; gaps: string[]; repair: number; requests: ToolRequest[] };
export class TrackingRuntime {
  constructor(readonly tracking: Tracking, readonly tools: ResearchTools, readonly model: ResearchModel | null,
    readonly mappings: { securityId: string; issuerId: string; cik: string }[], readonly clock: () => number = Date.now) {}
  private get store() { return this.tracking.foundation; }
  async plan(lease: Lease, snapshotId: string): Promise<Plan> {
    const saved = await this.store.db.prepare('SELECT value FROM tracking_plans WHERE snapshot_id=?').bind(snapshotId).first<{ value: string }>();
    if (saved) return JSON.parse(saved.value) as Plan;
    await this.tracking.checkpoints();
    const research = await new ResearchPublisher(this.store,this.clock).plan(snapshotId);
    const snapshot = await new MarketCapture(this.store,this.clock).snapshot(snapshotId,0,0);
    if (!research || !snapshot) throw new Error('tracking requires frozen research inputs');
    const plan: Plan = { snapshotId, reportDate: snapshot.reportDate, cutoff: research.cutoff, expiresAt: research.expiresAt,
      entries: (await this.tracking.list()).filter(r => r.status!=='archived' && r.selectedAt<=research.cutoff) };
    await this.store.fenced(lease,this.clock(),[this.store.db.prepare('INSERT INTO tracking_plans(snapshot_id,value) VALUES(?,?)').bind(snapshotId,JSON.stringify(plan))]);
    return plan;
  }
  private async market(snapshot: Snapshot, securityId: string) {
    const db = this.store.db;
    const saved = await db.prepare('SELECT m.value,r.value AS ranking FROM screening_metrics m JOIN screening_ranks r ON r.snapshot_id=m.snapshot_id AND r.ticker=m.ticker WHERE m.snapshot_id=? AND json_extract(m.value,\'$.securityId\')=?')
      .bind(snapshot.id,securityId).first<{ value: string; ranking: string }>();
    const row = saved ? JSON.parse(saved.value) as ScreenRow : null;
    if (row && saved) { const rank = JSON.parse(saved.ranking) as { failedGates: ScreenRow['failedGates']; rs20: string | null }; row.failedGates = rank.failedGates; if (row.metrics) row.metrics.rs20 = rank.rs20; }
    const records = row ? (await db.prepare(`SELECT o.id,o.value,MAX(s.acquired_at) AS acquired_at,s.action_version FROM json_each(?) j
      CROSS JOIN market_observations o ON o.id=j.value CROSS JOIN market_sightings s ON s.input_id=o.id
      WHERE s.snapshot_id=? AND s.acquired_at<=? GROUP BY o.id`).bind(JSON.stringify(row.inputIds),snapshot.id,snapshot.cutoff).all<{ id: string; value: string; acquired_at: number; action_version: string }>()).results : [];
    const observations = records.map(r => ({ ...JSON.parse(r.value), id: r.id, acquiredAt: r.acquired_at, actionVersion: r.action_version } as SavedObservation));
    return { row, observations };
  }
  private async baseline(versionId: string): Promise<MarketState | null> {
    const row = await this.store.db.prepare('SELECT snapshot_id,security_id FROM research_assessment_versions WHERE id=? UNION ALL SELECT snapshot_id,security_id FROM tracking_versions WHERE id=? UNION ALL SELECT q.morning_id AS snapshot_id,v.security_id FROM refresh_versions v JOIN refresh_requests q ON q.run_id=v.run_id WHERE v.id=?')
      .bind(versionId,versionId,versionId).first<{ snapshot_id: string; security_id: string }>();
    if (!row) return null;
    const check = await this.store.db.prepare('SELECT value FROM tracking_checks WHERE snapshot_id=? AND security_id=?').bind(row.snapshot_id,row.security_id).first<{ value: string }>();
    if (check) return (JSON.parse(check.value) as TrackingCheck).market;
    const snapshot = await new MarketCapture(this.store,this.clock).snapshot(row.snapshot_id,0,0);
    const market = snapshot ? await this.market(snapshot,row.security_id) : null;
    return market?.row?.metrics ? { r20: market.row.metrics.r20, failedGates: market.row.failedGates, asOf: market.row.eventThrough!, inputIds: market.row.inputIds } : null;
  }
  private async save(lease: Lease, plan: Plan, entry: Opportunity, work: Work, revision: number) {
    const result = await this.store.fenced(lease,this.clock(),[this.store.db.prepare(`INSERT INTO tracking_work(snapshot_id,security_id,revision,value) VALUES(?,?,?,?)
      ON CONFLICT(snapshot_id,security_id) DO UPDATE SET revision=excluded.revision,value=excluded.value WHERE tracking_work.revision=?`)
      .bind(plan.snapshotId,entry.securityId,revision+1,JSON.stringify(work),revision)]);
    if (result[1]!.meta.changes!==1) throw new Conflict('tracking work conflict');
  }
  private async commit(lease: Lease, plan: Plan, entry: Opportunity, check: TrackingCheck, assessment: Assessment | null) {
    const db = this.store.db, current = await this.tracking.get(entry.securityId);
    const writes: D1PreparedStatement[] = [];
    if (!current || current.status!=='active' || current.versionId!==entry.versionId || current.interval!==entry.interval || current.revision!==entry.revision) {
      check.status = 'superseded'; check.gaps.push('tracking_changed_during_check'); assessment = null;
    }
    if (assessment) {
      if (current?.thesisStatus==='invalidated' || check.invalidated.length) assessment = { ...assessment, trackingJudgment: {
        recordedVersionId: entry.thesisVersionId, thesisStatus: 'invalidated', confirmedAt: current?.invalidatedAt ?? this.clock(),
        reasons: [...new Set([...(current?.invalidationReasons ?? []),...check.invalidated])] } };
      check.versionId = await hash(`tracking:${plan.snapshotId}:${entry.securityId}:${entry.versionId}`);
      writes.push(db.prepare('INSERT INTO tracking_versions(id,security_id,previous_id,snapshot_id,cutoff,value) VALUES(?,?,?,?,?,?)')
        .bind(check.versionId,entry.securityId,entry.versionId,plan.snapshotId,assessment.cutoff,JSON.stringify(assessment)));
    }
    if (current && check.status!=='superseded' && (assessment || check.invalidated.length)) {
      const invalidated = current.thesisStatus==='invalidated' || check.invalidated.length>0;
      const next: Opportunity = { ...current, revision: current.revision+1, versionId: check.versionId, updatedAt: this.clock(),
        thesisStatus: invalidated ? 'invalidated' : assessment && assessment.outcome!=='accepted' ? 'insufficient_evidence' : assessment?.outcome==='accepted' ? 'positive' : current.thesisStatus,
        invalidatedAt: invalidated ? current.invalidatedAt ?? this.clock() : null,
        invalidationReasons: [...new Set([...current.invalidationReasons,...check.invalidated])] };
      writes.push(db.prepare('INSERT INTO tracking_events(identity,command_key,request_hash,security_id,revision,at,action,value) VALUES(?,?,?,?,?,?,?,?)')
        .bind('system',`daily-${plan.snapshotId}-${entry.securityId}`,await hash(JSON.stringify(check)),entry.securityId,next.revision,this.clock(),'daily_check',JSON.stringify(next)));
    }
    writes.push(db.prepare('INSERT INTO tracking_checks(snapshot_id,security_id,at,value) VALUES(?,?,?,?)').bind(plan.snapshotId,entry.securityId,this.clock(),JSON.stringify(check)));
    await this.store.fenced(lease,this.clock(),writes);
  }
  async step(lease: Lease, snapshotId: string, deadline: number): Promise<boolean> {
    const plan = await this.plan(lease,snapshotId), db = this.store.db;
    await this.tracking.checkpoints();
    const done = (await db.prepare('SELECT security_id FROM tracking_checks WHERE snapshot_id=?').bind(snapshotId).all<{ security_id: string }>()).results;
    const entry = plan.entries.find(e => !done.some(d => d.security_id===e.securityId)); if (!entry) return true;
    const prior = (await this.tracking.version(entry.versionId))!;
    const check: TrackingCheck = { snapshotId, securityId: entry.securityId, reportDate: plan.reportDate, cutoff: Math.min(this.clock(),plan.cutoff), at: this.clock(),
      status: 'incomplete', material: [], gaps: [], versionId: entry.versionId, previousVersionId: entry.versionId, invalidated: [], market: null };
    const current = await this.tracking.get(entry.securityId);
    if (!current || current.status!=='active' || current.interval!==entry.interval || this.clock()>=entry.checkpointAt) {
      check.status = current?.status==='needs_renewal' ? 'paused' : 'superseded';
      // A paused record is intentionally not an active-research commit.
      await this.store.fenced(lease,this.clock(),[db.prepare('INSERT INTO tracking_checks(snapshot_id,security_id,at,value) VALUES(?,?,?,?)').bind(snapshotId,entry.securityId,this.clock(),JSON.stringify(check))]); return false;
    }
    const snapshot = (await new MarketCapture(this.store,this.clock).snapshot(snapshotId,0,0))!;
    const { row, observations } = await this.market(snapshot,entry.securityId);
    const publication = await new ResearchPublisher(this.store,this.clock).publication(snapshotId);
    const overlap = publication?.decisions.find(d => d.securityId===entry.securityId);
    const saved = await db.prepare('SELECT revision,value FROM tracking_work WHERE snapshot_id=? AND security_id=?').bind(snapshotId,entry.securityId).first<{ revision: number; value: string }>();
    const work: Work = saved ? JSON.parse(saved.value) as Work : { phase: 'search', pending: null, reads: [], gaps: [], repair: 0, requests: [] };
    const revision = saved?.revision ?? 0;
    const evidence = await this.tools.evidence(entry.securityId,check.cutoff);
    const recorded = await this.tracking.version(entry.thesisVersionId);
    const lastCheck = (await this.tracking.checks(entry.securityId)).find(c => c.snapshotId!==snapshotId && c.cutoff<=check.cutoff);
    const marketCheck = (await this.tracking.checks(entry.securityId)).find(c => c.snapshotId!==snapshotId && c.market!==null && c.cutoff<=check.cutoff && !['paused','superseded'].includes(c.status));
    const changes = materialChanges(prior,await this.baseline(entry.versionId),snapshot.status==='unavailable' ? null : row,observations,evidence,{
      recorded: recorded ?? prior, evidenceSince: Math.max(prior.cutoff,lastCheck?.cutoff ?? 0),
      marketSince: Math.max((recorded ?? prior).marketAsOf,marketCheck?.market?.asOf ?? 0), startSession: entry.startSession });
    Object.assign(check,changes);
    check.gaps.push(...work.gaps);
    const candidate = { securityId: entry.securityId, marketAsOf: row?.eventThrough ?? prior.marketAsOf, openAt: snapshot.open,
      metrics: row?.metrics ? { sma20: row.metrics.sma20, latestClose: row.metrics.latestClose } : prior.marketReferences };
    const finish = async (assessment: Assessment | null = null) => {
      if (!assessment && check.material.length) {
        assessment = this.preserveThesis(validateAssessment(insufficient(check.gaps.join('; ') || 'material_change_requires_evidence_review'),
          { ...candidate, evidence: [], cutoff: check.cutoff, expiresAt: plan.expiresAt }),recorded ?? prior);
      }
      if (assessment) assessment = this.preserveThesis(assessment,recorded ?? prior);
      await this.commit(lease,plan,entry,check,assessment); return false;
    };
    if (check.invalidated.length && entry.thesisStatus!=='invalidated') {
      check.gaps.push('recorded_invalidation_confirmed'); return finish();
    }
    if (work.pending) { check.gaps.push('unknown_billed_call'); return finish(); }
    if (overlap) {
      if (!overlap.assessment) { check.gaps.push(overlap.gap ?? 'discovery_check_incomplete'); return finish(); }
      if (!check.material.length) { check.status = check.gaps.length ? 'incomplete' : 'no_material_change'; return finish(); }
      const sameThesis = JSON.stringify(overlap.assessment.thesis)===JSON.stringify((recorded ?? prior).thesis)
        && JSON.stringify(overlap.assessment.invalidation)===JSON.stringify((recorded ?? prior).invalidation);
      const newEvidence = evidence.filter(e => e.acquiredAt>Math.max(prior.cutoff,lastCheck?.cutoff ?? 0));
      const coveredEvidence = newEvidence.every(e => overlap.assessment!.sources.some(s => s.id===e.id));
      if (sameThesis && coveredEvidence) {
        check.status = check.gaps.length ? 'incomplete' : 'material_change';
        return finish(this.preserveThesis(overlap.assessment,recorded ?? prior));
      }
      // Share acquisition, but assess separately when discovery addresses different reasoning.
      work.phase = 'assess';
    }
    if (this.clock()>=plan.cutoff || this.clock()>=plan.expiresAt) { check.gaps.push('research_cutoff'); return finish(); }
    if (this.clock()>=deadline) return false;
    const passId = `tracking:${snapshotId}:${entry.securityId}`;
    const symbol = row?.identity?.symbol;
    this.tools.setIssuerCiks(Object.fromEntries(this.mappings.map(m => [m.securityId,m.cik])));
    const tool = async (request: ToolRequest) => {
      work.pending = 'tool_dispatch'; await this.save(lease,plan,entry,work,revision);
      const result = await this.tools.dispatch(entry.securityId,passId,request,Math.min(deadline,plan.cutoff),symbol);
      work.pending = null;
      if (result.kind==='gap') work.gaps.push(result.code);
      if (result.kind==='links') { if (result.links.some(l => !l.sourceId)) work.gaps.push('unregistered_source_links'); work.reads.push(...result.links.flatMap(l => l.sourceId ? [l.sourceId] : [])); }
      work.gaps = [...new Set(work.gaps)]; await this.save(lease,plan,entry,work,revision+1); return false;
    };
    if (work.phase==='search') { work.phase = 'filings'; return tool({ kind: 'search', topic: 'announcement' }); }
    if (work.phase==='filings') {
      const mapping = this.mappings.find(m => m.securityId===entry.securityId && m.issuerId===row?.identity?.issuerId);
      work.phase = 'read'; work.pending = 'filings_dispatch'; await this.save(lease,plan,entry,work,revision);
      const result = mapping ? await this.tools.changedFilings(entry.securityId,mapping.cik,passId,Math.min(deadline,plan.cutoff),prior.cutoff)
        : { kind: 'gap' as const, code: 'issuer_mapping_unavailable' };
      work.pending = null;
      if (result.kind==='links') work.reads.push(...result.links.flatMap(l => l.sourceId ? [l.sourceId] : []));
      else if (result.kind==='gap') work.gaps.push(result.code);
      work.reads = [...new Set(work.reads)];
      if (work.reads.length>3) work.gaps.push('source_read_bound');
      work.reads = work.reads.slice(0,3);
      await this.save(lease,plan,entry,work,revision+1); return false;
    }
    if (work.reads.length) return tool({ kind: 'read', sourceId: work.reads.shift()! });
    if (work.phase==='read') { work.phase = 'assess'; await this.save(lease,plan,entry,work,revision); return false; }
    if (!check.material.length) { check.status = check.gaps.length ? 'incomplete' : 'no_material_change'; return finish(); }
    if (work.requests.length) return tool(work.requests.shift()!);
    if (!row?.metrics) return finish(validateAssessment(insufficient('comparable_market_history_unavailable'),{ ...candidate, evidence: [], cutoff: check.cutoff, expiresAt: plan.expiresAt }));
    if (!this.model) { check.gaps.push('model_unavailable'); return finish(); }
    const context = JSON.stringify({ ...candidate, recordedThesis: recorded ?? prior, material: check.material,
      evidence: evidence.slice(-6).map(e => ({ id: e.id, originId: e.originId, eventId: e.eventId, publishedAt: e.publishedAt, acquiredAt: e.acquiredAt, untrustedQuotedText: e.text.slice(0,1800) })),
      sources: await this.tools.sources(entry.securityId), gaps: check.gaps, repair: work.repair>0 });
    const system = researchSystem+' Assess against the recorded thesis. Do not replace its thesis or invalidation conditions; renewal is manual. Return insufficient evidence when its assumptions cannot be checked.';
    const inputBound = new TextEncoder().encode(system+context).length+1024;
    const maxOutput = Math.min(1200,1200-(await this.tools.ledger.usage('pass','output',passId)).reserved);
    let callId: string;
    try { callId = await this.tools.ledger.reserve('model',passId,{ input: inputBound, output: maxOutput }); }
    catch { check.gaps.push('model_budget_exhausted'); return finish(); }
    work.pending = callId; await this.save(lease,plan,entry,work,revision);
    try {
      const response = researchResponseSchema.parse(await dispatchModel(this.model,{ system, context, inputBound, maxOutput },this.tools.ledger,callId,Math.min(deadline,plan.cutoff),this.clock));
      work.pending = null;
      if (response.kind==='tools') { work.requests = response.requests; await this.save(lease,plan,entry,work,revision+1); return false; }
      const a = validateAssessment(response.proposal,{ ...candidate, evidence, cutoff: Math.min(this.clock(),plan.cutoff), expiresAt: plan.expiresAt, modelId: this.model.modelId });
      check.status = check.gaps.length ? 'incomplete' : 'material_change';
      return finish(this.preserveThesis(a,recorded ?? prior));
    } catch {
      // Never replay an ambiguous paid call. Known invalid output allows one bounded repair.
      if (work.pending) { check.gaps.push('model_call_failed'); return finish(); }
      work.repair++;
      if (work.repair>1) { check.gaps.push('invalid_structured_output'); return finish(); }
      await this.save(lease,plan,entry,work,revision+1); return false;
    }
  }
  private preserveThesis(a: Assessment, recorded: Assessment): Assessment {
    // A new judgment can downgrade a thesis; replacing the recorded reasoning is a manual renewal action.
    return { ...a, thesisKind: recorded.thesisKind, thesis: recorded.thesis, invalidation: recorded.invalidation,
      sources: [...new Map([...a.sources,...recorded.sources].map(s => [s.id,s])).values()],
      independentOrigins: new Set([...a.sources,...recorded.sources].map(s => s.originId)).size };
  }
}
