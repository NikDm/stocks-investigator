import { z } from 'zod';

export const itemSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(['snapshot_input', 'universe', 'reference', 'action', 'disposition', 'cohort', 'assessment']),
  acquiredAt: z.number().int().nonnegative(), value: z.record(z.string(), z.json()),
});
const inputSchema = z.object({
  id: z.string().min(1).max(200), securityId: z.string().min(1).max(200),
  kind: z.enum(['daily','opening','action','catalogue','calendar','identity']), source: z.string().min(1).max(100),
  asOf: z.number().int().nonnegative(), acquiredAt: z.number().int().nonnegative(),
  revisionOf: z.string().nullable(), value: z.record(z.string(), z.json()),
});
export type Input = z.infer<typeof inputSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Lease = { runId: string; owner: string; generation: number };
export type Run = { id: string; payload: string; state: string; cursor: number; attempts: number; next_at: number; updated_at: number; error_code: string | null };
type Manifest = { id: string; cutoff: number; expectedPages: number };
type ReportRow = { id: string; run_id: string; cutoff: number; manifest_hash: string; page_count: number; generation: number; artifact_at: number };
type Receipt = { manifest_hash: string; observed_at: number; generation: number };
export class Conflict extends Error {}
export async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

export class Foundation {
  constructor(readonly db: D1Database) {}
  private sql(query: string, ...values: (string | number | null)[]) { return this.db.prepare(query).bind(...values); }
  private guard(lease: Lease, now: number) {
    return this.sql(`INSERT INTO write_guard(id,valid) VALUES(1, EXISTS(
      SELECT 1 FROM pipeline WHERE id=1 AND run_id=? AND owner=? AND generation=? AND expires_at>?))`,
    lease.runId, lease.owner, lease.generation, now);
  }
  async fenced(lease: Lease, now: number, statements: D1PreparedStatement[]) {
    await this.db.batch([this.guard(lease, now), ...statements, this.sql('DELETE FROM write_guard WHERE id=1')]);
  }
  async enqueue(key: string, payload: unknown, now: number): Promise<Run> {
    const body = JSON.stringify(payload);
    if (key.length > 300 || body.length > 4096) throw new Conflict('command too large');
    await this.sql('INSERT INTO runs(id,command_key,payload,next_at,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(command_key) DO NOTHING',
      crypto.randomUUID(), key, body, now, now, now).run();
    const run = await this.sql('SELECT * FROM runs WHERE command_key=?', key).first<Run>();
    if (!run || run.payload !== body) throw new Conflict('idempotency conflict');
    return run;
  }
  async run(id: string) { return this.sql('SELECT * FROM runs WHERE id=?', id).first<Run>(); }
  async metrics() {
    const result = await this.sql('SELECT (SELECT COUNT(*) FROM input_versions) AS inputRows, (SELECT COUNT(*) FROM reports) AS reportRows')
      .all<{ inputRows: number; reportRows: number }>();
    return { ...result.results[0]!, databaseBytes: result.meta.size_after };
  }

