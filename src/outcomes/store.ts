import { z } from 'zod';
import { D } from '../decimal';
import { Foundation, hash, type Lease } from '../persistence';
import { officialOpening } from '../market/quality';
import { MarketCapture, venues } from '../market/capture';
import { instant } from '../market/calendar';
import type { Decision, SavedObservation, Snapshot } from '../market/types';
import { calculateOutcome, type Action, type Outcome, type OutcomeInputs } from './calculate';

const amount = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/).max(60);
const positive = amount.refine(v => new D(v).gt(0));
const successor = z.object({ securityId: z.string().min(1), ratio: positive }).strict();
const entitlement = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('split'),ratio:positive}).strict(),
  z.object({kind:z.literal('dividend'),cash:amount}).strict(),
  z.object({kind:z.literal('conversion'),cash:amount,successors:z.array(successor).max(10)}).strict(),
  z.object({kind:z.literal('spinoff'),successors:z.array(successor).min(1).max(10)}).strict(),
  z.object({kind:z.literal('unresolved')}).strict(),
]);
export const actionReview = z.object({ inputId:z.string().min(1), reason:z.string().trim().min(1).max(1000),
  evidence:z.array(z.string().url()).min(1).max(20), currency:z.literal('USD'), timing:z.literal('verified_effective_session'), order:z.number().int().min(0).max(100), entitlement }).strict();
export type Revision = { id:string; snapshotId:string; securityId:string; horizon:10|20|30; kind:'initial'|'correction'; cutoff:number; recordedAt:number;
  revisionOf:string|null; reason:string; inputHash:string; inputs:OutcomeInputs; value:Outcome };
type RevisionRow = { id:string; snapshot_id:string; security_id:string; horizon:10|20|30; kind:'initial'|'correction'; cutoff:number; recorded_at:number;
  revision_of:string|null; reason:string; input_hash:string; inputs:string; value:string };
