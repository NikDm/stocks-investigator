export class ProviderFailure extends Error {
  constructor(readonly code: string, readonly retryAt?: number, readonly permanent = false) { super(code); }
}

import { z } from 'zod';
import { Foundation, type Lease } from '../persistence';
import { localDate } from './calendar';
import { barSchema, decimal, type MarketRequest, type Observation, type ProviderPage } from './types';

type Endpoint = 'bars' | 'auctions' | 'actions' | 'calendar' | 'assets' | 'instruments' | 'exchanges' | 'figi';
const endpoints: Record<Endpoint, { url: string; provider: string; perMinute: number; spacing: number; bytes: number }> = {
  bars: { url: 'https://data.alpaca.markets/v2/stocks/bars', provider: 'alpaca', perMinute: 150, spacing: 0, bytes: 2 * 1024 * 1024 },
  auctions: { url: 'https://data.alpaca.markets/v2/stocks/auctions', provider: 'alpaca', perMinute: 150, spacing: 0, bytes: 2 * 1024 * 1024 },
  actions: { url: 'https://data.alpaca.markets/v1/corporate-actions', provider: 'alpaca', perMinute: 150, spacing: 0, bytes: 2 * 1024 * 1024 },
  calendar: { url: 'https://paper-api.alpaca.markets/v2/calendar', provider: 'alpaca', perMinute: 150, spacing: 0, bytes: 256 * 1024 },
  assets: { url: 'https://paper-api.alpaca.markets/v2/assets', provider: 'alpaca', perMinute: 150, spacing: 0, bytes: 16 * 1024 * 1024 },
  instruments: { url: 'https://live.trading212.com/api/v0/equity/metadata/instruments', provider: 'broker_instruments', perMinute: 1, spacing: 50000, bytes: 16 * 1024 * 1024 },
  exchanges: { url: 'https://live.trading212.com/api/v0/equity/metadata/exchanges', provider: 'broker_exchanges', perMinute: 2, spacing: 30000, bytes: 2 * 1024 * 1024 },
  figi: { url: 'https://api.openfigi.com/v3/mapping', provider: 'figi', perMinute: 25, spacing: 0, bytes: 256 * 1024 },
};
// Keep the JSON numeric lexemes before parsing: converting a provider decimal to
// Number and then String would silently change long price/volume quantities.
function losslessJson(text: string): unknown {
  const strings = text.replace(/("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match: string, quoted: string | undefined) => quoted ?? JSON.stringify(match));
  return JSON.parse(strings) as unknown;
}
export type MarketCredentials = { alpacaKey: string; alpacaSecret: string; brokerAuthorization?: string };
export class MarketHttp {
  constructor(readonly store: Foundation, readonly lease: Lease, readonly credentials: MarketCredentials,
    readonly clock: () => number = Date.now, readonly fetcher: typeof fetch = fetch, readonly initialSeed = false) {}
  async json(endpoint: Endpoint, query: Record<string,string>, signal: AbortSignal, body?: unknown): Promise<unknown> {
    const policy = endpoints[endpoint];
    if (!policy || endpoint === 'figi' && (!Array.isArray(body) || body.length > 10)) throw new ProviderFailure('endpoint_policy', undefined, true);
    const now = this.clock(), db = this.store.db;
    const limits = await db.prepare('SELECT MIN(at) AS first,MAX(at) AS last,COUNT(*) AS total FROM market_rate_slots WHERE provider=? AND at>?')
      .bind(policy.provider, now - 60000).first<{ first: number | null; last: number | null; total: number }>();
    if (limits && (limits.total >= policy.perMinute || limits.last !== null && limits.last + policy.spacing > now)) {
      throw new ProviderFailure('local_rate_limit', Math.max((limits.first ?? now) + 60001, (limits.last ?? now) + policy.spacing));
    }
    const resource = policy.provider === 'alpaca' ? 'market_requests' : policy.provider;
    const reservation = crypto.randomUUID();
    if (!await this.store.reserve(this.lease, reservation, resource, 1, 1, now)) throw new ProviderFailure('request_budget', now + 300000);
    if (policy.provider === 'alpaca' && (await this.store.usage(new Date(now).toISOString().slice(0,10),resource)).charged > (this.initialSeed ? 1000 : 600)) throw new ProviderFailure('request_budget',now+300000);
    await this.store.fenced(this.lease, now, [db.prepare(`INSERT INTO market_rate_slots(provider,at,reservation_id)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM market_rate_slots WHERE provider=? AND at>?)<?
      AND COALESCE((SELECT MAX(at) FROM market_rate_slots WHERE provider=?),0)<=?`)
      .bind(policy.provider, now, reservation, policy.provider, now - 60000, policy.perMinute, policy.provider, now - policy.spacing)]);
    if (!await db.prepare('SELECT reservation_id FROM market_rate_slots WHERE reservation_id=?').bind(reservation).first()) throw new ProviderFailure('local_rate_limit', now + 60001);
    const url = new URL(policy.url);
    for (const [key,value] of Object.entries(query)) url.searchParams.set(key,value);
    const headers: Record<string,string> = { accept: 'application/json' };
    if (policy.provider === 'alpaca') { headers['APCA-API-KEY-ID'] = this.credentials.alpacaKey; headers['APCA-API-SECRET-KEY'] = this.credentials.alpacaSecret; }
    if (policy.provider.startsWith('broker')) {
      if (!this.credentials.brokerAuthorization) throw new ProviderFailure('missing_broker_credentials', undefined, true);
      headers['authorization'] = this.credentials.brokerAuthorization;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetcher(url, { method: endpoint === 'figi' ? 'POST' : 'GET', headers, signal, redirect: 'error', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new ProviderFailure('network'); }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const retryAt = retry === null ? undefined : /^\d+$/.test(retry) ? this.clock() + Number(retry) * 1000 : Date.parse(retry);
      await response.body?.cancel();
      throw new ProviderFailure(response.status === 429 ? 'rate_limited' : response.status === 400 || response.status === 422 ? 'invalid_request' : response.status === 401 || response.status === 403 ? 'permission' : 'http_failure',
        retryAt !== undefined && Number.isFinite(retryAt) ? retryAt : undefined, response.status < 500 && response.status !== 429 && response.status !== 408);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new ProviderFailure('content_type', undefined, true); }
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderFailure('empty_response');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > policy.bytes || signal.aborted) { await reader.cancel(); throw new ProviderFailure('response_limit', undefined, true); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      return losslessJson(new TextDecoder('utf-8',{ fatal: true, ignoreBOM: false }).decode(bytes));
    } catch (error) { if (error instanceof ProviderFailure) throw error; throw new ProviderFailure('response_schema', undefined, true); }
    finally { reader.releaseLock(); }
  }
}
const auctionSchema = z.object({ t: z.string().datetime({ offset: true }), p: decimal, s: decimal.optional(), x: z.string(), c: z.string() });
export class AlpacaSource {
  constructor(readonly http: MarketHttp, readonly mappingVersion: string) {}
  async page(request: MarketRequest & { token: string | null }, signal: AbortSignal): Promise<ProviderPage> {
    const asof = request.securities[0]!.asof;
    if (request.securities.some(s => s.asof !== asof) || new Set(request.securities.map(s => s.symbol)).size !== request.securities.length) throw new ProviderFailure('ambiguous_query', undefined, true);
    const query: Record<string,string> = { symbols: request.securities.map(s => s.symbol).join(','), start: request.start, end: request.end, limit: request.kind === 'actions' ? '100' : '500' };
    if (request.kind === 'actions') { query['data_quality'] = 'all'; }
    else {
      query['feed'] = 'sip'; query['asof'] = asof;
      // Inclusive midnight end would omit the end session's auctions.
      query['end'] = `${request.end}T23:59:59Z`;
      if (request.kind === 'bars') { query['timeframe'] = '1Day'; query['adjustment'] = request.basis; query['sort'] = 'asc'; }
    }
    if (request.token !== null) query['page_token'] = request.token;
    const raw = z.object({ next_page_token: z.string().nullable().optional() }).passthrough().parse(await this.http.json(request.kind, query, signal));
    const observations: Observation[] = [];
    const add = (symbol: string, kind: Observation['kind'], session: string, eventAt: number, value: Observation['value']) => {
      const identity = request.securities.find(s => s.symbol === symbol);
      if (!identity || session < request.start || session > request.end || !Number.isFinite(eventAt)) throw new ProviderFailure('unresolved_response_identity', undefined, true);
      observations.push({ securityId: identity.securityId, kind, symbol, asof, source: 'alpaca', feed: 'sip', basis: kind === 'daily' ? request.basis : 'raw',
        eventAt, session, actionVersion: identity.actionVersion, mappingVersion: this.mappingVersion, value });
    };
    if (request.kind === 'bars') {
      const bars = z.record(z.string(), z.array(barSchema)).parse(raw['bars']);
      for (const [symbol, values] of Object.entries(bars)) for (const value of values) add(symbol, 'daily', localDate(Date.parse(value.t),'America/New_York'), Date.parse(value.t), value);
    } else if (request.kind === 'auctions') {
      const auctions = z.record(z.string(), z.object({ o: z.array(auctionSchema).optional(), c: z.array(auctionSchema).optional() })).parse(raw['auctions']);
      for (const [symbol, values] of Object.entries(auctions)) for (const value of values.o ?? []) add(symbol, 'opening', localDate(Date.parse(value.t),'America/New_York'), Date.parse(value.t), { t: value.t, p: value.p, x: value.x, c: value.c, ...(value.s === undefined ? {} : { s: value.s }) });
    } else {
      const groups = z.record(z.string(),z.array(z.record(z.string(),z.json()))).parse(raw['corporate_actions']);
      for (const [type, actions] of Object.entries(groups)) for (const action of actions) {
        const symbols = [action['symbol'],action['old_symbol'],action['new_symbol'],action['acquiree_symbol']].filter((s): s is string => typeof s === 'string');
        const matching = request.securities.filter(s => symbols.includes(s.symbol));
        if (!matching.length) throw new ProviderFailure('unresolved_action_identity', undefined, true);
        const date = [action['ex_date'],action['effective_date'],action['process_date']].find((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
        if (!date) throw new ProviderFailure('unresolved_action_date', undefined, true);
        // Actions are queried by process_date, while economic dates can lie outside that range.
        for (const identity of matching) observations.push({ securityId: identity.securityId, kind: 'action', symbol: identity.symbol, asof,
          source: 'alpaca', feed: 'not_applicable', basis: 'raw', eventAt: Date.parse(`${date}T00:00:00Z`), session: date,
          actionVersion: identity.actionVersion, mappingVersion: this.mappingVersion,
          value: { ...action, actionType: type, verification: 'unverified_provider_record' } });
      }
    }
    return { observations, nextToken: raw.next_page_token ?? null };
  }
}
