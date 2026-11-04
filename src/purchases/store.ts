import { z } from 'zod';
import { Conflict, Foundation, hash } from '../persistence';
import { D } from '../decimal';
import { localDate } from '../market/calendar';

const common = { purchaseId: z.string().regex(/^[\w-]{1,100}$/), expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), key: z.string().regex(/^[\w-]{1,100}$/) };
const fields = {
  securityId: z.string().trim().min(1).max(200),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s),
  entryPriceUsd: z.string().max(60).regex(/^\d+(\.\d+)?$/).pipe(z.string().refine(s => new D(s).gt(0))),
  opportunityId: z.string().trim().min(1).max(200).optional(), note: z.string().trim().max(500).optional(),
};
export const purchaseCommand = z.discriminatedUnion('action',[
  z.object({ ...common, ...fields, action: z.literal('record') }).strict(),
  z.object({ ...common, ...fields, action: z.literal('correct') }).strict(),
  z.object({ ...common, action: z.literal('remove') }).strict(),
]);
export type Purchase = {
  purchaseId: string; originalRecordId: string; securityId: string; revision: number; purchaseDate: string;
  entryPriceUsd: string; precision: 'date'; opportunityId?: string; note?: string;
  acquiredAt: number; originalAcquiredAt: number; status: 'recorded' | 'removed';
};
export class Purchases {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  async history(id: string, after = 0): Promise<{ sequence: number; action: string; value: Purchase }[]> {
    return (await this.foundation.db.prepare('SELECT sequence,action,value FROM purchase_events WHERE purchase_id=? AND sequence>? ORDER BY sequence LIMIT 100').bind(id,after)
      .all<{ sequence: number; action: string; value: string }>()).results.map(r => ({ ...r, value: JSON.parse(r.value) as Purchase }));
  }
  async get(id: string): Promise<Purchase | null> {
    const row = await this.foundation.db.prepare('SELECT value FROM purchase_events WHERE purchase_id=? ORDER BY revision DESC LIMIT 1').bind(id).first<{ value: string }>();
    return row ? JSON.parse(row.value) as Purchase : null;
  }
  async list(after = ''): Promise<Purchase[]> {
    return (await this.foundation.db.prepare('SELECT e.value FROM purchase_events e WHERE purchase_id>? AND revision=(SELECT MAX(revision) FROM purchase_events p WHERE p.purchase_id=e.purchase_id) ORDER BY purchase_id LIMIT 100').bind(after)
      .all<{ value: string }>()).results.map(r => JSON.parse(r.value) as Purchase);
  }
  async command(identity: string, command: z.infer<typeof purchaseCommand>): Promise<Purchase> {
    const requestHash = await hash(JSON.stringify(command));
    const replay = async () => {
      const row = await this.foundation.db.prepare('SELECT request_hash,value FROM purchase_events WHERE identity=? AND command_key=?').bind(identity,command.key).first<{ request_hash: string; value: string }>();
      if (!row) return null;
      if (row.request_hash!==requestHash) throw new Conflict('purchase idempotency conflict');
      return JSON.parse(row.value) as Purchase;
    };
    const prior = await replay(); if (prior) return prior;
    const current = await this.get(command.purchaseId);
    if ((current?.revision ?? 0)!==command.expectedRevision || current?.status==='removed' || (command.action==='record')!==(!current)) {
      const original = await replay(); if (original) return original;
      throw new Conflict('purchase revision conflict');
    }
    const now = this.clock();
    let value: Purchase;
    if (command.action==='remove') {
      value = { ...current!, revision: command.expectedRevision+1, status: 'removed', acquiredAt: now };
    } else {
      if (command.purchaseDate>localDate(now,'America/New_York')) throw new Conflict('purchase date is in the future');
      if (current && current.securityId!==command.securityId) throw new Conflict('security identity cannot change; remove and record separately');
      if (command.opportunityId) {
        const opportunity = await this.foundation.db.prepare('SELECT 1 FROM tracking_opportunities WHERE security_id=?').bind(command.opportunityId).first();
        if (!opportunity || command.opportunityId!==command.securityId) throw new Conflict('linked opportunity must match the security');
      }
      value = { purchaseId: command.purchaseId, originalRecordId: command.purchaseId, securityId: command.securityId,
        revision: command.expectedRevision+1, purchaseDate: command.purchaseDate, entryPriceUsd: command.entryPriceUsd,
        precision: 'date', acquiredAt: now, originalAcquiredAt: current?.originalAcquiredAt ?? now, status: 'recorded',
        ...(command.opportunityId ? { opportunityId: command.opportunityId } : {}), ...(command.note ? { note: command.note } : {}) };
    }
    try {
      await this.foundation.db.prepare('INSERT INTO purchase_events(identity,command_key,request_hash,purchase_id,revision,action,acquired_at,value) VALUES(?,?,?,?,?,?,?,?)')
        .bind(identity,command.key,requestHash,command.purchaseId,value.revision,command.action,now,JSON.stringify(value)).run();
      return value;
    } catch (error) {
      const original = await replay(); if (original) return original;
      if (error instanceof Error && /purchase revision conflict|UNIQUE constraint failed: purchase_events/.test(error.message)) throw new Conflict('purchase revision conflict');
      throw error;
    }
  }
}
