import { Screener } from '../screening/persistence';
import { z } from 'zod';
import { Foundation, type Lease, type Run } from '../persistence';
import { MarketCapture } from './capture';
import { MarketBootstrap } from './bootstrap';
import { instant, localDate } from './calendar';
import { AlpacaSource, MarketHttp, type MarketCredentials } from './provider';
import { MarketWorker } from './worker';
import { freezeDueReferences, planEvaluation } from './evaluation';
import type { Identity } from './types';

export const marketCommand = z.object({ kind: z.literal('market'), reportDate: z.iso.date(), seed: z.boolean().default(false) }).strict();
export type MarketEnv = { MARKET_ENABLED?: string; ALPACA_KEY?: string; ALPACA_SECRET?: string; TRADING212_AUTHORIZATION?: string };
function credentials(env: MarketEnv): MarketCredentials {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET || !env.TRADING212_AUTHORIZATION) throw new Error('market_credentials_missing');
  return { alpacaKey: env.ALPACA_KEY, alpacaSecret: env.ALPACA_SECRET, brokerAuthorization: env.TRADING212_AUTHORIZATION };
}
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10);
async function finish(store: Foundation, lease: Lease, summary: Record<string,string | number>, clock: () => number) {
  if (!await store.report(lease.runId)) {
    await store.stage(lease,0,[{ id: 'market-capture', kind: 'universe', acquiredAt: clock(), value: summary }],clock());
    await store.publish(lease,{ id: lease.runId, cutoff: clock(), expectedPages: 1 },clock());
  }
  await store.certify(lease,lease.runId,clock); await store.complete(lease,clock());
}
async function planHistory(capture: MarketCapture, lease: Lease, id: string, offset: number, seed: boolean) {
  const snapshot = (await capture.snapshot(id,offset))!;
  const identities = snapshot.decisions.filter(d => d.reason === 'awaiting_history' && d.identity).map(d => d.identity!);
  await capture.reuseHistory(lease,id,identities);
  const dates = snapshot.calendar.filter(s => s.date <= snapshot.expectedSession).slice(-61).map(s => s.date);
  const first = snapshot.calendar.filter(s => s.date <= snapshot.expectedSession).slice(-90)[0]?.date;
  if (!first || dates.length !== 61) return snapshot.decisions.length;
  const known = (await capture.foundation.db.prepare(`SELECT security_id,basis,GROUP_CONCAT(DISTINCT session) AS sessions FROM market_sightings
    WHERE snapshot_id=? AND security_id IN (SELECT json_extract(value,'$.securityId') FROM json_each(?)) AND kind='daily' GROUP BY security_id,basis`)
    .bind(id,JSON.stringify(identities)).all<{ security_id: string; basis: string; sessions: string }>()).results;
  if (identities.length) await capture.plan(lease,id,[{ id: `history:actions:${offset}`, kind: 'actions', basis: 'raw', start: first, end: snapshot.reportDate, securities: identities, ...(seed ? {} : { deadline: snapshot.deadline }) }]);
  const groups = new Map<string, Identity[]>();
  for (const identity of identities) for (const basis of ['raw','split']) {
    const sessions = new Set(known.find(r => r.security_id === identity.securityId && r.basis === basis)?.sessions.split(',') ?? []);
    const missing = dates.filter(d => !sessions.has(d)); if (!missing.length) continue;
    const start = sessions.size === 0 ? first : missing[0]!;
    const key = `${basis}:${start}`;
    const group = groups.get(key) ?? []; group.push(identity); groups.set(key,group);
  }
  for (const [key,securities] of groups) {
    const [basis,start] = key.split(':');
    await capture.plan(lease,id,[{ id: `history:${offset}:${key}`, kind: 'bars', basis: basis === 'split' ? 'split' : 'raw', start: start!, end: snapshot.expectedSession,
      securities, ...(seed ? {} : { deadline: snapshot.deadline }) }]);
  }
  return snapshot.decisions.length;
}
export async function drainMarket(store: Foundation, env: MarketEnv, candidate: Run, clock: () => number = Date.now, fetcher: typeof fetch = fetch) {
  const lease = await store.claim(candidate.id,crypto.randomUUID(),clock()); if (!lease) return;
  const started = clock(), db = store.db;
  const capture = new MarketCapture(store,clock);
  try {
    const command = marketCommand.parse(JSON.parse(candidate.payload));
    const http = new MarketHttp(store,lease,credentials(env),clock,fetcher,command.seed);
    const bootstrap = new MarketBootstrap(capture,http,clock);
    await store.fenced(lease,clock(),[db.prepare('INSERT INTO market_run_state(run_id) VALUES(?) ON CONFLICT DO NOTHING').bind(lease.runId)]);
    let queriesRemaining = 850;
    for (let stage = 0; stage < 32 && clock() - started < 195000; stage++) {
      await store.renew(lease,clock());
      const state = (await db.prepare('SELECT phase,cursor FROM market_run_state WHERE run_id=?').bind(lease.runId).first<{ phase: string; cursor: number }>())!;
      let phase = state.phase, cursor = state.cursor;
      const queryReserve = ({ bootstrap: 800, resolve: 500, plan: 32, acquire: 200, qualify: 20, screening: 65, evaluation: 800, finish: 50 } as Record<string,number>)[phase] ?? 50;
      if (queriesRemaining < queryReserve) break;
      queriesRemaining -= queryReserve;
      if (phase === 'bootstrap') {
        const done = await bootstrap.step(lease,{ reportDate: command.reportDate, calendarFrom: shiftDate(command.reportDate,-150), calendarThrough: shiftDate(command.reportDate,75), mappingVersion: `mapping:${lease.runId}` },8);
        if (!done) {
          const failed = await db.prepare('SELECT name FROM market_bootstrap_retries WHERE run_id=? AND attempts>=3 LIMIT 1').bind(lease.runId).first();
          if (failed) await finish(store,lease,{ status: 'unavailable', reason: 'catalogue_or_mapping_failed' },clock);
          break;
        }
        phase = 'resolve';
      } else if (phase === 'resolve') {
        const result = await bootstrap.result(lease.runId); if (!result) throw new Error('incomplete_bootstrap');
        if (!result.calendar.some(s => s.date === command.reportDate)) { await finish(store,lease,{ status: 'no_report', reason: 'exchange_closed' },clock); break; }
        await capture.begin(lease,{ id: lease.runId, reportDate: command.reportDate, ...result,
          calendarFrom: shiftDate(command.reportDate,-150), calendarThrough: shiftDate(command.reportDate,75), mappingVersion: `mapping:${lease.runId}`, splitVolumeVerified: true });
        phase = 'plan'; cursor = 0;
      } else if (phase === 'plan') {
        const count = await planHistory(capture,lease,lease.runId,cursor,command.seed); cursor += count;
        if (count < 100) { phase = 'acquire'; cursor = 0; }
      } else if (phase === 'acquire') {
        const result = await new MarketWorker(capture,new AlpacaSource(http,`mapping:${lease.runId}`),clock).tick(lease,lease.runId,4);
        const pending = await db.prepare("SELECT COUNT(*) AS total FROM market_tasks WHERE snapshot_id=? AND state='pending'").bind(lease.runId).first<{ total: number }>();
        if (pending!.total === 0) phase = 'qualify';
        else if (!result.committed) break;
      } else if (phase === 'qualify') {
        if (await capture.finalize(lease,lease.runId)) phase = 'screening';
      } else if (phase === 'screening') {
        if (await new Screener(capture,clock).step(lease,lease.runId)) phase = 'evaluation';
      } else if (phase === 'evaluation') {
        const snapshot = (await capture.snapshot(lease.runId))!;
        await planEvaluation(capture,lease,lease.runId,snapshot.expectedSession); phase = 'finish';
      } else {
        const snapshot = (await capture.snapshot(lease.runId))!;
        await finish(store,lease,{ status: snapshot.status, snapshotId: lease.runId, reportDate: command.reportDate, expectedSession: snapshot.expectedSession, researchOnly: 'true' },clock); break;
      }
      await store.fenced(lease,clock(),[db.prepare('UPDATE market_run_state SET phase=?,cursor=? WHERE run_id=?').bind(phase,cursor,lease.runId)]);
    }
  } catch {
    await store.fail(lease,clock(),{ permanent: true });
  } finally { await store.release(lease,clock()); }
}

