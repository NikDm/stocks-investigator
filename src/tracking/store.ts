import { z } from 'zod';
import { Conflict, Foundation, hash } from '../persistence';
import { instant, localDate } from '../market/calendar';
import { MarketCapture } from '../market/capture';
import type { Snapshot } from '../market/types';
import type { TrackingCheck } from './runtime';
import type { Assessment } from '../research/assessment';

const common = { securityId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), key: z.string().regex(/^[\w-]{1,100}$/) };
export const trackingCommand = z.discriminatedUnion('action',[
  z.object({ ...common, action: z.literal('select'), versionId: z.string().min(1).max(100) }).strict(),
  z.object({ ...common, action: z.literal('renew'), versionId: z.string().min(1).max(100) }).strict(),
  z.object({ ...common, action: z.literal('archive') }).strict(),
]);
export type Opportunity = { securityId: string; revision: number; status: 'active' | 'needs_renewal' | 'archived';
  thesisStatus: 'positive' | 'invalidated' | 'insufficient_evidence'; versionId: string; thesisVersionId: string; selectedAt: number; updatedAt: number;
  startSession: string; checkpointAt: number; interval: number; invalidatedAt: number | null; invalidationReasons: string[] };
export class Tracking {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  async get(securityId: string): Promise<Opportunity | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM tracking_opportunities WHERE security_id=?').bind(securityId).first<{ value: string }>();
    return row ? JSON.parse(row.value) as Opportunity : null;
  }
  async list(): Promise<Opportunity[]> {
    return (await this.foundation.db.prepare('SELECT value FROM tracking_opportunities ORDER BY security_id').all<{ value: string }>()).results.map(r => JSON.parse(r.value) as Opportunity);
  }
  async history(securityId: string) {
    return (await this.foundation.db.prepare('SELECT action,at,value FROM tracking_events WHERE security_id=? ORDER BY revision').bind(securityId)
      .all<{ action: string; at: number; value: string }>()).results.map(r => ({ ...r, value: JSON.parse(r.value) as Opportunity }));
  }
  async version(id: string): Promise<Assessment | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM research_assessment_versions WHERE id=? UNION ALL SELECT value FROM tracking_versions WHERE id=?').bind(id,id).first<{ value: string }>();
    return row ? JSON.parse(row.value) as Assessment : null;
  }
  async checks(securityId: string): Promise<TrackingCheck[]> {
    return (await this.foundation.db.prepare('SELECT value FROM tracking_checks WHERE security_id=? ORDER BY at DESC,snapshot_id DESC LIMIT 100').bind(securityId)
      .all<{ value: string }>()).results.map(r => JSON.parse(r.value) as TrackingCheck);
  }
  async calendar(): Promise<Snapshot> {
    const row = await this.foundation.db.prepare('SELECT id FROM market_snapshots WHERE frozen=1 ORDER BY report_date DESC,rowid DESC LIMIT 1').first<{ id: string }>();
    const snapshot = row ? await new MarketCapture(this.foundation,this.clock).snapshot(row.id,0,0) : null;
    const date = localDate(this.clock(),'America/New_York');
    if (!snapshot || snapshot.calendarFrom>date || snapshot.calendarThrough<date) throw new Conflict('current calendar unavailable');
    return snapshot;
  }
  async event(identity: string, key: string, requestHash: string, action: string, value: Opportunity) {
    await this.foundation.db.prepare('INSERT INTO tracking_events(identity,command_key,request_hash,security_id,revision,at,action,value) VALUES(?,?,?,?,?,?,?,?)')
      .bind(identity,key,requestHash,value.securityId,value.revision,this.clock(),action,JSON.stringify(value)).run();
    return value;
  }
  private interval(snapshot: Snapshot, renewal: boolean) {
    const date = localDate(this.clock(),'America/New_York');
    const sessions = snapshot.calendar.filter(s => renewal ? s.date>date : s.date>=date);
    if (sessions.length<20) throw new Conflict('renewal calendar incomplete');
    return { startSession: sessions[0]!.date, checkpointAt: instant(sessions[19]!.date,sessions[19]!.close,'America/New_York') };
  }
  async command(identity: string, raw: unknown): Promise<Opportunity> {
    const command = trackingCommand.parse(raw), requestHash = await hash(JSON.stringify(command));
    const replay = async () => {
      const row = await this.foundation.db.prepare('SELECT request_hash,value FROM tracking_events WHERE identity=? AND command_key=?').bind(identity,command.key).first<{ request_hash: string; value: string }>();
      if (!row) return null;
      if (row.request_hash!==requestHash) throw new Conflict('tracking idempotency conflict');
      return JSON.parse(row.value) as Opportunity;
    };
    const prior = await replay(); if (prior) return prior;
    const current = await this.get(command.securityId);
    if ((current?.revision ?? 0)!==command.expectedRevision) throw new Conflict('tracking revision conflict');
    const now = this.clock();
    let value: Opportunity;
    if (command.action==='archive') {
      if (!current || current.status==='archived') throw new Conflict('opportunity not occupied');
      value = { ...current, revision: current.revision+1, status: 'archived', updatedAt: now };
    } else {
      if (command.action==='select' && current?.status && current.status!=='archived') throw new Conflict('already tracked');
      if (command.action==='renew' && (!current || current.status==='archived' || now<current.checkpointAt)) throw new Conflict('renewal not due');
      const a = await this.version(command.versionId);
      if (!a || a.securityId!==command.securityId || a.cutoff>now || a.expiresAt<=now || a.outcome!=='accepted') throw new Conflict('current assessment required');
      if (current?.invalidatedAt!==null && current?.invalidatedAt!==undefined) {
        const recorded = await this.version(current.thesisVersionId);
        if (a.cutoff<=current.invalidatedAt || !recorded || a.thesis?.text===recorded.thesis?.text) throw new Conflict('current assessment requires revised reasoning');
      }
      const snapshot = await this.calendar();
      if (localDate(a.marketAsOf,'America/New_York')!==snapshot.expectedSession) throw new Conflict('current assessment market session required');
      // A fresh, dated broker identity is required for a new manual selection.
      if (command.action==='select') {
        const decision = await this.foundation.db.prepare("SELECT 1 AS ok FROM market_decisions WHERE snapshot_id=? AND security_id=? AND reason='eligible'").bind(snapshot.id,command.securityId).first();
        if (!decision || snapshot.reportDate>localDate(now,'Europe/Zagreb') || snapshot.referenceDeadline<=now) throw new Conflict('current broker identity unavailable');
      }
      value = { securityId: command.securityId, revision: (current?.revision ?? 0)+1, status: 'active', thesisStatus: 'positive',
        versionId: command.versionId, thesisVersionId: command.versionId, selectedAt: command.action==='renew' ? current!.selectedAt : now, updatedAt: now, ...this.interval(snapshot,command.action==='renew'),
        interval: (current?.interval ?? 0)+1, invalidatedAt: null, invalidationReasons: [] };
    }
    try { return await this.event(identity,command.key,requestHash,command.action,value); }
    catch (error) {
      const original = await replay(); if (original) return original;
      const message = error instanceof Error ? error.message : '';
      if (message.includes('tracking capacity')) throw new Conflict('all ten tracking slots are occupied');
      if (message.includes('tracking revision') || message.includes('UNIQUE constraint failed: tracking_events')) throw new Conflict('tracking revision conflict');
      throw error;
    }
  }
  async checkpoints() {
    const rows = await this.list();
    for (const row of rows) if (row.status==='active' && this.clock()>=row.checkpointAt) {
      try { await this.event('system',`checkpoint-${row.securityId}-${row.interval}`,String(row.checkpointAt),'checkpoint',
        { ...row, revision: row.revision+1, status: 'needs_renewal', updatedAt: this.clock() }); }
      catch { if ((await this.get(row.securityId))?.revision===row.revision) throw new Conflict('checkpoint failed'); }
    }
  }
}
