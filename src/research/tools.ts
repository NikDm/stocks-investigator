import { z } from 'zod';
import { Foundation, hash, type Lease } from '../persistence';
import { evidenceSchema, type Evidence } from './assessment';
import { acquiredEvidence } from './evidence';
import { ResearchLedger } from './ledger';
import { boundedResponse, sanitizeText } from './http';

export const toolSchema = z.discriminatedUnion('kind',[
  z.object({ kind: z.literal('search'), topic: z.enum(['announcement','contradiction','explanation']) }).strict(),
  z.object({ kind: z.literal('read'), sourceId: z.string().min(1).max(100) }).strict(),
]);
export type ToolRequest = z.infer<typeof toolSchema>;
const sourceSchema = z.object({ securityId: z.string().min(1).max(200), url: z.string().max(2048),
  publishedAt: z.number().int().nonnegative().nullable(), scheduledEventAt: z.number().int().nonnegative().nullable().optional(), eventKey: z.string().min(1).max(200).optional(), revisionOf: z.string().nullable() }).strict();
export type SourceRegistration = z.infer<typeof sourceSchema>;
export type ToolResult = { kind: 'gap'; code: string } | { kind: 'evidence'; evidence: Evidence }
  | { kind: 'links'; links: { url: string; sourceId: string | null }[] };
export type ResearchToolConfig = { secUserAgent: string; braveKey?: string; issuerCiks?: Record<string,string> };

