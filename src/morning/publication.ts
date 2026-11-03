import { Foundation, hash, type Lease } from '../persistence';
import { MarketCapture } from '../market/capture';
import { Screener } from '../screening/persistence';
import { ResearchPublisher, type PublishedDecision } from '../research/publisher';
import type { WatchPublication } from '../research/intake';
import type { Snapshot, Identity, Decision } from '../market/types';

type Novelty = { securityId: string; kind: 'new' | 'repeat' | 'promoted/new'; previousDate: string | null; previousVersion: string | null; changes: string[] };
export type MorningValue = {
  snapshot: Omit<Snapshot,'decisions'>; universe: { snapshotId: string; count: number }; inputHash: string;
  baseline: string[]; main: string[]; decisions: PublishedDecision[]; watch: WatchPublication;
  securities: Pick<Identity,'securityId' | 'symbol' | 'brokerTicker' | 'asof' | 'primaryVenue'>[];
  novelty: Novelty[]; status: 'complete' | 'partial' | 'empty' | 'unavailable'; gaps: string[];
};
type Row = { id: string; run_id: string; report_date: string; rule_version: string; cutoff: number; deadline: number; artifact_at: number; hash: string; value: string };
export class MorningReports {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  async get(id: string) {
    const db = this.foundation.db.withSession('first-primary');
    const row = await db.prepare('SELECT * FROM morning_reports WHERE id=?').bind(id).first<Row>();
    if (!row) return null;
    const receipt = await db.prepare('SELECT hash,observed_at,generation FROM morning_receipts WHERE report_id=?').bind(id)
      .first<{ hash: string; observed_at: number; generation: number }>();
    const valid = receipt?.hash===row.hash && receipt.observed_at>=Math.max(row.cutoff,row.artifact_at);
    return { ...row, value: JSON.parse(row.value) as MorningValue, receipt,
      timing: !valid ? 'unverified' as const : receipt.observed_at<=row.deadline ? 'on_time' as const : 'late' as const };
  }
  async latest() {
    const row = await this.foundation.db.prepare('SELECT id FROM morning_reports ORDER BY report_date DESC LIMIT 1').first<{ id: string }>();
    return row ? this.get(row.id) : null;
  }
  async publish(lease: Lease, snapshotId: string) {
    const existing = await this.get(snapshotId);
    if (existing) {
      if (existing.run_id!==lease.runId) throw new Error('morning ownership conflict');
      return existing;
    }
    const capture = new MarketCapture(this.foundation,this.clock), db = this.foundation.db;
    const snapshot = await capture.snapshot(snapshotId,0,0);
    const screening = await new Screener(capture,this.clock).result(snapshotId,0,1);
    const research = await new ResearchPublisher(this.foundation,this.clock).publication(snapshotId);
    const watchRow = await db.prepare('SELECT value FROM early_watch_publications WHERE snapshot_id=?').bind(snapshotId).first<{ value: string }>();
    if (!snapshot || snapshot.cutoff===null || !screening || !research || !watchRow || research.inputHash!==screening.inputHash) throw new Error('morning prerequisites missing');
    // Evaluation collection is a prerequisite, including the full saved universe's opening references.
    const universe = await db.prepare("SELECT COUNT(*) AS count FROM market_decisions WHERE snapshot_id=? AND reason='eligible'").bind(snapshotId).first<{ count: number }>();
    const planned = await db.prepare("SELECT COALESCE(SUM(json_array_length(json_extract(request,'$.securities'))),0) AS count FROM market_tasks WHERE snapshot_id=? AND id LIKE 'opening:%'")
      .bind(snapshotId).first<{ count: number }>();
    if (planned?.count!==universe!.count) throw new Error('evaluation collection not planned');
    const watch = JSON.parse(watchRow.value) as WatchPublication;
    const cutoff = Math.max(snapshot.cutoff,research.cutoff,watch.cutoff);
    const now = this.clock();
    if (cutoff>now || research.publishedAt>now) throw new Error('clock before morning inputs');
    const securities: MorningValue['securities'] = [];
    for (const securityId of [...new Set([...research.main,...watch.active.map(w => w.securityId)])]) {
      const row = await db.prepare("SELECT value FROM market_decisions WHERE snapshot_id=? AND security_id=? AND reason='eligible'").bind(snapshotId,securityId).first<{ value: string }>();
      const identity = row ? (JSON.parse(row.value) as Decision).identity : null;
      if (!identity) throw new Error('morning identity unavailable');
      securities.push({ securityId, symbol: identity.symbol, brokerTicker: identity.brokerTicker, asof: identity.asof, primaryVenue: identity.primaryVenue });
    }
    const novelty: Novelty[] = [];
    for (const securityId of research.main) {
      const prior = await db.prepare(`SELECT r.report_date,d.value FROM morning_reports r JOIN research_decisions d ON d.snapshot_id=r.id
        WHERE r.report_date<? AND d.security_id=? AND EXISTS(SELECT 1 FROM json_each(r.value,'$.main') WHERE value=?) ORDER BY r.report_date DESC LIMIT 1`)
        .bind(snapshot.reportDate,securityId,securityId).first<{ report_date: string; value: string }>();
      const promoted = await db.prepare("SELECT 1 FROM early_watch_history h JOIN early_watch_publications p ON p.snapshot_id=h.snapshot_id WHERE h.security_id=? AND h.status='active' AND p.report_date<? LIMIT 1")
        .bind(securityId,snapshot.reportDate).first();
      const previous = prior ? (JSON.parse(prior.value) as PublishedDecision).assessment : null;
      const current = research.decisions.find(d => d.securityId===securityId)!.assessment!;
      const changes = previous ? (['facts','interpretations','unknowns','thesis','invalidation','attractiveness','thesisKind'] as const)
        .filter(key => JSON.stringify(previous[key])!==JSON.stringify(current[key])) : [];
      novelty.push({ securityId, kind: prior ? 'repeat' : promoted ? 'promoted/new' : 'new', previousDate: prior?.report_date ?? null,
        changes, previousVersion: prior ? (JSON.parse(prior.value) as PublishedDecision).versionId : null });
    }
    const gaps = [...watch.gaps,...research.decisions.flatMap(d => d.gap ? [d.gap] : [])];
    const status = snapshot.status==='unavailable' ? 'unavailable' : snapshot.status==='partial' || research.status==='partial' || watch.status==='partial' ? 'partial'
      : research.main.length===0 && watch.active.length===0 ? 'empty' : 'complete';
    const { decisions: _decisions,...manifest } = snapshot;
    const value: MorningValue = { snapshot: manifest, universe: { snapshotId, count: universe!.count }, inputHash: screening.inputHash,
      securities, baseline: research.baseline, main: research.main, decisions: research.decisions, watch, novelty, status, gaps: [...new Set(gaps)] };
    const encoded = JSON.stringify(value), digest = await hash(encoded);
    await this.foundation.fenced(lease,now,[
      db.prepare('INSERT INTO morning_reports(id,run_id,report_date,rule_version,cutoff,deadline,artifact_at,hash,value) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(snapshotId,lease.runId,snapshot.reportDate,snapshot.ruleVersion,cutoff,snapshot.deadline,now,digest,encoded),
      ...(['baseline','ai'] as const).map(arm => db.prepare(`INSERT INTO morning_cohorts(report_id,arm,security_id,input_hash,cutoff)
        SELECT ?,?,value,?,? FROM json_each(?)`).bind(snapshotId,arm,screening.inputHash,cutoff,JSON.stringify(arm==='baseline' ? research.baseline : research.main))),
    ]);
    return (await this.get(snapshotId))!;
  }
  async certify(lease: Lease, id: string) {
    // Keep every verification read in one primary session, then sample the actual completion clock.
    const db = this.foundation.db.withSession('first-primary');
    const row = await db.prepare('SELECT * FROM morning_reports WHERE id=?').bind(id).first<Row>();
    if (!row || row.run_id!==lease.runId || await hash(row.value)!==row.hash) throw new Error('morning readback mismatch');
    const value = JSON.parse(row.value) as MorningValue;
    const cohorts = (await db.prepare('SELECT arm,security_id,input_hash,cutoff FROM morning_cohorts WHERE report_id=? ORDER BY arm,security_id').bind(id)
      .all<{ arm: string; security_id: string; input_hash: string; cutoff: number }>()).results;
    const expected = [...value.baseline.map(security_id => ({ arm: 'baseline',security_id })),...value.main.map(security_id => ({ arm: 'ai',security_id }))]
      .sort((a,b) => a.arm.localeCompare(b.arm) || a.security_id.localeCompare(b.security_id));
    if (JSON.stringify(cohorts.map(({ arm,security_id }) => ({ arm,security_id })))!==JSON.stringify(expected)
      || cohorts.some(c => c.input_hash!==value.inputHash || c.cutoff!==row.cutoff)) throw new Error('cohort readback mismatch');
    const inputs = await db.prepare(`SELECT s.frozen,json_extract(r.value,'$.inputHash') AS input_hash,
      (SELECT COUNT(*) FROM market_decisions WHERE snapshot_id=s.id AND reason='eligible') AS count
      FROM market_snapshots s JOIN screening_results r ON r.snapshot_id=s.id WHERE s.id=?`).bind(id).first<{ frozen: number; input_hash: string; count: number }>();
    if (!inputs?.frozen || inputs.input_hash!==value.inputHash || inputs.count!==value.universe.count) throw new Error('universe readback mismatch');
    for (const decision of value.decisions) if (decision.versionId) {
      const version = await db.prepare('SELECT value FROM research_assessment_versions WHERE id=? AND snapshot_id=? AND security_id=?').bind(decision.versionId,id,decision.securityId).first<{ value: string }>();
      if (!version || version.value!==JSON.stringify(decision.assessment)) throw new Error('assessment readback mismatch');
    }
    const observedAt = this.clock();
    if (observedAt<Math.max(row.cutoff,row.artifact_at)) throw new Error('clock before morning publication');
    await this.foundation.fenced(lease,observedAt,[this.foundation.db.prepare('INSERT INTO morning_receipts(report_id,hash,observed_at,generation) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(id,row.hash,observedAt,lease.generation)]);
  }
}
