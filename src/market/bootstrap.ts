import { z } from 'zod';
import { hash, type Lease } from '../persistence';
import { MarketCapture } from './capture';
import { calendarSchema, type Session } from './calendar';
import { ProviderFailure, type MarketHttp } from './provider';
import { beginSchema, identitySchema, type Begin, type Identity } from './types';

type Options = { reportDate: string; calendarFrom: string; calendarThrough: string; mappingVersion: string };
type Mapping = { data?: { compositeFIGI?: string; shareClassFIGI?: string; ticker?: string; securityType?: string }[]; error?: string; warning?: string };
type Result = Pick<Begin,'instruments' | 'exchanges' | 'identities'> & { calendar: Session[]; mappingGaps: { ticker: string; reason: string }[]; sourceReceipts: string[] };
export class MarketBootstrap {
  constructor(readonly capture: MarketCapture, readonly http: Pick<MarketHttp,'json'>, readonly clock: () => number = Date.now) {}
  private sql(query: string, ...args: (string | number | null)[]) { return this.capture.foundation.db.prepare(query).bind(...args); }
  private async load(runId: string, name: string): Promise<unknown[] | null> {
    const rows = (await this.sql(`SELECT p.value FROM market_sources s LEFT JOIN market_source_pages p ON p.run_id=s.run_id AND p.name=s.name
      WHERE s.run_id=? AND s.name=? ORDER BY p.page`,runId,name).all<{ value: string | null }>()).results;
    return rows.length ? rows.flatMap(r => r.value === null ? [] : JSON.parse(r.value) as unknown[]) : null;
  }
  private async save(lease: Lease, name: string, raw: unknown) {
    const values = z.array(z.json()).parse(raw), fingerprint = await hash(JSON.stringify(values));
    const writes = [this.sql('INSERT INTO market_sources(run_id,name,acquired_at,fingerprint) VALUES(?,?,?,?)',lease.runId,name,this.clock(),fingerprint)];
    for (let offset = 0; offset < values.length; offset += 50) {
      const payload = JSON.stringify(values.slice(offset,offset + 50));
      if (new TextEncoder().encode(payload).length > 256 * 1024) throw new ProviderFailure('catalogue_page_limit',undefined,true);
      writes.push(this.sql('INSERT INTO market_source_pages(run_id,name,page,value) VALUES(?,?,?,?)',lease.runId,name,offset/50,payload));
    }
    await this.capture.foundation.fenced(lease,this.clock(),writes);
  }
  async step(lease: Lease, options: Options, maxCalls = 32) {
    if (!await this.load(lease.runId,'config')) await this.save(lease,'config',[options]);
    const start = this.clock(); let calls = 0;
    const acquire = async (name: string, endpoint: Parameters<MarketHttp['json']>[0], query: Record<string,string>, body?: unknown) => {
      const existing = await this.load(lease.runId,name); if (existing) return existing;
      if (calls >= maxCalls || this.clock() - start >= 195000) return null;
      const retry = await this.sql('SELECT attempts,next_at FROM market_bootstrap_retries WHERE run_id=? AND name=?',lease.runId,name).first<{ attempts: number; next_at: number }>();
      if (retry && (retry.attempts >= 3 || retry.next_at > this.clock())) return null;
      calls++;
      await this.capture.foundation.renew(lease,this.clock());
      await this.capture.foundation.fenced(lease,this.clock(),[this.sql(`INSERT INTO market_bootstrap_retries(run_id,name,attempts,next_at) VALUES(?,?,1,0)
        ON CONFLICT(run_id,name) DO UPDATE SET attempts=attempts+1`,lease.runId,name)]);
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),20000);
      try {
        const raw = await this.http.json(endpoint,query,controller.signal,body);
        if (controller.signal.aborted) throw new ProviderFailure('timeout');
        await this.save(lease,name,raw);
        if (endpoint === 'figi' && Array.isArray(body)) {
          const results = z.array(z.json()).parse(raw);
          if (results.length !== body.length) throw new ProviderFailure('mapping_cardinality',undefined,true);
          const cache = body.map((job: { idValue: string; includeUnlistedEquities: boolean },i) => ({ id: crypto.randomUUID(), isin: job.idValue, unlisted: job.includeUnlistedEquities ? 1 : 0, value: results[i] }));
          await this.capture.foundation.fenced(lease,this.clock(),[this.sql(`INSERT INTO market_figi_cache(id,isin,unlisted,acquired_at,value)
            SELECT json_extract(value,'$.id'),json_extract(value,'$.isin'),json_extract(value,'$.unlisted'),?,json_extract(value,'$.value') FROM json_each(?)`,this.clock(),JSON.stringify(cache))]);
        }
        return z.array(z.unknown()).parse(raw);
      } catch (error) {
        const failure = error instanceof ProviderFailure ? error : new ProviderFailure('catalogue_schema',undefined,true);
        await this.capture.foundation.fenced(lease,this.clock(),[this.sql('UPDATE market_bootstrap_retries SET attempts=?,next_at=?,reason=? WHERE run_id=? AND name=?',
          ['local_rate_limit','request_budget'].includes(failure.code) ? retry?.attempts ?? 0 : failure.permanent ? 3 : (retry?.attempts ?? 0) + 1,Math.max(this.clock()+5000,failure.retryAt ?? 0),failure.code,lease.runId,name)]);
        return null;
      } finally { clearTimeout(timeout); }
    };
    const instruments = await acquire('instruments','instruments',{});
    const exchanges = await acquire('exchanges','exchanges',{});
    const assets = await acquire('assets','assets',{ status: 'all', asset_class: 'us_equity' });
    const calendar = await acquire('calendar','calendar',{ start: options.calendarFrom, end: options.calendarThrough });
    if (!instruments || !exchanges || !assets || !calendar) return false;
    const parsed = { instruments: beginSchema.shape.instruments.parse(instruments), exchanges: beginSchema.shape.exchanges.parse(exchanges) };
    const candidates = this.candidates(parsed);
    await this.reuseMappings(lease,candidates);
    for (let offset = 0; offset < candidates.length; offset += 10) {
      const group = candidates.slice(offset,offset+10);
      const listed = await acquire(`figi-${offset}`,'figi',{},group.map(i => ({ idType: 'ID_ISIN', idValue: i.isin, exchCode: 'US', includeUnlistedEquities: false })));
      if (!listed) return false;
      if (listed.length !== group.length) throw new ProviderFailure('mapping_cardinality',undefined,true);
      const missing = group.filter((_,index) => !(listed[index] as Mapping).data?.length);
      if (missing.length && !await acquire(`unlisted-${offset}`,'figi',{},missing.map(i => ({ idType: 'ID_ISIN', idValue: i.isin, exchCode: 'US', includeUnlistedEquities: true })))) return false;
    }
    return true;
  }
  private async reuseMappings(lease: Lease, candidates: Begin['instruments']) {
    const rows = (await this.sql(`SELECT isin,unlisted,acquired_at,value FROM (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY isin,unlisted ORDER BY acquired_at DESC,id DESC) AS rank
      FROM market_figi_cache WHERE acquired_at>=?) WHERE rank=1`,this.clock()-7*86400000)
      .all<{ isin: string; unlisted: number; acquired_at: number; value: string }>()).results;
    const cache = new Map(rows.map(r => [`${r.isin}:${r.unlisted}`,r]));
    const sources = new Set((await this.sql('SELECT name FROM market_sources WHERE run_id=?',lease.runId).all<{ name: string }>()).results.map(r => r.name));
    const copies: { name: string; at: number; values: unknown[]; fingerprint: string }[] = [];
    for (let offset = 0; offset < candidates.length; offset += 10) {
      const group = candidates.slice(offset,offset+10), listed = group.map(i => cache.get(`${i.isin}:0`));
      if (listed.some(r => !r)) continue;
      if (!sources.has(`figi-${offset}`)) copies.push({ name: `figi-${offset}`, at: Math.min(...listed.map(r => r!.acquired_at)), values: listed.map(r => JSON.parse(r!.value)), fingerprint: await hash(JSON.stringify(listed.map(r => r!.value))) });
      const missing = group.filter((_,i) => !(JSON.parse(listed[i]!.value) as Mapping).data?.length);
      const unlisted = missing.map(i => cache.get(`${i.isin}:1`));
      if (missing.length && unlisted.every(r => r) && !sources.has(`unlisted-${offset}`)) copies.push({ name: `unlisted-${offset}`, at: Math.min(...unlisted.map(r => r!.acquired_at)), values: unlisted.map(r => JSON.parse(r!.value)), fingerprint: await hash(JSON.stringify(unlisted.map(r => r!.value))) });
    }
    for (let offset = 0; offset < copies.length; offset += 50) await this.capture.foundation.fenced(lease,this.clock(),[
      this.sql(`INSERT INTO market_sources(run_id,name,acquired_at,fingerprint,reused_at)
        SELECT ?,json_extract(value,'$.name'),json_extract(value,'$.at'),json_extract(value,'$.fingerprint'),? FROM json_each(?)`,lease.runId,this.clock(),JSON.stringify(copies.slice(offset,offset+50))),
      this.sql(`INSERT INTO market_source_pages(run_id,name,page,value)
        SELECT ?,json_extract(value,'$.name'),0,json_extract(value,'$.values') FROM json_each(?)`,lease.runId,JSON.stringify(copies.slice(offset,offset+50))),
    ]);
  }
  private candidates(input: Pick<Begin,'instruments' | 'exchanges'>) {
    const schedules = new Set(input.exchanges.filter(e => ['NYSE','NASDAQ'].includes(e.name)).flatMap(e => e.workingSchedules.map(s => s.id)));
    return input.instruments.filter(i => i.type === 'STOCK' && i.currencyCode === 'USD' && schedules.has(i.workingScheduleId));
  }
  async result(runId: string): Promise<Result | null> {
    const instruments = await this.load(runId,'instruments'), exchanges = await this.load(runId,'exchanges');
    const assets = await this.load(runId,'assets'), calendar = await this.load(runId,'calendar');
    if (!instruments || !exchanges || !assets || !calendar) return null;
    const result: Result = { instruments: beginSchema.shape.instruments.parse(instruments), exchanges: beginSchema.shape.exchanges.parse(exchanges),
      identities: [], calendar: calendarSchema.parse(calendar), mappingGaps: [], sourceReceipts: [] };
    const config = (await this.load(runId,'config'))?.[0] as Options | undefined;
    if (!config) return null;
    const candidates = this.candidates(result);
    const mappingRows = (await this.sql("SELECT name,value FROM market_source_pages WHERE run_id=? AND (name LIKE 'figi-%' OR name LIKE 'unlisted-%')",runId).all<{ name: string; value: string }>()).results;
    const savedMappings = new Map(mappingRows.map(r => [r.name,JSON.parse(r.value) as Mapping[]]));
    const reviews = (await this.sql('SELECT isin,value FROM market_identity_reviews WHERE acquired_at<=? AND valid_from<=? AND valid_through>=? ORDER BY acquired_at DESC',this.clock(),config.reportDate,config.reportDate).all<{ isin: string; value: string }>()).results;
    const reviewsByIsin = new Map<string, { value: string }[]>();
    for (const review of reviews) { const group = reviewsByIsin.get(review.isin) ?? []; group.push(review); reviewsByIsin.set(review.isin,group); }
    for (let offset = 0; offset < candidates.length; offset += 10) {
      const mappings = savedMappings.get(`figi-${offset}`); if (!mappings) return null;
      const group = candidates.slice(offset,offset+10);
      const unresolved = group.some((_,i) => !(mappings[i] as Mapping).data?.length);
      if (unresolved && !savedMappings.has(`unlisted-${offset}`)) return null;
      for (const [index,instrument] of group.entries()) {
        const matches = (mappings[index] as Mapping).data ?? [];
        let reason = matches.length > 1 ? 'ambiguous_figi' : matches.length === 0 ? 'unlisted_or_unidentified' : 'identity_review_required';
        if (matches.length === 1) {
          const match = matches[0]!;
          const applicable = reviewsByIsin.get(instrument.isin) ?? [];
          for (const review of applicable) {
            const parsed = identitySchema.safeParse(JSON.parse(review.value));
            if (!parsed.success || parsed.data.securityType !== match.securityType || parsed.data.brokerTicker !== instrument.ticker || parsed.data.compositeFIGI !== match.compositeFIGI || parsed.data.shareClassFIGI !== match.shareClassFIGI) continue;
            const identity = { ...parsed.data, asof: config.reportDate };
            const provider = assets.filter((a): a is Record<string,unknown> => typeof a === 'object' && a !== null && (a as Record<string,unknown>)['symbol'] === identity.symbol);
            if (provider.length > 1 || provider.some(p => p['status'] !== 'active' || p['exchange'] !== identity.primaryVenue || p['class'] !== 'us_equity')) { reason = 'contradictory_provider_metadata'; break; }
            result.identities.push(identity); reason = ''; break;
          }
        }
        if (reason) result.mappingGaps.push({ ticker: instrument.ticker, reason });
      }
    }
    result.sourceReceipts = (await this.sql('SELECT name,fingerprint FROM market_sources WHERE run_id=? ORDER BY name',runId).all<{ name: string; fingerprint: string }>()).results.map(r => `${runId}:${r.name}:${r.fingerprint}`);
    return result;
  }
}
