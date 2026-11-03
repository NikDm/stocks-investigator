import { refreshPolicy, nextRefreshTick, refreshWorkWindow } from './policy';
import { z } from 'zod';
import { Conflict, Foundation } from '../persistence';
import { MorningReports } from '../morning/publication';
import { ResearchPublisher, type QueueEntry } from '../research/publisher';
import { Tracking, type Opportunity } from '../tracking/store';
import type { ScreenRow } from '../screening/screen';
import { localDate } from '../market/calendar';

export const refreshCommand = z.object({ morningId: z.string().min(1).max(200), key: z.string().regex(/^[\w-]{1,100}$/) }).strict();
export type RefreshEntry = QueueEntry & { previousId: string | null; morningVersionId: string | null; tracked?: Opportunity; morningClose?: { price: string; eventAt: number; acquiredAt: number; inputId: string } };
export type RefreshPlan = { morningId: string; session: string; inputHash: string; baseline: string[]; entries: RefreshEntry[]; cutoff: number; open: number };
export class Refreshes {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  async get(runId: string) {
    const row = await this.foundation.db.prepare('SELECT plan FROM refresh_requests WHERE run_id=?').bind(runId).first<{ plan: string }>();
    if (!row) return null;
    return { run: (await this.foundation.run(runId))!, plan: JSON.parse(row.plan) as RefreshPlan };
  }
  async list(morningId: string) {
    const rows = (await this.foundation.db.prepare('SELECT run_id FROM refresh_requests WHERE morning_id=? ORDER BY accepted_at,run_id').bind(morningId).all<{ run_id: string }>()).results;
    return Promise.all(rows.map(r => this.get(r.run_id)));
  }
  async availability(morningId: string) {
    const morning = await new MorningReports(this.foundation,this.clock).get(morningId);
    if (!morning || morning.report_date!==localDate(this.clock(),'America/New_York')) return 'current morning required';
    const nextTick = nextRefreshTick(this.clock());
    const queue = (await new ResearchPublisher(this.foundation,this.clock).plan(morningId))?.queue ?? [];
    const tracked = (await new Tracking(this.foundation,this.clock).list()).filter(t => t.status==='active' && t.checkpointAt>this.clock());
    const count = new Set([...queue.map(q => q.securityId),...tracked.map(t => t.securityId)]).size;
    const workWindow = refreshWorkWindow(count);
    if (nextTick+workWindow>=morning.value.snapshot.open-refreshPolicy.freezeMarginMs) return 'refresh cutoff cannot fit';
    const active = await this.foundation.db.prepare("SELECT 1 FROM refresh_requests q JOIN runs r ON r.id=q.run_id WHERE r.state IN ('queued','running') LIMIT 1").first();
    if (active) return 'refresh already active';
    const counts = await this.foundation.db.prepare('SELECT COUNT(*) AS count,MAX(accepted_at) AS last FROM refresh_requests WHERE session=?').bind(morning.report_date).first<{ count: number; last: number | null }>();
    if (counts!.count>=refreshPolicy.sessionLimit) return 'refresh session limit';
    if (counts!.last!==null && this.clock()-counts!.last<refreshPolicy.cooldownMs) return 'refresh cooldown';
    return null;
  }
  async command(identity: string, raw: unknown): Promise<{ runId: string; nextTickDelaySeconds: number }> {
    const command = refreshCommand.parse(raw), db = this.foundation.db;
    const result = (runId: string) => ({ runId, nextTickDelaySeconds: Math.ceil((nextRefreshTick(this.clock())-this.clock())/1000) });
    const replay = async () => db.prepare('SELECT run_id,morning_id FROM refresh_commands WHERE identity=? AND command_key=?').bind(identity,command.key).first<{ run_id: string; morning_id: string }>();
    const prior = await replay();
    if (prior) { if (prior.morning_id!==command.morningId) throw new Conflict('refresh idempotency conflict'); return result(prior.run_id); }
    const active = await db.prepare("SELECT q.run_id,q.morning_id FROM refresh_requests q JOIN runs r ON r.id=q.run_id WHERE r.state IN ('queued','running') LIMIT 1").first<{ run_id: string; morning_id: string }>();
    if (active) {
      if (active.morning_id!==command.morningId) throw new Conflict('refresh already active');
      await db.prepare('INSERT INTO refresh_commands(identity,command_key,morning_id,run_id) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(identity,command.key,command.morningId,active.run_id).run();
      const saved = (await replay())!;
      if (saved.morning_id!==command.morningId) throw new Conflict('refresh idempotency conflict');
      return result(saved.run_id);
    }
    const disabled = await this.availability(command.morningId); if (disabled) throw new Conflict(disabled);
    const morning = (await new MorningReports(this.foundation,this.clock).get(command.morningId))!;
    const research = (await new ResearchPublisher(this.foundation,this.clock).plan(command.morningId))!;
    const tracking = new Tracking(this.foundation,this.clock); await tracking.checkpoints();
    const entries: RefreshEntry[] = research.queue.map(q => ({ ...q, previousId: morning.value.decisions.find(d => d.securityId===q.securityId)?.versionId ?? null,
      morningVersionId: morning.value.decisions.find(d => d.securityId===q.securityId)?.versionId ?? null }));
    for (const tracked of (await tracking.list()).filter(t => t.status==='active')) {
      const overlap = entries.find(e => e.securityId===tracked.securityId);
      if (overlap) { overlap.previousId = tracked.versionId; overlap.tracked = tracked; continue; }
      const previous = await tracking.version(tracked.versionId);
      const metric = await db.prepare("SELECT value FROM screening_metrics WHERE snapshot_id=? AND json_extract(value,'$.securityId')=?").bind(command.morningId,tracked.securityId).first<{ value: string }>();
      const row = metric ? JSON.parse(metric.value) as ScreenRow : null;
      if (!previous) throw new Conflict('tracked assessment unavailable');
      entries.push({ ticker: row?.ticker ?? tracked.securityId, securityId: tracked.securityId, issuerId: row?.identity?.issuerId ?? '', symbol: row?.identity?.symbol ?? '',
        marketAsOf: row?.eventThrough ?? previous.marketAsOf, metrics: row?.metrics ?? previous.marketReferences, inputIds: row?.inputIds ?? [], openAt: morning.value.snapshot.open,
        previousId: tracked.versionId, tracked, morningVersionId: morning.value.trackingChecks?.find(c => c.securityId===tracked.securityId)?.versionId ?? null });
    }
    for (const entry of entries) {
      const close = await db.prepare(`SELECT o.id,o.value,MIN(s.acquired_at) AS acquired_at FROM market_sightings s JOIN market_observations o ON o.id=s.input_id
        WHERE s.snapshot_id=? AND s.security_id=? AND s.kind='daily' AND s.basis='raw' AND s.session=? AND s.acquired_at<=?
        GROUP BY o.id ORDER BY s.acquired_at DESC LIMIT 1`).bind(command.morningId,entry.securityId,morning.value.snapshot.expectedSession,morning.value.snapshot.cutoff)
        .first<{ id: string; value: string; acquired_at: number }>();
      const raw = close ? JSON.parse(close.value) as { eventAt: number; value: { c: string } } : null;
      if (raw && close) entry.morningClose = { price: raw.value.c, eventAt: raw.eventAt, acquiredAt: close.acquired_at, inputId: close.id };
    }
    const now = this.clock(), runId = crypto.randomUUID();
    if (nextRefreshTick(now)+refreshWorkWindow(entries.length)>=morning.value.snapshot.open-refreshPolicy.freezeMarginMs) throw new Conflict('refresh cutoff cannot fit');
    const plan: RefreshPlan = { morningId: command.morningId, session: morning.report_date, inputHash: morning.value.inputHash, baseline: morning.value.baseline,
      entries, cutoff: morning.value.snapshot.open-refreshPolicy.freezeMarginMs, open: morning.value.snapshot.open };
    try {
      await db.batch([
        db.prepare('INSERT INTO runs(id,command_key,payload,next_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(runId,`refresh:${identity}:${command.key}`,JSON.stringify({ kind: 'refresh' }),now,now,now),
        db.prepare('INSERT INTO refresh_requests(run_id,morning_id,session,accepted_at,plan) VALUES(?,?,?,?,?)').bind(runId,command.morningId,plan.session,now,JSON.stringify(plan)),
        db.prepare('INSERT INTO refresh_commands(identity,command_key,morning_id,run_id) VALUES(?,?,?,?)').bind(identity,command.key,command.morningId,runId),
      ]);
    } catch (error) {
      const saved = await replay();
      if (saved) { if (saved.morning_id!==command.morningId) throw new Conflict('refresh idempotency conflict'); return result(saved.run_id); }
      const message = error instanceof Error ? error.message : '';
      if (message.includes('refresh request limit')) return this.command(identity,command);
      throw error;
    }
    return result(runId);
  }
}
