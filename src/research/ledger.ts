import { Foundation, type Lease } from '../persistence';

export type CallKind = 'search' | 'fetch' | 'model' | 'broad_search' | 'retain';
type Scope = 'day' | 'month' | 'run' | 'pass';
type Allocation = { resource: string; amount: number; limits: Partial<Record<Scope,number>> };
export type ModelAllowance = { input: number; output: number };
// Microdollars, with a conservative 25% gross-up. No caching/batch discounts.
export const modelCost = (input: number, output: number) => Math.ceil((input + output * 5) * 1.25);
export class ResearchLedger {
  constructor(readonly foundation: Foundation, readonly lease: Lease, readonly clock: () => number = Date.now) {}
  private period(scope: Scope, passId = '') {
    const day = new Date(this.clock()).toISOString().slice(0,10);
    return ({ day, month: day.slice(0,7), run: this.lease.runId, pass: passId })[scope];
  }
  async reserve(kind: CallKind, passId: string, allowance?: ModelAllowance | number): Promise<string> {
    if (!passId || passId.length>300) throw new Error('invalid pass');
    const allocations: Allocation[] = [];
    if (kind==='search' || kind==='broad_search') {
      allocations.push({ resource: 'search', amount: 1, limits: { day: 30, month: 1000 } },
        { resource: 'search_microdollars', amount: 5000, limits: { month: 5000000 } });
      if (kind==='broad_search') allocations.push({ resource: 'broad_search', amount: 1, limits: { day: 3 } });
    } else if (kind==='fetch') {
      allocations.push({ resource: 'fetch', amount: 1, limits: { day: 50, month: 1100 } });
    } else if (kind==='model') {
      if (typeof allowance!=='object' || !Number.isSafeInteger(allowance.input) || allowance.input<1
        || !Number.isSafeInteger(allowance.output) || allowance.output<1) throw new Error('unknown model allowance');
      allocations.push({ resource: 'turn', amount: 1, limits: { pass: 4, run: 60, day: 100, month: 2000 } },
        { resource: 'input', amount: allowance.input, limits: { pass: 12000, day: 180000, month: 6000000 } },
        { resource: 'output', amount: allowance.output, limits: { pass: 1200, day: 18000, month: 600000 } },
        { resource: 'model_microdollars', amount: modelCost(allowance.input,allowance.output), limits: { month: 15000000 } });
    } else {
      if (typeof allowance!=='number' || !Number.isSafeInteger(allowance) || allowance<0) throw new Error('invalid retention');
      allocations.push({ resource: 'retained_bytes', amount: allowance, limits: { month: 100*1024*1024 } });
    }
    if (kind==='search' || kind==='fetch') allocations.push({ resource: 'tool', amount: 1, limits: { pass: 6 } });
    const id = crypto.randomUUID(), now = this.clock(), db = this.foundation.db;
    const statements = [db.prepare('INSERT INTO research_calls(id,run_id,pass_id,kind,created_at) VALUES(?,?,?,?,?)')
      .bind(id,this.lease.runId,passId,kind,now)];
    for (const { resource, amount, limits } of allocations) for (const [scope,ceiling] of Object.entries(limits)) {
      statements.push(db.prepare('INSERT INTO research_charges(call_id,scope,period,resource,amount,ceiling) VALUES(?,?,?,?,?,?)')
        .bind(id,scope,this.period(scope as Scope,passId),resource,amount,ceiling));
    }
    await this.foundation.fenced(this.lease,now,statements);
    return id;
  }
  async settleModel(id: string, usage: ModelAllowance) {
    if (![usage.input,usage.output].every(n => Number.isSafeInteger(n) && n>=0)) throw new Error('invalid usage');
    const db = this.foundation.db;
    const rows = (await db.prepare(`SELECT resource,MIN(amount) AS amount FROM research_charges
      WHERE call_id=? AND call_id IN (SELECT id FROM research_calls WHERE run_id=?) GROUP BY resource`).bind(id,this.lease.runId).all<{ resource: string; amount: number }>()).results;
    const actual: Record<string,number> = { input: usage.input, output: usage.output, turn: 1, model_microdollars: modelCost(usage.input,usage.output) };
    if (rows.length!==4) throw new Error('invalid model reservation');
    if (rows.some(r => actual[r.resource]===undefined || actual[r.resource]!>r.amount)) {
      await this.foundation.fenced(this.lease,this.clock(),[db.prepare('INSERT INTO research_halts(call_id,at,code) VALUES(?,?,?) ON CONFLICT(call_id) DO NOTHING')
        .bind(id,this.clock(),'usage_exceeded_reservation')]);
      throw new Error('usage exceeds reservation; research halted');
    }
    await this.foundation.fenced(this.lease,this.clock(),[
      ...rows.map(r => db.prepare('UPDATE research_charges SET actual=? WHERE call_id=? AND resource=?')
        .bind(actual[r.resource],id,r.resource)),
      db.prepare('UPDATE research_calls SET settled=1 WHERE id=? AND run_id=? AND kind=\'model\' AND settled=0').bind(id,this.lease.runId),
    ]);
  }
  async usage(scope: Scope, resource: string, passId = '') {
    const row = await this.foundation.db.prepare(`SELECT COALESCE(SUM(COALESCE(actual,amount)),0) AS reserved
      FROM research_charges WHERE scope=? AND period=? AND resource=?`).bind(scope,this.period(scope,passId),resource).first<{ reserved: number }>();
    return row!;
  }
}