  async budgets() {
    return (await this.sql(`SELECT b.period,b.resource,b.ceiling,COALESCE(SUM(COALESCE(r.actual,r.amount)),0) AS charged
      FROM budget_limits b LEFT JOIN reservations r ON r.resource=b.resource AND (r.month=b.period OR r.day=b.period)
      GROUP BY b.period,b.resource ORDER BY b.period DESC LIMIT 100`).all()).results;
  }
  async status() { return (await this.sql('SELECT * FROM runs ORDER BY created_at DESC LIMIT 25').all<Run>()).results; }
  async next(now: number) { return this.sql("SELECT * FROM runs WHERE state IN ('queued','running') AND next_at<=? ORDER BY created_at,id LIMIT 1", now).first<Run>(); }
  async claim(runId: string, owner: string, now: number): Promise<Lease | null> {
    const row = await this.sql(`UPDATE pipeline SET run_id=?,owner=?,generation=generation+1,expires_at=?
      WHERE id=1 AND expires_at<=? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND state IN ('queued','running') AND next_at<=?) RETURNING generation`,
    runId, owner, now + 90000, now, runId, now).first<{ generation: number }>();
    if (!row) return null;
    const lease = { runId, owner, generation: row.generation };
    await this.fenced(lease, now, [this.sql("UPDATE runs SET state='running',updated_at=? WHERE id=?", now, runId)]);
    return lease;
  }
  async renew(lease: Lease, now: number) {
    await this.fenced(lease, now, [this.sql('UPDATE pipeline SET expires_at=? WHERE id=1', now + 90000)]);
  }
  async release(lease: Lease, now: number) {
    await this.fenced(lease, now, [this.sql('UPDATE pipeline SET expires_at=0,owner=NULL WHERE id=1')]);
  }
  async stage(lease: Lease, page: number, raw: Item[], now: number, startedAt = now) {
    const items = z.array(itemSchema).min(1).max(50).parse(raw);
    const payload = JSON.stringify(items);
    if (new TextEncoder().encode(payload).length > 256 * 1024) throw new Conflict('page too large');
    const digest = await hash(payload);
    await this.fenced(lease, now, [
      this.sql(`INSERT INTO pages(run_id,page,payload,hash) VALUES(?,?,?,?)
        ON CONFLICT(run_id,page) DO UPDATE SET hash=CASE WHEN hash=excluded.hash THEN hash ELSE NULL END`, lease.runId, page, payload, digest),
      this.sql('UPDATE runs SET cursor=MAX(cursor,?),attempts=0,updated_at=? WHERE id=?', page + 1, now, lease.runId),
      this.sql("INSERT INTO stage_events(run_id,generation,at,code,page,duration_ms,item_count) VALUES(?,?,?,'page_committed',?,?,?)", lease.runId, lease.generation, now, page, now - startedAt, items.length),
    ]);
  }
  async publish(lease: Lease, manifest: Manifest, now: number) {
    const pages = (await this.sql('SELECT page,hash FROM pages WHERE run_id=? ORDER BY page', lease.runId).all<{ page: number; hash: string }>()).results;
    if (!pages.length || pages.length !== manifest.expectedPages || pages.some((p, i) => p.page !== i) || manifest.cutoff > now) throw new Conflict('incomplete manifest');
    const digest = await hash(JSON.stringify(pages));
    await this.fenced(lease, now, [
      this.sql('INSERT INTO reports(id,run_id,cutoff,manifest_hash,page_count,generation,artifact_at) VALUES(?,?,?,?,?,?,?)', manifest.id, lease.runId, manifest.cutoff, digest, pages.length, lease.generation, now),
      this.sql(`INSERT INTO artifacts(report_id,id,kind,acquired_at,value)
        SELECT ?,json_extract(j.value,'$.id'),json_extract(j.value,'$.kind'),json_extract(j.value,'$.acquiredAt'),json_extract(j.value,'$.value')
        FROM pages p,json_each(p.payload) j WHERE p.run_id=?`, manifest.id, lease.runId),
    ]);
  }
  async beginAttempt(lease: Lease, now: number) {
    await this.fenced(lease, now, [this.sql('UPDATE runs SET attempts=attempts+1,updated_at=? WHERE id=? AND attempts<3', now, lease.runId)]);
    return (await this.run(lease.runId))!.attempts;
  }
  async fail(lease: Lease, now: number) {
    const run = (await this.run(lease.runId))!;
    const terminal = run.attempts >= 3;
    const next = now + 1000 * 2 ** run.attempts + Math.floor(Math.random() * 1000);
    await this.fenced(lease, now, [
      this.sql('UPDATE runs SET state=?,next_at=?,updated_at=?,error_code=? WHERE id=?', terminal ? 'failed' : 'queued', next, now, 'stage_failed', lease.runId),
      this.sql('INSERT INTO stage_events(run_id,generation,at,code,page) VALUES(?,?,?,?,?)', lease.runId, lease.generation, now, terminal ? 'failed' : 'retry', run.cursor),
    ]);
  }
  async setBudget(period: string, resource: string, ceiling: number) {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period) || !Number.isSafeInteger(ceiling) || ceiling < 0) throw new Conflict('invalid budget');
    await this.sql('INSERT INTO budget_limits(period,resource,ceiling) VALUES(?,?,?) ON CONFLICT(period,resource) DO UPDATE SET ceiling=excluded.ceiling', period, resource, ceiling).run();
  }
  async usage(period: string, resource: string) {
    const row = await this.sql(`SELECT COALESCE(SUM(COALESCE(actual,amount)),0) AS charged FROM reservations
      WHERE resource=? AND (month=? OR day=?)`, resource, period, period).first<{ charged: number }>();
    return row!;
  }
  async reserve(lease: Lease, id: string, resource: string, amount: number, attempt: number, now: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || attempt < 1 || attempt > 3) throw new Conflict('invalid reservation');
    const day = new Date(now).toISOString().slice(0,10), month = day.slice(0,7);
    await this.fenced(lease, now, [this.sql(`INSERT INTO reservations(id,run_id,attempt,resource,month,day,amount,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE
      COALESCE((SELECT ceiling FROM budget_limits WHERE period=? AND resource=?),0) >= ? +
        (SELECT COALESCE(SUM(COALESCE(actual,amount)),0) FROM reservations WHERE month=? AND resource=?)
      AND COALESCE((SELECT ceiling FROM budget_limits WHERE period=? AND resource=?),0) >= ? +
        (SELECT COALESCE(SUM(COALESCE(actual,amount)),0) FROM reservations WHERE day=? AND resource=?)
      ON CONFLICT(id) DO NOTHING`, id, lease.runId, attempt, resource, month, day, amount, now,
      month, resource, amount, month, resource, day, resource, amount, day, resource)]);
    const row = await this.sql('SELECT * FROM reservations WHERE id=?', id).first<{ run_id: string; resource: string; amount: number; attempt: number }>();
    if (row && (row.run_id !== lease.runId || row.resource !== resource || row.amount !== amount || row.attempt !== attempt)) throw new Conflict('reservation conflict');
    return row !== null;
  }
  async capture(lease: Lease, raw: Input[], now: number) {
    const inputs = z.array(inputSchema).min(1).max(500).parse(raw);
    const rows = await Promise.all(inputs.map(async (input) => ({ ...input, hash: await hash(JSON.stringify(input)) })));
    const encoded = JSON.stringify(rows);
    if (new TextEncoder().encode(encoded).length > 256 * 1024) throw new Conflict('input page too large');
    await this.fenced(lease, now, [this.sql(`INSERT INTO input_versions(id,security_id,kind,source,as_of,acquired_at,revision_of,value,hash)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.securityId'),json_extract(value,'$.kind'),json_extract(value,'$.source'),
        json_extract(value,'$.asOf'),json_extract(value,'$.acquiredAt'),json_extract(value,'$.revisionOf'),json_extract(value,'$.value'),json_extract(value,'$.hash')
      FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET hash=excluded.hash`, encoded)]);
  }

  async inputs(securityId: string, afterId = '') {
    return (await this.sql('SELECT * FROM input_versions WHERE security_id=? AND id>? ORDER BY id LIMIT 100', securityId, afterId).all<{ id: string; hash: string }>()).results;
  }
  async reconcile(id: string, actual: number) {
    if (!Number.isSafeInteger(actual) || actual < 0) throw new Conflict('invalid usage');
    await this.sql('UPDATE reservations SET actual=? WHERE id=? AND actual IS NULL', actual, id).run();
  }
  async complete(lease: Lease, now: number) {
    await this.fenced(lease, now, [
      this.sql("UPDATE runs SET state='completed',updated_at=?,error_code=NULL WHERE id=?", now, lease.runId),
      this.sql("INSERT INTO stage_events(run_id,generation,at,code,page) SELECT ?,?,?,'completed',cursor FROM runs WHERE id=?", lease.runId, lease.generation, now, lease.runId),
    ]);
  }
  async certify(lease: Lease, reportId: string, clock: () => number) {
    const report = await this.report(reportId);
    if (!report || report.run_id !== lease.runId) throw new Conflict('report missing');
    const pages = (await this.db.withSession('first-primary').prepare('SELECT page,hash,json_array_length(payload) AS size FROM pages WHERE run_id=? ORDER BY page')
      .bind(lease.runId).all<{ page: number; hash: string; size: number }>()).results;
    if (pages.length !== report.page_count || await hash(JSON.stringify(pages.map(({ page, hash }) => ({ page, hash })))) !== report.manifest_hash
      || pages.reduce((n, p) => n + p.size, 0) !== report.itemCount) throw new Conflict('readback mismatch');
    const observedAt = clock();
    if (observedAt < report.cutoff || observedAt < report.artifact_at) throw new Conflict('clock before publication');
    await this.fenced(lease, observedAt, [this.sql(`INSERT INTO publication_receipts(report_id,manifest_hash,observed_at,generation)
      VALUES(?,?,?,?) ON CONFLICT(report_id) DO NOTHING`, reportId, report.manifest_hash, observedAt, lease.generation)]);
  }
  async reports() { return (await this.sql('SELECT * FROM reports ORDER BY artifact_at DESC LIMIT 25').all<ReportRow>()).results; }
  async report(id: string, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Conflict('invalid offset');
    const session = this.db.withSession('first-primary');
    const report = await session.prepare('SELECT * FROM reports WHERE id=?').bind(id).first<ReportRow>();
    if (!report) return null;
    const items = (await session.prepare('SELECT id,kind,acquired_at AS acquiredAt,value FROM artifacts WHERE report_id=? ORDER BY kind,id LIMIT 100 OFFSET ?').bind(id, offset).all<{ id: string; kind: Item['kind']; acquiredAt: number; value: string }>()).results;
    const receipt = await session.prepare('SELECT * FROM publication_receipts WHERE report_id=?').bind(id).first<Receipt>();
    const count = await session.prepare('SELECT COUNT(*) AS total FROM artifacts WHERE report_id=?').bind(id).first<{ total: number }>();
    return { ...report, itemCount: count!.total, items: items.map((item) => ({ ...item, value: JSON.parse(item.value) as Item['value'] })), receipt };
  }
}