function revision(r: RevisionRow): Revision {
  return { id:r.id,snapshotId:r.snapshot_id,securityId:r.security_id,horizon:r.horizon,kind:r.kind,cutoff:r.cutoff,recordedAt:r.recorded_at,
    revisionOf:r.revision_of,reason:r.reason,inputHash:r.input_hash,inputs:JSON.parse(r.inputs) as OutcomeInputs,value:JSON.parse(r.value) as Outcome };
}
export class Outcomes {
  constructor(readonly foundation:Foundation, readonly clock:()=>number=Date.now) {}
  private get db() { return this.foundation.db; }
  private async snapshot(id:string) {
    const row = await this.db.prepare('SELECT manifest FROM market_snapshots WHERE id=? AND frozen=1').bind(id).first<{manifest:string}>();
    if (!row) throw new Error('frozen snapshot required');
    return JSON.parse(row.manifest) as Snapshot;
  }
  /** Idempotent set-based planning: all frozen U_D members, never current catalogue or tracking. */
  async plan(lease:Lease,snapshotId:string) {
    const snapshot = await this.snapshot(snapshotId), sessions = snapshot.calendar.filter(s => s.date>=snapshot.reportDate);
    for (const horizon of [10,20,30] as const) {
      const next = sessions[horizon];
      if (!next) continue; // Unknown calendar is visible as pending; never synthesize weekdays.
      await this.foundation.fenced(lease,this.clock(),[this.db.prepare(`INSERT INTO outcome_work(snapshot_id,security_id,horizon,due_at)
        SELECT snapshot_id,security_id,?,? FROM market_decisions WHERE snapshot_id=? AND reason='eligible' AND NOT EXISTS(SELECT 1 FROM outcome_revisions r WHERE r.snapshot_id=market_decisions.snapshot_id AND r.security_id=market_decisions.security_id AND r.horizon=?) ON CONFLICT DO NOTHING`)
        .bind(horizon,instant(next.date,'08:00','Europe/Zagreb'),snapshotId,horizon)]);
    }
    await this.foundation.fenced(lease,this.clock(),[this.db.prepare('INSERT INTO outcome_planned(snapshot_id) VALUES(?) ON CONFLICT DO NOTHING').bind(snapshotId)]);
  }
  async planNext(lease:Lease) {
    const next = await this.db.prepare('SELECT id FROM market_snapshots WHERE frozen=1 AND NOT EXISTS(SELECT 1 FROM outcome_planned WHERE snapshot_id=market_snapshots.id) ORDER BY report_date,id LIMIT 1').first<{id:string}>();
    if (next) await this.plan(lease,next.id);
  }
  /** Operator reconciliation of a retained action. Provider records themselves are explicitly unverified. */
  async reviewAction(lease:Lease,raw:unknown) {
    const value = actionReview.parse(raw), input = await this.db.prepare("SELECT acquired_at FROM market_observations WHERE id=? AND kind='action'").bind(value.inputId).first<{acquired_at:number}>();
    if (!input || input.acquired_at>this.clock()) throw new Error('retained action required');
    const encoded = JSON.stringify(value), id = await hash(encoded+':'+this.clock());
    await this.foundation.fenced(lease,this.clock(),[this.db.prepare('INSERT INTO outcome_action_reviews(id,input_id,acquired_at,reason,evidence,value) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(id,value.inputId,this.clock(),value.reason,JSON.stringify(value.evidence),encoded)]);
    return id;
  }
  private async inputs(snapshotId:string,securityId:string,horizon:10|20|30,cutoff:number,initial:boolean):Promise<OutcomeInputs> {
    const snapshot = await this.snapshot(snapshotId), dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate).slice(0,horizon+1);
    const sessions = dates.slice(0,horizon).map((s,i) => ({date:s.date,closeAt:instant(s.date,s.close,'America/New_York'),
      deadline:dates[i+1] ? instant(dates[i+1]!.date,'08:00','Europe/Zagreb') : Number.MAX_SAFE_INTEGER}));
    const endpoint = sessions[horizon-1]?.date ?? snapshot.reportDate;
    const capture = new MarketCapture(this.foundation,this.clock);
    // Initial entry is closed at its own earlier deadline, even when first calculated weeks later.
    const referenceCutoff = initial ? Math.min(cutoff,snapshot.referenceDeadline) : cutoff;
    const ref = await capture.reference(snapshotId,securityId,snapshot.reportDate,referenceCutoff);
    const reference = ref.status==='available' && ref.price ? {price:ref.price,id:await hash(JSON.stringify(ref)),acquiredAt:referenceCutoff} : null;
    const actions:Action[] = [], closes:OutcomeInputs['closes'] = [], visited = new Set<string>();
    const queue = [{id:securityId,start:snapshot.reportDate}], coverageIds:string[] = [];
    let covered = true;
    while (queue.length) {
      const member = queue.shift()!;
      if (visited.has(member.id)) continue;
      visited.add(member.id);
      if (visited.size>20) { covered=false; break; }
      // Per-security bounded interval, latest revision of each logical observation as of acquisition cutoff.
      const rows = (await this.db.prepare(`SELECT id,acquired_at,revision_of,value FROM (
        SELECT *,RANK() OVER(PARTITION BY logical_key ORDER BY acquired_at DESC) AS rank FROM market_observations
        WHERE security_id=? AND basis='raw' AND kind IN ('daily','action') AND session>=? AND session<=? AND acquired_at<=?)
        WHERE rank=1 ORDER BY session,id LIMIT 501`).bind(member.id,member.start,endpoint,cutoff)
        .all<{id:string;acquired_at:number;revision_of:string|null;value:string}>()).results;
      if (rows.length>500) { covered=false; break; }
      const observations:SavedObservation[] = rows.map(r => ({...JSON.parse(r.value) as SavedObservation,id:r.id,acquiredAt:r.acquired_at,revisionOf:r.revision_of}));
      // An empty terminal response counts as coverage; a pending/failed/partial page never does.
      const coverage = await this.db.prepare(`SELECT snapshot_id,task,terminal_page AS page FROM outcome_action_coverage
        WHERE security_id=? AND start_session<=? AND end_session>=? AND acquired_at<=? ORDER BY acquired_at DESC LIMIT 1`)
        .bind(member.id,member.start,endpoint,cutoff).first<{snapshot_id:string;task:string;page:number}>();
      if (!coverage) covered=false; else coverageIds.push(`${coverage.snapshot_id}:${coverage.task}:${coverage.page}`);
      const actionIds = observations.filter(o => o.kind==='action').map(o => o.id);
      const reviews = actionIds.length ? (await this.db.prepare(`SELECT id,input_id,acquired_at,value FROM (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY input_id ORDER BY acquired_at DESC,id DESC) AS rank FROM outcome_action_reviews
        WHERE input_id IN (SELECT value FROM json_each(?)) AND acquired_at<=?) WHERE rank=1`)
        .bind(JSON.stringify(actionIds),cutoff).all<{id:string;input_id:string;acquired_at:number;value:string}>()).results : [];
      for (const observation of observations) {
        if (observation.kind==='daily') {
          const price = amount.safeParse(observation.value['c']);
          if (price.success) closes.push({id:observation.id,securityId:member.id,session:observation.session,price:price.data,acquiredAt:observation.acquiredAt});
          continue;
        }
        const review = reviews.find(r => r.input_id===observation.id);
        const common = {id:observation.id,securityId:member.id,session:observation.session,acquiredAt:observation.acquiredAt,order:0};
        if (!review) actions.push({...common,kind:'unresolved'});
        else {
          const verified = actionReview.parse(JSON.parse(review.value));
          actions.push({...common,...verified.entitlement,id:review.id,acquiredAt:review.acquired_at,order:verified.order});
          if ((verified.entitlement.kind==='conversion' || verified.entitlement.kind==='spinoff') && observation.session>snapshot.reportDate) {
            for (const successor of verified.entitlement.successors) queue.push({id:successor.securityId,start:observation.session});
          }
        }
      }
    }
    const input:OutcomeInputs = {securityId,entrySession:snapshot.reportDate,horizon,now:cutoff,sessions,reference,actionsThrough:covered ? endpoint : null,actions,closes};
    // Coverage receipts and the verified Q source records are retained alongside each calculation.
    return Object.assign(input,{queriedMembers:visited.size,coverageIds,referenceInputs:ref.inputIds,referenceStatus:ref.status,ruleVersion:snapshot.ruleVersion});
  }
  async calculate(lease:Lease,snapshotId:string,securityId:string,horizon:10|20|30,correctionReason?:string):Promise<Revision> {
    if (![10,20,30].includes(horizon)) throw new Error('invalid horizon');
    const member = await this.db.prepare("SELECT 1 FROM market_decisions WHERE snapshot_id=? AND security_id=? AND reason='eligible'").bind(snapshotId,securityId).first();
    if (!member) throw new Error('frozen universe member required');
    const prior = await this.latest(snapshotId,securityId,horizon);
    if (prior && correctionReason===undefined) return prior;
    if (correctionReason!==undefined && (!prior || !correctionReason.trim() || correctionReason.length>1000)) throw new Error('correction needs initial result and reason');
    const snapshot = await this.snapshot(snapshotId), dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate), next = dates[horizon];
    if (!next) throw new Error('endpoint calendar deadline missing');
    const deadline = instant(next.date,'08:00','Europe/Zagreb');
    if (this.clock()<deadline) throw new Error('initial acquisition still open');
    const cutoff = prior ? this.clock() : deadline, inputs = await this.inputs(snapshotId,securityId,horizon,cutoff,!prior);
    const row = await this.draft(snapshotId,securityId,horizon,inputs,prior,correctionReason);
    await this.foundation.fenced(lease,this.clock(),[this.insert(row),
      ...(prior ? [] : [this.db.prepare('DELETE FROM outcome_work WHERE snapshot_id=? AND security_id=? AND horizon=?').bind(snapshotId,securityId,horizon)]),
    ]);
    return row;
  }
  private async draft(snapshotId:string,securityId:string,horizon:10|20|30,inputs:OutcomeInputs,prior:Revision|null,correctionReason?:string):Promise<Revision> {
    const inputHash = await hash(JSON.stringify(inputs)), cutoff=inputs.now;
    const reason = correctionReason?.trim() ?? 'v1 next-report acquisition deadline';
    const id = await hash(JSON.stringify([snapshotId,securityId,horizon,prior?.id,cutoff,inputHash,reason]));
    return {id,snapshotId,securityId,horizon,kind:prior ? 'correction' : 'initial',cutoff,recordedAt:this.clock(),revisionOf:prior?.id ?? null,reason,inputHash,inputs,value:calculateOutcome(inputs)};
  }
  private insert(row:Revision) {
    return this.db.prepare(`INSERT INTO outcome_revisions(id,snapshot_id,security_id,horizon,kind,cutoff,recorded_at,revision_of,reason,input_hash,inputs,value)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(row.id,row.snapshotId,row.securityId,row.horizon,row.kind,row.cutoff,row.recordedAt,row.revisionOf,row.reason,row.inputHash,JSON.stringify(row.inputs),JSON.stringify(row.value));
  }
  async latest(snapshotId:string,securityId:string,horizon:number) {
    const row = await this.db.prepare('SELECT * FROM outcome_revisions WHERE snapshot_id=? AND security_id=? AND horizon=? ORDER BY recorded_at DESC,rowid DESC LIMIT 1')
      .bind(snapshotId,securityId,horizon).first<RevisionRow>();
    return row ? revision(row) : null;
  }
  async history(snapshotId:string,securityId:string,horizon:number,after=0) {
    const rows = (await this.db.prepare('SELECT rowid AS sequence,* FROM outcome_revisions WHERE snapshot_id=? AND security_id=? AND horizon=? AND rowid>? ORDER BY rowid LIMIT 100')
      .bind(snapshotId,securityId,horizon,after).all<RevisionRow & {sequence:number}>()).results;
    return rows.map(r => ({...revision(r),sequence:r.sequence}));
  }
  async members(snapshotId:string,horizon:10|20|30,after='') {
    const snapshot = await this.snapshot(snapshotId);
    const rows = (await this.db.prepare(`SELECT r.*,d.security_id FROM market_decisions d LEFT JOIN outcome_revisions r ON r.rowid=(
      SELECT rowid FROM outcome_revisions WHERE snapshot_id=d.snapshot_id AND security_id=d.security_id AND horizon=? ORDER BY recorded_at DESC,rowid DESC LIMIT 1)
      WHERE d.snapshot_id=? AND d.reason='eligible' AND d.security_id>? ORDER BY d.security_id LIMIT 100`).bind(horizon,snapshotId,after).all<RevisionRow>()).results;
    const dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate), endpoint = dates[horizon-1];
    const pending = calculateOutcome({securityId:'',entrySession:snapshot.reportDate,horizon,now:this.clock(),sessions:dates.slice(0,horizon).map(s => ({date:s.date,closeAt:instant(s.date,s.close,'America/New_York'),deadline:0})),reference:null,actionsThrough:null,actions:[],closes:[]});
    if (pending.status!=='pending') pending.reason = 'awaiting_calculation';
    return {snapshotId,horizon,endpoint:endpoint?.date ?? null,items:rows.map(r => ({securityId:r.security_id,revision:r.id ? revision(r) : null,outcome:r.id ? JSON.parse(r.value) as Outcome : pending})),next:rows.length===100 ? rows.at(-1)!.security_id : null};
  }
  async member(snapshotId:string,securityId:string,horizon:10|20|30) {
    const member = await this.db.prepare("SELECT 1 FROM market_decisions WHERE snapshot_id=? AND security_id=? AND reason='eligible'").bind(snapshotId,securityId).first();
    if (!member) return null;
    const prior = await this.latest(snapshotId,securityId,horizon);
    if (prior) return {securityId,outcome:prior.value};
    const snapshot = await this.snapshot(snapshotId), dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate);
    const outcome = calculateOutcome({securityId,entrySession:snapshot.reportDate,horizon,now:this.clock(),sessions:dates.slice(0,horizon).map(s => ({date:s.date,closeAt:instant(s.date,s.close,'America/New_York'),deadline:0})),reference:null,actionsThrough:null,actions:[],closes:[]});
    if (outcome.status!=='pending') outcome.reason='awaiting_calculation';
    return {securityId,outcome};
  }
  /** A bounded SQL partition shares raw prices, coverage and Q receipts across 20 frozen members. */
  private async partition(lease:Lease,snapshotId:string,horizon:10|20|30,ids:string[]) {
    const snapshot = await this.snapshot(snapshotId), dates = snapshot.calendar.filter(s => s.date>=snapshot.reportDate), next = dates[horizon]!;
    const cutoff = instant(next.date,'08:00','Europe/Zagreb'), endpoint=dates[horizon-1]!.date, encoded=JSON.stringify(ids);
    const decisions = (await this.db.prepare("SELECT value FROM market_decisions WHERE snapshot_id=? AND reason='eligible' AND security_id IN (SELECT value FROM json_each(?))")
      .bind(snapshotId,encoded).all<{value:string}>()).results.map(r => JSON.parse(r.value) as Decision);
    const prices = (await this.db.prepare(`SELECT id,security_id,acquired_at,value FROM (
      SELECT *,RANK() OVER(PARTITION BY logical_key ORDER BY acquired_at DESC) AS rank FROM market_observations
      WHERE security_id IN (SELECT value FROM json_each(?)) AND basis='raw' AND kind IN ('daily','action') AND session>=? AND session<=? AND acquired_at<=?)
      WHERE rank=1 LIMIT 2001`).bind(encoded,snapshot.reportDate,endpoint,cutoff).all<{id:string;security_id:string;acquired_at:number;value:string}>()).results;
    const openings = (await this.db.prepare(`SELECT o.id,o.value,p.acquired_at FROM market_sightings p JOIN market_observations o ON o.id=p.input_id
      WHERE p.snapshot_id=? AND p.security_id IN (SELECT value FROM json_each(?)) AND p.kind='opening' AND p.session=? AND p.acquired_at<=? LIMIT 1001`)
      .bind(snapshotId,encoded,snapshot.reportDate,snapshot.referenceDeadline).all<{id:string;value:string;acquired_at:number}>()).results;
    if (prices.length>2000 || openings.length>1000) return {completed:0,complex:ids[0]!};
    const coverage = (await this.db.prepare(`SELECT snapshot_id,task,security_id,terminal_page FROM outcome_action_coverage
      WHERE security_id IN (SELECT value FROM json_each(?)) AND start_session<=? AND end_session>=? AND acquired_at<=?
      ORDER BY acquired_at DESC LIMIT 2001`).bind(encoded,snapshot.reportDate,endpoint,cutoff)
      .all<{snapshot_id:string;task:string;security_id:string;terminal_page:number}>()).results;
    const observations = prices.map(r => ({...JSON.parse(r.value) as SavedObservation,id:r.id,acquiredAt:r.acquired_at}));
    const auctions = openings.map(r => ({...JSON.parse(r.value) as SavedObservation,id:r.id,acquiredAt:r.acquired_at}));
    const revisions:Revision[] = []; let complex:string|undefined;
    for (const id of ids) {
      const identity = decisions.find(d => d.identity?.securityId===id)?.identity;
      if (!identity) throw new Error('frozen universe member required');
      const memberPrices = observations.filter(o => o.securityId===id);
      if (memberPrices.some(o => o.kind==='action' && o.session>snapshot.reportDate)) { complex ??= id; continue; }
      const qualifying = auctions.filter(o => o.securityId===id && officialOpening(o,venues[identity.primaryVenue] ?? '',snapshot.open));
      const price = qualifying[0]?.value['p'] as string|undefined;
      const available = price!==undefined && qualifying.every(o => new D(String(o.value['p'])).eq(price));
      const referenceInputs = [...new Set(qualifying.map(o => o.id))].sort();
      const receipt = coverage.find(c => c.security_id===id);
      const inputs:OutcomeInputs = Object.assign({securityId:id,entrySession:snapshot.reportDate,horizon,now:cutoff,
        sessions:dates.slice(0,horizon).map((s,i) => ({date:s.date,closeAt:instant(s.date,s.close,'America/New_York'),deadline:instant(dates[i+1]!.date,'08:00','Europe/Zagreb')})),
        reference:available ? {price:price!,id:await hash(JSON.stringify(referenceInputs)),acquiredAt:snapshot.referenceDeadline} : null,
        actionsThrough:receipt ? endpoint : null, actions:[],
        closes:memberPrices.filter(o => o.kind==='daily' && amount.safeParse(o.value['c']).success).map(o => ({id:o.id,securityId:id,session:o.session,price:String(o.value['c']),acquiredAt:o.acquiredAt})),
      },{ruleVersion:snapshot.ruleVersion,referenceInputs,referenceStatus:available ? 'available' : qualifying.length ? 'conflict' : 'missing_reference',
        coverageIds:receipt ? [`${receipt.snapshot_id}:${receipt.task}:${receipt.terminal_page}`] : []});
      revisions.push(await this.draft(snapshotId,id,horizon,inputs,null));
    }
    if (revisions.length) await this.foundation.fenced(lease,this.clock(),[...revisions.map(r => this.insert(r)),
      this.db.prepare('DELETE FROM outcome_work WHERE snapshot_id=? AND horizon=? AND security_id IN (SELECT value FROM json_each(?))').bind(snapshotId,horizon,JSON.stringify(revisions.map(r => r.securityId))),
    ]);
    return {completed:revisions.length,complex};
  }
  async tick(lease:Lease,limit=240) {
    const due = (await this.db.prepare(`SELECT * FROM outcome_work WHERE due_at<=? ORDER BY due_at,snapshot_id,horizon,security_id LIMIT ?`)
      .bind(this.clock(),Math.min(limit,240)).all<{snapshot_id:string;security_id:string;horizon:10|20|30}>()).results;
    const started=this.clock(); let completed=0, complexUsed=false;
    await this.foundation.renew(lease,this.clock());
    for (let offset=0;offset<due.length;) {
      if (this.clock()-started>15000) break;
      const first=due[offset]!, group=due.slice(offset,offset+20).filter(r => r.snapshot_id===first.snapshot_id && r.horizon===first.horizon);
      const result=await this.partition(lease,first.snapshot_id,first.horizon,group.map(r => r.security_id));
      completed+=result.completed; offset+=group.length;
      // At most one action/successor traversal per tick; the rest stay queued with their full denominator.
      if (result.complex && !complexUsed) { await this.calculate(lease,first.snapshot_id,result.complex,first.horizon); completed++; complexUsed=true; }
    }
    return completed;
  }
}