// Fixed official SEC archival endpoint only. Worker fetch cannot bind arbitrary issuer
// DNS answers, so arbitrary issuer/publisher hosts and all redirects fail closed.
export function officialSource(raw: string) {
  const url = new URL(raw);
  const match = /^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/([\w.-]+\.(?:txt|htm|html|xml|json))$/.exec(url.pathname);
  if (url.protocol!=='https:' || url.hostname!=='www.sec.gov' || url.port || url.username || url.password
    || url.search || url.hash || !match || match[3]!.includes('..')) throw new Error('unsupported source');
  return { url: url.href, cik: match[1]!.replace(/^0+/,''), originId: `issuer:${match[1]!.replace(/^0+/,'')}`, eventId: `sec:${match[2]}` };
}
export class ResearchTools {
  readonly ledger: ResearchLedger;
  constructor(readonly foundation: Foundation, readonly lease: Lease, readonly config: ResearchToolConfig,
    readonly clock: () => number = Date.now, readonly fetcher: typeof fetch = fetch) {
    this.ledger = new ResearchLedger(foundation,lease,clock);
  }
  setIssuerCiks(ciks: Record<string,string>) {
    this.config.issuerCiks = z.record(z.string().min(1).max(200),z.string().regex(/^\d{1,10}$/)).parse(ciks);
  }
  async register(raw: SourceRegistration) {
    const source = sourceSchema.parse(raw);
    let official: ReturnType<typeof officialSource>;
    try { official = officialSource(source.url); } catch { throw new Error('unsupported source'); }
    const value = { ...source, url: official.url, originId: official.originId, eventId: source.eventKey ?? official.originId, primary: true as const };
    const encoded = JSON.stringify(value), id = await hash(encoded), db = this.foundation.db;
    await this.foundation.fenced(this.lease,this.clock(),[db.prepare('INSERT INTO research_sources(id,security_id,url,value) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(id,source.securityId,official.url,encoded)]);
    return id;
  }
  async sources(securityId: string) {
    return (await this.foundation.db.prepare('SELECT id,url FROM research_sources WHERE security_id=? ORDER BY id LIMIT 50').bind(securityId)
      .all<{ id: string; url: string }>()).results;
  }
  async evidence(securityId: string, cutoff: number): Promise<Evidence[]> {
    return acquiredEvidence(this.foundation.db,securityId,cutoff);
  }
  async dispatch(securityId: string, passId: string, raw: unknown, deadline: number, symbol?: string): Promise<ToolResult> {
    const parsed = toolSchema.safeParse(raw);
    if (!parsed.success) return { kind: 'gap', code: 'unsafe_tool_request' };
    try {
      if (this.clock()>=deadline) return { kind: 'gap', code: 'research_deadline' };
      if (parsed.data.kind==='search') {
        if (!symbol || !/^[A-Z0-9.-]{1,20}$/.test(symbol)) return { kind: 'gap', code: 'query_identity_unavailable' };
        const result = await this.search(`${symbol} company ${parsed.data.topic}`,passId,deadline,false);
        if (result.kind==='links') for (const link of result.links) {
          try {
            const official = officialSource(link.url), cik = this.config.issuerCiks?.[securityId]?.replace(/^0+/,'');
            if (cik && official.cik===cik) link.sourceId = await this.register({ securityId, url: link.url, publishedAt: null, revisionOf: null });
          } catch { /* Unsupported hosts remain links and explicit replay/retrieval gaps. */ }
        }
        return result;
      }
      const db = this.foundation.db;
      const row = await db.prepare('SELECT value FROM research_sources WHERE id=? AND security_id=?').bind(parsed.data.sourceId,securityId).first<{ value: string }>();
      if (!row) return { kind: 'gap', code: 'source_not_registered' };
      const source = JSON.parse(row.value) as SourceRegistration & { originId: string; eventId: string; primary: boolean };
      officialSource(source.url);
      if (!this.config.secUserAgent || /[\r\n]/.test(this.config.secUserAgent)) return { kind: 'gap', code: 'source_identity_unconfigured' };
      await this.ledger.reserve('fetch',passId);
      await this.foundation.fenced(this.lease,this.clock(),[db.prepare(`INSERT INTO research_source_clock(id,last_at) VALUES(1,?)
        ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at`).bind(this.clock())]);
      const body = await boundedResponse(this.fetcher,source.url,{ headers: { 'User-Agent': this.config.secUserAgent, Accept: 'text/plain,text/html,application/json,application/xml,text/xml' } },deadline,this.clock);
      const acquiredAt = this.clock(), digest = await hash(body), id = await hash(`${securityId}:${source.url}:${digest}`);
      const existing = await db.prepare('SELECT value FROM research_evidence WHERE id=?').bind(id).first<{ value: string }>();
      if (existing) return { kind: 'evidence', evidence: evidenceSchema.parse(JSON.parse(existing.value)) };
      const previous = await db.prepare('SELECT id FROM research_evidence WHERE security_id=? AND url=? ORDER BY acquired_at DESC,id DESC LIMIT 1').bind(securityId,source.url).first<{ id: string }>();
      const evidence = evidenceSchema.parse({ id, securityId, url: source.url, originId: source.originId, eventId: source.eventId, primary: true,
        publishedAt: source.publishedAt, scheduledEventAt: source.scheduledEventAt ?? null, acquiredAt, hash: digest, revisionOf: previous?.id ?? source.revisionOf,
        text: sanitizeText(body), replayGap: 'sanitized_excerpt_only', retention: 'public_document' });
      const encoded = JSON.stringify(evidence);
      await this.ledger.reserve('retain',passId,new TextEncoder().encode(encoded).length);
      await this.foundation.fenced(this.lease,this.clock(),[db.prepare('INSERT INTO research_evidence(id,security_id,url,acquired_at,value) VALUES(?,?,?,?,?)')
        .bind(id,securityId,source.url,acquiredAt,encoded)]);
      return { kind: 'evidence', evidence };
    } catch { return { kind: 'gap', code: 'source_unavailable_or_budget' }; }
  }
  async changedFilings(securityId: string, cik: string, passId: string, deadline: number, earliest: number): Promise<ToolResult> {
    if (!/^\d{1,10}$/.test(cik) || !this.config.secUserAgent || /[\r\n]/.test(this.config.secUserAgent)) return { kind: 'gap', code: 'issuer_mapping_unavailable' };
    try {
      await this.ledger.reserve('fetch',passId);
      await this.foundation.fenced(this.lease,this.clock(),[this.foundation.db.prepare(`INSERT INTO research_source_clock(id,last_at) VALUES(1,?)
        ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at`).bind(this.clock())]);
      const body = await boundedResponse(this.fetcher,`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`,
        { headers: { 'User-Agent': this.config.secUserAgent, Accept: 'application/json' } },deadline,this.clock,256*1024,['application/json']);
      const recent = z.object({ filings: z.object({ recent: z.object({ accessionNumber: z.array(z.string()), primaryDocument: z.array(z.string()),
        acceptanceDateTime: z.array(z.string()), form: z.array(z.string()) }) }) }).parse(JSON.parse(body)).filings.recent;
      const links: { url: string; sourceId: string | null }[] = [];
      for (let i=0;i<recent.accessionNumber.length && links.length<3;i++) {
        const publishedAt = Date.parse(recent.acceptanceDateTime[i] ?? '');
        if (!Number.isFinite(publishedAt) || publishedAt<earliest || publishedAt>this.clock() || !['8-K','6-K','10-Q','10-K','8-K/A','6-K/A'].includes(recent.form[i] ?? '')) continue;
        const accession = recent.accessionNumber[i]!.replace(/-/g,'');
        const url = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/,'')}/${accession}/${recent.primaryDocument[i]}`;
        try { const sourceId = await this.register({ securityId, url, publishedAt, revisionOf: null }); links.push({ url, sourceId }); } catch {}
      }
      return { kind: 'links', links };
    } catch { return { kind: 'gap', code: 'filings_unavailable_or_budget' }; }
  }
  async broadSearch(index: 0 | 1 | 2, deadline: number): Promise<ToolResult> {
    const queries = ['US listed company new contract announcement','US listed company earnings guidance announcement','US listed company regulatory filing material event'];
    try { return await this.search(queries[index]!,`broad:${new Date(this.clock()).toISOString().slice(0,10)}`,deadline,true); }
    catch { return { kind: 'gap', code: 'search_unavailable_or_budget' }; }
  }
  private async search(query: string, passId: string, deadline: number, broad: boolean): Promise<ToolResult> {
    if (!this.config.braveKey || query.length>300) return { kind: 'gap', code: 'search_unconfigured' };
    await this.ledger.reserve(broad ? 'broad_search' : 'search',passId);
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q',query); url.searchParams.set('freshness','pw'); url.searchParams.set('count','10');
    const body = await boundedResponse(this.fetcher,url.href,{ headers: { 'X-Subscription-Token': this.config.braveKey, Accept: 'application/json' } },deadline,this.clock,256*1024,['application/json']);
    const data = z.object({ web: z.object({ results: z.array(z.object({ url: z.string() })).max(20) }).optional() }).parse(JSON.parse(body));
    const links: { url: string; sourceId: string | null }[] = [];
    // Discard snippets/titles immediately; storage rights have not been established.
    for (const result of data.web?.results ?? []) {
      let url: URL; try { url = new URL(result.url); } catch { continue; }
      if (url.protocol!=='https:' || url.username || url.password || url.port || url.search || url.hash || url.href.length>2048) continue;
      const registered = await this.foundation.db.prepare('SELECT id FROM research_sources WHERE url=? LIMIT 1').bind(url.href).first<{ id: string }>();
      if (!links.some(l => l.url===url.href)) links.push({ url: url.href, sourceId: registered?.id ?? null });
    }
    return { kind: 'links', links };
  }
}