export async function drainCollections(store: Foundation, env: MarketEnv, candidate: Run, clock: () => number = Date.now) {
  const lease = await store.claim(candidate.id,crypto.randomUUID(),clock()); if (!lease) return;
  try {
    const capture = new MarketCapture(store,clock), started = clock();
    await store.fenced(lease,clock(),[store.db.prepare("INSERT INTO market_run_state(run_id,phase) VALUES(?,'plan') ON CONFLICT DO NOTHING").bind(lease.runId)]);
    const state = (await store.db.prepare('SELECT phase FROM market_run_state WHERE run_id=?').bind(lease.runId).first<{ phase: string }>())!;
    if (state.phase === 'plan') {
      const latest = await store.db.prepare('SELECT id FROM market_snapshots WHERE frozen=1 ORDER BY report_date DESC,id DESC LIMIT 1').first<{ id: string }>();
      if (latest) {
        const snapshot = (await capture.snapshot(latest.id,0,0))!;
        const completed = snapshot.calendar.filter(s => instant(s.date,s.close,'America/New_York') + 20*60000 <= clock()).at(-1);
        if (completed) await planEvaluation(capture,lease,latest.id,completed.date);
      }
      await store.fenced(lease,clock(),[store.db.prepare("UPDATE market_run_state SET phase='acquire' WHERE run_id=?").bind(lease.runId)]); return;
    }
    if (state.phase === 'acquire') {
      const snapshots = (await store.db.prepare(`SELECT DISTINCT s.id,s.manifest FROM market_snapshots s JOIN market_tasks t ON t.snapshot_id=s.id
        WHERE s.frozen=1 AND t.state='pending' AND t.next_at<=? LIMIT 3`).bind(clock()).all<{ id: string; manifest: string }>()).results;
      for (const snapshot of snapshots) {
        if (clock()-started > 150000) break;
        const version = (JSON.parse(snapshot.manifest) as { mappingVersion: string }).mappingVersion;
        await new MarketWorker(capture,new AlpacaSource(new MarketHttp(store,lease,credentials(env),clock),version),clock).tick(lease,snapshot.id,4);
      }
      await store.fenced(lease,clock(),[store.db.prepare("UPDATE market_run_state SET phase='references' WHERE run_id=?").bind(lease.runId)]); return;
    }
    const references = await freezeDueReferences(capture,lease,100);
    await finish(store,lease,{ status: 'collection_tick', references, researchOnly: 'true' },clock);
  } catch { await store.fail(lease,clock(),{ permanent: true }); }
  finally { await store.release(lease,clock()); }
}
export async function enqueueMarket(store: Foundation, clock: () => number = Date.now) {
  const now = clock(), date = localDate(now,'Europe/Zagreb');
  const start = instant(date,'06:30','Europe/Zagreb'), end = instant(date,'08:00','Europe/Zagreb');
  if (now >= start && now < end) await store.enqueue(`market:screen-eval-v1:${date}:morning`,{ kind: 'market', reportDate: date, seed: false },now);
  const pending = await store.db.prepare("SELECT id FROM runs WHERE state IN ('queued','running') AND json_extract(payload,'$.kind')='market-collections' LIMIT 1").first();
  if (!pending) await store.enqueue(`market-collections:${Math.floor(now/300000)}`,{ kind: 'market-collections' },now);
}
