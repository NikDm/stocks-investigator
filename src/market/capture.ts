import { Foundation, hash, type Lease } from '../persistence';
import { z } from 'zod';
import { validBar, liquid, compare, officialOpening, openingTime } from './quality';
import { instant, schedule } from './calendar';
import { beginSchema, type Begin, type Decision, type Snapshot, observationSchema, type SavedObservation, requestSchema, type MarketRequest, type Task, type Identity } from './types';

const allowedTypes = new Set(['Common Stock','ADR','REIT','NY Reg Shrs']);
export const venues: Record<string, string> = { NYSE: 'N', NASDAQ: 'Q', AMEX: 'A', 'NYSE American': 'A', BATS: 'Z', 'Cboe BZX': 'Z', TXSE: 'F' };
export class MarketCapture {
  constructor(readonly foundation: Foundation, readonly clock: () => number = Date.now) {}
  private sql(query: string, ...args: (string | number | null)[]) { return this.foundation.db.prepare(query).bind(...args); }
  async begin(lease: Lease, raw: Begin) {
    const input = beginSchema.parse(raw), fingerprint = await hash(JSON.stringify(input));
    const existing = await this.sql('SELECT fingerprint FROM market_snapshots WHERE id=?', input.id).first<{ fingerprint: string }>();
    if (existing) { if (existing.fingerprint !== fingerprint) throw new Error('snapshot conflict'); return; }
    if (!input.instruments.length || !input.exchanges.length) throw new Error('catalogue unavailable');
    const timing = schedule(input.reportDate, input.calendar, input.calendarFrom, input.calendarThrough);
    const schedules = new Map<number, Set<string>>();
    for (const exchange of input.exchanges) for (const s of exchange.workingSchedules) {
      const names = schedules.get(s.id) ?? new Set<string>(); names.add(exchange.name); schedules.set(s.id, names);
    }
    const identityGroups = new Map<string, typeof input.identities>();
    const symbolSecurities = new Map<string, Set<string>>();
    for (const identity of input.identities) {
      const key = `${identity.brokerTicker}:${identity.isin}:${identity.asof}`;
      const group = identityGroups.get(key) ?? []; group.push(identity); identityGroups.set(key,group);
      const symbolKey = `${identity.symbol}:${identity.asof}`;
      const securities = symbolSecurities.get(symbolKey) ?? new Set<string>(); securities.add(`${identity.securityId}:${identity.isin}`); symbolSecurities.set(symbolKey,securities);
    }
    const decisions: Decision[] = input.instruments.map(i => {
      const exchange = schedules.get(i.workingScheduleId);
      const matches = identityGroups.get(`${i.ticker}:${i.isin}:${input.reportDate}`) ?? [];
      const identity = matches.length === 1 ? matches[0]! : null;
      const symbolConflict = identity && (symbolSecurities.get(`${identity.symbol}:${identity.asof}`)?.size ?? 0) > 1;
      const reason = i.type !== 'STOCK' || i.currencyCode !== 'USD' ? 'outside_scope'
        : !exchange || exchange.size !== 1 ? 'unresolved_schedule'
        : !['NYSE','NASDAQ'].includes([...exchange][0]!) ? 'outside_scope'
        : !identity || symbolConflict ? (input.mappingGaps.find(g => g.ticker === i.ticker)?.reason ?? 'ambiguous_identity')
        : identity.listing !== 'verified' ? `listing_${identity.listing}`
        : !allowedTypes.has(identity.securityType) ? 'unsupported_type' : 'awaiting_history';
      return { ticker: i.ticker, isin: i.isin, reason, identity, inputIds: [] };
    });
    if (new Set(decisions.map(d => d.ticker)).size !== decisions.length) throw new Error('duplicate broker identity');
    const manifest: Snapshot = { ruleVersion: 'screen-eval-v1', id: input.id, reportDate: input.reportDate, expectedSession: timing.expectedSession,
      deadline: timing.deadline, open: timing.open, close: timing.close, auctionAfter: timing.auctionAfter,
      referenceDeadline: timing.referenceDeadline, startedAt: this.clock(), cutoff: null, status: 'acquiring',
      splitVolumeVerified: input.splitVolumeVerified, mappingVersion: input.mappingVersion, sourceReceipts: input.sourceReceipts, decisions: [], calendar: timing.sessions, calendarFrom: input.calendarFrom, calendarThrough: input.calendarThrough };
    const writes = [this.sql('INSERT INTO market_snapshots(id,run_id,fingerprint,manifest,report_date,horizon_end) VALUES(?,?,?,?,?,?)', input.id, lease.runId, fingerprint, JSON.stringify(manifest),input.reportDate,timing.sessions.filter(s => s.date >= input.reportDate)[29]?.date ?? null)];
    for (let offset = 0; offset < decisions.length; offset += 50) {
      const page = JSON.stringify(decisions.slice(offset, offset + 50));
      if (new TextEncoder().encode(page).length > 256 * 1024) throw new Error('identity page too large');
      writes.push(this.sql(`INSERT INTO market_decisions(snapshot_id,ticker,security_id,reason,value)
        SELECT ?,json_extract(value,'$.ticker'),json_extract(value,'$.identity.securityId'),json_extract(value,'$.reason'),value FROM json_each(?)`, input.id, page));
    }
    await this.foundation.fenced(lease, this.clock(), writes);
  }
  async plan(lease: Lease, id: string, raw: z.input<typeof requestSchema>[]) {
    const snapshot = await this.snapshot(id,0,0);
    if (!snapshot) throw new Error('snapshot missing');
    for (const item of raw) {
      const request = requestSchema.parse(item);
      if (request.start > request.end) throw new Error('invalid request interval');
      if (snapshot.cutoff !== null && request.kind === 'bars' && request.basis === 'split') throw new Error('frozen screening inputs');
      const encoded = JSON.stringify(request);
      const existing = await this.sql('SELECT request FROM market_tasks WHERE snapshot_id=? AND id=?', id, request.id).first<{ request: string }>();
      if (existing) { if (existing.request !== encoded) throw new Error('task conflict'); continue; }
      await this.foundation.fenced(lease, this.clock(), [this.sql('INSERT INTO market_tasks(snapshot_id,id,request,next_at) VALUES(?,?,?,?)', id, request.id, encoded, request.notBefore)]);
    }
  }
  async tasks(id: string, afterId = '', dueAt: number | null = null): Promise<Task[]> {
    return (await this.sql("SELECT * FROM market_tasks WHERE snapshot_id=? AND id>? AND (? IS NULL OR (state='pending' AND next_at<=?)) ORDER BY id LIMIT 1000", id, afterId, dueAt, dueAt).all<Omit<Task,'request'> & { request: string }>()).results.map(r => ({ ...r, request: JSON.parse(r.request) as MarketRequest }));
  }
  async taskCheckpoint(lease: Lease, id: string, task: Task) {
    const committed = await this.sql('SELECT value FROM market_pages WHERE snapshot_id=? AND task=? AND page=?', id, task.id, task.page).first<{ value: string }>();
    if (!committed) return false;
    const { nextToken } = JSON.parse(committed.value) as { nextToken: string | null };
    if (nextToken !== null && nextToken === task.token) throw new Error('repeated pagination token');
    if (nextToken === null) await this.planFreshnessCheck(lease,id,task);
    await this.foundation.fenced(lease, this.clock(), [this.sql("UPDATE market_tasks SET token=?,page=page+1,attempts=0,state=?,reason=NULL WHERE snapshot_id=? AND id=? AND page=?", nextToken, nextToken === null ? 'complete' : 'pending', id, task.id, task.page)]);
    return true;
  }
  private async planFreshnessCheck(lease: Lease,id: string,task: Task) {
    if (task.request.kind === 'actions' || (task.request.freshnessAttempt ?? 1) >= 3) return;
    const snapshot = (await this.snapshot(id,0,0))!;
    const deadline = task.request.deadline ?? snapshot.deadline;
    const retryAt = this.clock() + (task.request.kind === 'auctions' ? 5 : 1)*60000;
    if (retryAt >= deadline) return;
    const kind = task.request.kind === 'bars' ? 'daily' : 'opening';
    const rows = (await this.sql(`SELECT p.security_id,o.value FROM market_sightings p JOIN market_observations o ON o.id=p.input_id
      WHERE p.snapshot_id=? AND p.kind=? AND p.session=? AND p.basis=? AND p.security_id IN (SELECT json_extract(value,'$.securityId') FROM json_each(?))`,id,kind,task.request.end,task.request.basis,JSON.stringify(task.request.securities))
      .all<{ security_id: string; value: string }>()).results;
    const day = snapshot.calendar.find(s => s.date === task.request.end);
    const open = day ? instant(day.date,day.open,'America/New_York') : null;
    const missing = task.request.securities.filter(identity => {
      if (kind === 'opening' && !venues[identity.primaryVenue]) return false;
      return !rows.some(row => {
        if (row.security_id !== identity.securityId) return false;
        if (kind === 'daily') return true;
        const o = JSON.parse(row.value) as SavedObservation;
        return open !== null && officialOpening(o,venues[identity.primaryVenue]!,open);
      });
    });
    if (!missing.length) return;
    const nextId = `${task.id}:fresh`;
    if (await this.sql('SELECT id FROM market_tasks WHERE snapshot_id=? AND id=?',id,nextId).first()) return;
    await this.plan(lease,id,[{ ...task.request, id: nextId, start: task.request.end, securities: missing, notBefore: retryAt,
      freshnessAttempt: (task.request.freshnessAttempt ?? 1)+1, deadline }]);
  }
  async taskAttempt(lease: Lease, id: string, task: Task) {
    await this.foundation.fenced(lease, this.clock(), [
      this.sql('UPDATE market_tasks SET attempts=attempts+1 WHERE snapshot_id=? AND id=?', id, task.id),
      this.sql("INSERT INTO market_attempt_events(snapshot_id,task,page,attempt,at,code) VALUES(?,?,?,?,?,'dispatch')", id, task.id, task.page, task.attempts + 1, this.clock()),
    ]);
  }
  async taskPartition(lease: Lease,id: string,task: Task) {
    await this.foundation.fenced(lease,this.clock(),[this.sql("UPDATE market_tasks SET state='partitioned',reason='invalid_request_partitioned' WHERE snapshot_id=? AND id=?",id,task.id)]);
  }
  async taskDefer(lease: Lease, id: string, task: Task, retryAt: number, reason: string) {
    await this.foundation.fenced(lease,this.clock(),[this.sql('UPDATE market_tasks SET attempts=MAX(attempts-1,0),next_at=?,reason=? WHERE snapshot_id=? AND id=?',retryAt,reason,id,task.id)]);
  }
  async taskFailure(lease: Lease, id: string, task: Task, code: string, retryAt: number, permanent: boolean) {
    await this.foundation.fenced(lease, this.clock(), [
      this.sql('UPDATE market_tasks SET state=?,next_at=?,reason=? WHERE snapshot_id=? AND id=?', permanent || task.attempts + 1 >= 3 ? 'failed' : 'pending', retryAt, code, id, task.id),
      this.sql('INSERT INTO market_attempt_events(snapshot_id,task,page,attempt,at,code,retry_at) VALUES(?,?,?,?,?,?,?)', id, task.id, task.page, task.attempts + 1, this.clock(), code, retryAt),
    ]);
  }
  async reuseHistory(lease: Lease, id: string, identities: Identity[]) {
    if (identities.length > 100) throw new Error('reuse page too large');
    const snapshot = await this.snapshot(id,0,0);
    if (!snapshot || snapshot.cutoff !== null) throw new Error('snapshot frozen');
    const start = snapshot.calendar.filter(s => s.date <= snapshot.expectedSession).slice(-90)[0]?.date;
    if (!start) throw new Error('calendar history missing');
    await this.foundation.fenced(lease,this.clock(),[this.sql(`INSERT INTO market_sightings(snapshot_id,task,page,input_id,security_id,kind,session,basis,action_version,acquired_at,reused_at)
      SELECT ?,'reuse',0,p.input_id,p.security_id,p.kind,p.session,p.basis,p.action_version,p.acquired_at,?
      FROM market_sightings p JOIN json_each(?) j ON p.security_id=json_extract(j.value,'$.securityId')
      WHERE p.kind='daily' AND p.session>=? AND p.session<=? AND p.acquired_at<=?
      AND (p.basis='raw' OR p.action_version=json_extract(j.value,'$.actionVersion'))
      AND p.acquired_at=(SELECT MAX(q.acquired_at) FROM market_sightings q
        WHERE q.security_id=p.security_id AND q.kind=p.kind AND q.session=p.session AND q.basis=p.basis
        AND (q.basis='raw' OR q.action_version=p.action_version) AND q.acquired_at<=?)
      ON CONFLICT DO NOTHING`,id,this.clock(),JSON.stringify(identities),start,snapshot.expectedSession,this.clock(),this.clock())]);
  }
  async ingest(lease: Lease, id: string, raw: { task: string; page: number; observations: unknown[]; nextToken: string | null }) {
    const snapshot = await this.snapshot(id,0,0);
    if (!snapshot) throw new Error('snapshot missing');
    if (snapshot.cutoff !== null && raw.observations.some(o => (o as { kind?: string }).kind === 'daily')) {
      const task = await this.sql("SELECT id FROM market_tasks WHERE snapshot_id=? AND id=? AND id LIKE 'outcome:%'",id,raw.task).first();
      if (!task) throw new Error('snapshot frozen');
    }
    const page = z.object({ task: z.string().min(1).max(150), page: z.number().int().nonnegative(),
      observations: z.array(observationSchema).max(500), nextToken: z.string().max(3000).nullable() }).parse(raw);
    const encoded = JSON.stringify(page);
    if (new TextEncoder().encode(encoded).length > 256 * 1024) throw new Error('capture page too large');
    const fingerprint = await hash(encoded);
    const previous = await this.sql('SELECT fingerprint FROM market_pages WHERE snapshot_id=? AND task=? AND page=?', id, page.task, page.page).first<{ fingerprint: string }>();
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('page conflict'); return; }
    const acquiredAt = this.clock();
    const identityRows = (await this.sql(`SELECT value FROM market_decisions WHERE snapshot_id=? AND security_id IN
      (SELECT json_extract(value,'$.securityId') FROM json_each(?))`,id,JSON.stringify(page.observations.map(o => ({ securityId: o.securityId })))).all<{ value: string }>()).results;
    const identities = new Map(identityRows.map(r => { const d = JSON.parse(r.value) as Decision; return [`${d.identity!.securityId}:${d.identity!.asof}`,d.identity!] as const; }));
    const extra = (await this.sql('SELECT value FROM market_collection_identities WHERE snapshot_id=?',id).all<{ value: string }>()).results;
    for (const r of extra) { const identity = JSON.parse(r.value) as Identity; identities.set(`${identity.securityId}:${identity.asof}`,identity); }
    const rows = await Promise.all(page.observations.map(async observation => {
      const identity = identities.get(`${observation.securityId}:${observation.asof}`);
      if (!identity || identity.symbol !== observation.symbol || identity.asof !== observation.asof
        || snapshot.mappingVersion !== observation.mappingVersion || identity.actionVersion !== observation.actionVersion
        || observation.kind !== 'action' && observation.eventAt > acquiredAt) throw new Error('observation provenance mismatch');
      const logicalKey = JSON.stringify([observation.securityId, observation.kind, observation.session, observation.basis,
        observation.kind === 'daily' ? null : observation.value['id'] ?? observation.eventAt]);
      return { id: await hash(JSON.stringify([observation.securityId, observation.kind, observation.session, observation.basis, observation.eventAt, observation.value])), logicalKey, securityId: observation.securityId, kind: observation.kind,
        session: observation.session, basis: observation.basis, actionVersion: observation.actionVersion, value: JSON.stringify(observation) };
    }));
    await this.foundation.fenced(lease, acquiredAt, [
      this.sql(`INSERT INTO market_observations(id,logical_key,security_id,kind,session,basis,acquired_at,revision_of,value)
        SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.logicalKey'),json_extract(j.value,'$.securityId'),
        json_extract(j.value,'$.kind'),json_extract(j.value,'$.session'),json_extract(j.value,'$.basis'),?,
        (SELECT id FROM market_observations WHERE logical_key=json_extract(j.value,'$.logicalKey') ORDER BY acquired_at DESC,id DESC LIMIT 1),
        json_extract(j.value,'$.value') FROM json_each(?) j WHERE true ON CONFLICT(id) DO NOTHING`, acquiredAt, JSON.stringify(rows)),
      this.sql(`INSERT INTO market_sightings(snapshot_id,task,page,input_id,security_id,kind,session,basis,action_version,acquired_at,occurrences)
        SELECT ?,?,?,json_extract(value,'$.id'),json_extract(value,'$.securityId'),json_extract(value,'$.kind'),json_extract(value,'$.session'),json_extract(value,'$.basis'),json_extract(value,'$.actionVersion'),?,COUNT(*)
        FROM json_each(?) GROUP BY json_extract(value,'$.id') ON CONFLICT DO NOTHING`,id,page.task,page.page,acquiredAt,JSON.stringify(rows)),
      this.sql('INSERT INTO market_pages(snapshot_id,task,page,fingerprint,acquired_at,value) VALUES(?,?,?,?,?,?)', id, page.task, page.page, fingerprint, acquiredAt,
        JSON.stringify({ inputIds: rows.map(r => r.id), provenance: page.observations.map((o,i) => ({ inputId: rows[i]!.id, symbol: o.symbol, asof: o.asof, feed: o.feed, basis: o.basis, mappingVersion: o.mappingVersion, actionVersion: o.actionVersion })), nextToken: page.nextToken })),
    ]);
  }
  async observations(securityId: string, afterId = '', limit = 500): Promise<SavedObservation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid observation page');
    const rows = (await this.sql('SELECT id,acquired_at,revision_of,value FROM market_observations WHERE security_id=? AND id>? ORDER BY id LIMIT ?', securityId, afterId, limit)
      .all<{ id: string; acquired_at: number; revision_of: string | null; value: string }>()).results;
    return rows.map(r => ({ ...JSON.parse(r.value), id: r.id, acquiredAt: r.acquired_at, revisionOf: r.revision_of } as SavedObservation));
  }
  async reference(snapshotId: string, securityId: string, session: string, cutoff = this.clock()) {
    const snapshot = await this.snapshot(snapshotId,0,0);
    const identity = (await this.decision(snapshotId, securityId))?.identity;
    const day = snapshot?.calendar.find(s => s.date === session);
    const venue = identity && venues[identity.primaryVenue];
    const empty = (status: string) => ({ status, price: null as string | null, eventAt: null as number | null, eventTimestamp: null as string | null, inputIds: [] as string[], qualifyingReceipts: 0, cutoff });
    if (!day || !identity || !venue) return empty('unknown_primary_venue');
    const open = instant(session, day.open, 'America/New_York');
    const rows = (await this.sql(`SELECT o.id,o.value,p.acquired_at,p.occurrences FROM market_sightings p
      JOIN market_observations o ON o.id=p.input_id WHERE p.snapshot_id=? AND p.security_id=? AND p.kind='opening' AND p.session=? AND p.acquired_at<=?`,
    snapshotId, securityId, session, cutoff).all<{ id: string; value: string; acquired_at: number; occurrences: number }>()).results;
    const qualifying = rows.map(r => ({ id: r.id, occurrences: r.occurrences, o: JSON.parse(r.value) as SavedObservation })).filter(({ o }) => officialOpening(o,venue,open));
    if (!qualifying.length) return empty('missing_reference');
    const price = qualifying[0]!.o.value['p'] as string;
    const conflict = qualifying.some(r => compare(r.o.value['p'] as string,price) !== 0);
    const sorted = qualifying.sort((a,b) => openingTime(a.o)!<openingTime(b.o)! ? -1 : openingTime(a.o)!>openingTime(b.o)! ? 1 : 0);
    return { ...empty(conflict ? 'conflict' : 'available'),
      price: conflict ? null : sorted[0]!.o.value['p'] as string,
      eventAt: conflict ? null : sorted[0]!.o.eventAt, eventTimestamp: conflict ? null : sorted[0]!.o.value['t'] as string,
      inputIds: [...new Set(sorted.map(r => r.id))], qualifyingReceipts: qualifying.reduce((n,r) => n+r.occurrences,0) };
  }
  async freezeReference(lease: Lease, id: string, securityId: string, session: string, kind: 'initial' | 'revision' = 'initial') {
    const snapshot = await this.snapshot(id,0,0);
    if (!snapshot) throw new Error('snapshot missing');
    const next = snapshot.calendar.find(s => s.date > session);
    if (!next) throw new Error('calendar deadline missing');
    const deadline = instant(next.date,'08:00','Europe/Zagreb');
    if (kind === 'initial' && this.clock() < deadline) return null;
    const cutoff = kind === 'initial' ? deadline : this.clock();
    const existing = await this.sql("SELECT id,value FROM market_reference_versions WHERE snapshot_id=? AND security_id=? AND session=? AND kind='initial'",id,securityId,session).first<{ id: string; value: string }>();
    if (kind === 'initial' && existing) return JSON.parse(existing.value) as Awaited<ReturnType<MarketCapture['reference']>>;
    const result = await this.reference(id,securityId,session,cutoff);
    const versionId = await hash(JSON.stringify([id,securityId,session,kind,cutoff,result]));
    await this.foundation.fenced(lease,this.clock(),[this.sql(`INSERT INTO market_reference_versions(id,snapshot_id,security_id,session,kind,cutoff,acquired_at,revision_of,value)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,versionId,id,securityId,session,kind,cutoff,this.clock(),existing?.id ?? null,JSON.stringify(result))]);
    return result;
  }
  async finalize(lease: Lease, id: string) {
    const snapshot = await this.snapshot(id,0,0);
    if (!snapshot) throw new Error('snapshot missing');
    if (snapshot.cutoff !== null) return true;
    const cutoff = this.clock();
    const tasks = await this.tasks(id);
    if (tasks.some(t => t.id.startsWith('history:') && t.state === 'pending' && cutoff < snapshot.deadline)) return false;
    const expected = snapshot.calendar.filter(s => s.date <= snapshot.expectedSession).slice(-61).map(s => s.date);
    const pending = (await this.sql("SELECT value FROM market_decisions WHERE snapshot_id=? AND reason='awaiting_history' ORDER BY ticker LIMIT 50", id).all<{ value: string }>()).results.map(r => JSON.parse(r.value) as Decision);
    const rows = (await this.sql(`SELECT o.id,o.security_id,o.revision_of,o.value,MAX(p.acquired_at) AS seen_at
      FROM market_sightings p JOIN market_observations o ON o.id=p.input_id
      WHERE p.snapshot_id=? AND p.security_id IN (SELECT json_extract(value,'$.identity.securityId') FROM json_each(?))
      AND p.kind='daily' AND p.session>=? AND p.session<=? AND p.acquired_at<=?
      GROUP BY o.id ORDER BY seen_at,o.id`,id,JSON.stringify(pending),expected[0] ?? snapshot.expectedSession,snapshot.expectedSession,cutoff)
      .all<{ id: string; security_id: string; revision_of: string | null; value: string; seen_at: number }>()).results;
    const actions = (await this.sql(`SELECT DISTINCT o.security_id,o.value FROM market_sightings p JOIN market_observations o ON o.id=p.input_id
      WHERE p.snapshot_id=? AND p.kind='action' AND p.session<=?`,id,snapshot.expectedSession).all<{ security_id: string; value: string }>()).results;
    const bySecurity = new Map<string,SavedObservation[]>();
    for (const row of rows) { const group = bySecurity.get(row.security_id) ?? []; group.push({ ...JSON.parse(row.value), id: row.id, acquiredAt: row.seen_at, revisionOf: row.revision_of } as SavedObservation); bySecurity.set(row.security_id,group); }
    for (const decision of pending) {
      if (!decision.identity) continue;
      if (expected.length !== 61) { decision.reason = 'calendar_history_missing'; continue; }
      const identity = decision.identity;
      if (tasks.some(t => t.id.startsWith('history:') && t.state === 'failed' && t.request.securities.some(s => s.securityId === identity.securityId))) { decision.reason = 'required_data_unavailable'; continue; }
      if (identity.comparability !== 'verified') { decision.reason = 'unresolved_action_comparability'; continue; }
      const unresolved = actions.some(a => {
        if (a.security_id !== identity.securityId) return false;
        const value = (JSON.parse(a.value) as SavedObservation).value;
        return !['cash_dividends','cash_dividend'].includes(String(value['actionType'])) && !identity.verifiedActionIds.includes(String(value['id']));
      });
      if (unresolved) { decision.reason = 'unresolved_action'; continue; }
      const observations = bySecurity.get(identity.securityId) ?? [];
      const selected: SavedObservation[] = [];
      let reason = 'eligible';
      for (const basis of ['raw','split']) for (const session of expected) {
        const matches = observations.filter(o => o.basis === basis && o.session === session);
        const latest = matches.at(-1);
        if (!latest) { reason = session === snapshot.expectedSession ? 'expected_session_missing' : 'history_missing'; break; }
        if (matches.filter(m => m.acquiredAt === latest.acquiredAt).length > 1) { reason = 'conflicting_bars'; break; }
        if (!validBar(latest.value)) { reason = 'invalid_bar'; break; }
        selected.push(latest);
      }
      if (reason === 'eligible') reason = liquid(selected.filter(o => o.basis === 'raw'));
      decision.reason = reason;
      decision.inputIds = selected.map(o => o.id);

    }
    if (pending.length) await this.foundation.fenced(lease,this.clock(),[this.sql(`INSERT INTO market_decisions(snapshot_id,ticker,security_id,reason,value)
      SELECT ?,json_extract(value,'$.ticker'),json_extract(value,'$.identity.securityId'),json_extract(value,'$.reason'),value
      FROM json_each(?) WHERE true ON CONFLICT(snapshot_id,ticker) DO UPDATE SET reason=excluded.reason,value=excluded.value`,id,JSON.stringify(pending))]);
    const counts = (await this.sql('SELECT reason,COUNT(*) AS total FROM market_decisions WHERE snapshot_id=? GROUP BY reason', id).all<{ reason: string; total: number }>()).results;
    if (counts.some(c => c.reason === 'awaiting_history')) return false;
    snapshot.cutoff = cutoff; snapshot.decisions = [];
    const gaps = counts.some(c => !['eligible','outside_scope','unsupported_type','below_price','below_liquidity'].includes(c.reason));
    snapshot.status = counts.some(c => c.reason === 'eligible') ? gaps ? 'partial' : 'complete' : gaps ? 'unavailable' : 'complete';
    await this.foundation.fenced(lease, cutoff, [this.sql('UPDATE market_snapshots SET manifest=?,frozen=1 WHERE id=?', JSON.stringify(snapshot), id)]);
    return true;
  }
  async decision(snapshotId: string, securityId: string): Promise<Decision | null> {
    const row = await this.sql('SELECT value FROM market_decisions WHERE snapshot_id=? AND security_id=? LIMIT 1', snapshotId, securityId).first<{ value: string }>();
    return row ? JSON.parse(row.value) as Decision : null;
  }
  async progress(id: string) {
    const snapshot = await this.sql('SELECT run_id FROM market_snapshots WHERE id=?',id).first<{ run_id: string }>();
    if (!snapshot) return null;
    return {
      phase: await this.sql('SELECT phase,cursor FROM market_run_state WHERE run_id=?',snapshot.run_id).first(),
      requests: (await this.sql('SELECT state,reason,COUNT(*) AS total,MIN(next_at) AS nextAt FROM market_tasks WHERE snapshot_id=? GROUP BY state,reason',id).all()).results,
      retrieval: await this.sql('SELECT MIN(acquired_at) AS firstAt,MAX(acquired_at) AS lastAt,COUNT(*) AS pages FROM market_pages WHERE snapshot_id=?',id).first(),
      sources: (await this.sql('SELECT name,acquired_at,reused_at,fingerprint FROM market_sources WHERE run_id=? ORDER BY name',snapshot.run_id).all()).results,
    };
  }
  async stats() {
    return (await this.sql(`SELECT (SELECT COUNT(*) FROM market_observations) AS observations,
      (SELECT COUNT(*) FROM market_sightings) AS sightings,(SELECT COUNT(*) FROM market_pages) AS pages`)
      .first<{ observations: number; sightings: number; pages: number } >())!;
  }
  async coverage(id: string) {
    return (await this.sql('SELECT reason,COUNT(*) AS total FROM market_decisions WHERE snapshot_id=? GROUP BY reason', id).all<{ reason: string; total: number }>()).results;
  }
  async snapshot(id: string, offset = 0, limit = 100): Promise<Snapshot | null> {
    const row = await this.sql('SELECT manifest FROM market_snapshots WHERE id=?', id).first<{ manifest: string }>();
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('invalid offset');
    if (!row) return null;
    const decisions = (await this.sql('SELECT value FROM market_decisions WHERE snapshot_id=? ORDER BY ticker LIMIT ? OFFSET ?', id, limit, offset).all<{ value: string }>()).results.map(d => JSON.parse(d.value) as Decision);
    return { ...JSON.parse(row.manifest), decisions } as Snapshot;
  }
}
