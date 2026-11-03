import { refreshPolicy } from './policy';
import { Foundation, type Lease, type Run } from '../persistence';
import { ResearchRuntime } from '../research/runtime';
import { ResearchTools, type ToolRequest } from '../research/tools';
import { dispatchModel } from '../research/model-call';
import { researchSystem, researchResponseSchema, type ResearchModel } from '../research/researcher';
import { validateAssessment } from '../research/assessment';
import { Tracking } from '../tracking/store';
import { MarketHttp } from '../market/provider';
import type { MarketEnv } from '../market/runtime';
import { barSchema } from '../market/types';
import { z } from 'zod';
import { Refreshes, type RefreshEntry } from './store';
import { RefreshPublication, type Premarket, type RefreshDecision } from './publication';

export interface PremarketSource { latest(entry: RefreshEntry, session: string, cutoff: number, signal: AbortSignal): Promise<Premarket | null> }
export class DelayedPremarket implements PremarketSource {
  constructor(readonly http: MarketHttp, readonly clock: () => number = Date.now) {}
  async latest(entry: RefreshEntry, session: string, cutoff: number, signal: AbortSignal): Promise<Premarket | null> {
    if (!entry.symbol) return null;
    const end = Math.min(this.clock(),cutoff)-refreshPolicy.priceDelayMs;
    const start = entry.openAt-refreshPolicy.premarketBeforeOpenMs; // 04:00 ET, using this session's saved regular open.
    if (end<start) return null;
    const raw = z.object({ bars: z.record(z.string(),z.array(barSchema)), next_page_token: z.string().nullable().optional() }).passthrough()
      .parse(await this.http.json('bars',{ symbols: entry.symbol, feed: 'sip', asof: session, adjustment: 'raw', timeframe: '1Min',
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), sort: 'desc', limit: '1' },signal));
    if (Object.keys(raw.bars).some(s => s!==entry.symbol)) throw new Error('premarket identity mismatch');
    const bar = raw.bars[entry.symbol]?.[0];
    if (!bar) return null;
    return { price: bar.c, volume: bar.v, eventAt: Date.parse(bar.t), acquiredAt: this.clock(), delayMs: refreshPolicy.priceDelayMs, source: 'alpaca_sip', basis: 'raw' };
  }
}
type Work = { steps: number; phase: 'price' | 'search' | 'filings' | 'read' | 'assess'; pending: string | null; reads: string[]; requests: ToolRequest[];
  gaps: string[]; price: Premarket | null; repair: number; decision: RefreshDecision | null };
export class RefreshRuntime {
  constructor(readonly refreshes: Refreshes, readonly tools: ResearchTools, readonly model: ResearchModel | null, readonly prices: PremarketSource | null,
    readonly mappings: { securityId: string; issuerId: string; cik: string }[], readonly clock: () => number = Date.now) {}
  async step(lease: Lease, deadline: number): Promise<boolean> {
    const publication = new RefreshPublication(this.refreshes);
    if (await publication.get(lease.runId)) return true;
    const plan = (await this.refreshes.get(lease.runId))!.plan, store = this.refreshes.foundation;
    const rows = (await store.db.prepare('SELECT security_id,value FROM refresh_work WHERE run_id=?').bind(lease.runId).all<{ security_id: string; value: string }>()).results;
    const states = new Map(rows.map(r => [r.security_id,JSON.parse(r.value) as Work]));
    const entry = plan.entries.find(e => !states.get(e.securityId)?.decision);
    if (!entry) { await publication.publish(lease,plan.entries.map(e => states.get(e.securityId)!.decision!)); return true; }
    const work: Work = states.get(entry.securityId) ?? { steps: 0, phase: 'price', pending: null, reads: [], requests: [], gaps: [], price: null, repair: 0, decision: null };
    const save = async () => { await store.fenced(lease,this.clock(),[store.db.prepare('INSERT INTO refresh_work(run_id,security_id,value) VALUES(?,?,?) ON CONFLICT(run_id,security_id) DO UPDATE SET value=excluded.value')
      .bind(lease.runId,entry.securityId,JSON.stringify(work))]); };
    const finish = async (proposal: unknown | null, gap: string | null) => {
      work.decision = { securityId: entry.securityId, proposal, gap, price: work.price, modelId: this.model?.modelId ?? null };
      work.pending = null; await save(); return false;
    };
    if (work.pending) return finish(null,'unknown_billed_call');
    if (work.steps>=refreshPolicy.stagesPerName) return finish(null,'refresh_work_bound');
    if (this.clock()>=plan.cutoff) return finish(null,'research_cutoff');
    if (this.clock()>=deadline) return false;
    work.steps++;
    const passId = `refresh:${lease.runId}:${entry.securityId}`, bound = Math.min(deadline,plan.cutoff);
    const mapping = this.mappings.find(m => m.securityId===entry.securityId && m.issuerId===entry.issuerId);
    this.tools.setIssuerCiks(mapping ? { [entry.securityId]: mapping.cik } : {});
    if (work.phase==='price') {
      work.pending = 'price_dispatch'; await save();
      if (this.prices) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(),Math.max(1,Math.min(20000,bound-this.clock())));
        try { work.price = await this.prices.latest(entry,plan.session,plan.cutoff,controller.signal); }
        catch { work.gaps.push('premarket_unavailable'); }
        finally { clearTimeout(timer); controller.abort(); }
      }
      work.pending = null; work.phase = 'search'; await save(); return false;
    }
    const tool = async (request: ToolRequest) => {
      work.pending = 'tool_dispatch'; await save();
      const result = await this.tools.dispatch(entry.securityId,passId,request,bound,entry.symbol || undefined);
      work.pending = null;
      if (result.kind==='gap') work.gaps.push(result.code);
      if (result.kind==='links') { work.reads.push(...result.links.flatMap(l => l.sourceId ? [l.sourceId] : [])); if (result.links.some(l => !l.sourceId)) work.gaps.push('unregistered_source_links'); }
      work.reads = [...new Set(work.reads)].slice(0,3); await save(); return false;
    };
    if (work.phase==='search') { work.phase = 'filings'; return tool({ kind: 'search', topic: 'announcement' }); }
    if (work.phase==='filings') {
      work.phase = 'read'; work.pending = 'filings_dispatch'; await save();
      const previous = entry.previousId ? await new Tracking(store,this.clock).version(entry.previousId) : null;
      const result = mapping ? await this.tools.changedFilings(entry.securityId,mapping.cik,passId,bound,previous?.cutoff ?? 0) : { kind: 'gap' as const, code: 'issuer_mapping_unavailable' };
      if (result.kind==='links') work.reads.push(...result.links.flatMap(l => l.sourceId ? [l.sourceId] : []));
      if (result.kind==='gap') work.gaps.push(result.code);
      work.reads = [...new Set(work.reads)].slice(0,3); work.pending = null; await save(); return false;
    }
    if (work.reads.length) return tool({ kind: 'read', sourceId: work.reads.shift()! });
    work.phase = 'assess';
    if (work.requests.length) return tool(work.requests.shift()!);
    if (!this.model) return finish(null,'model_unavailable');
    const previous = entry.previousId ? await new Tracking(store,this.clock).version(entry.previousId) : null;
    const evidence = (await this.tools.evidence(entry.securityId,Math.min(this.clock(),plan.cutoff))).filter(e => e.publishedAt===null || e.publishedAt<=Math.min(this.clock(),plan.cutoff));
    const context = JSON.stringify({ securityId: entry.securityId, symbol: entry.symbol, metrics: entry.metrics, marketAsOf: entry.marketAsOf,
      previous, price: work.price, currentEntryValidated: false, gaps: [...new Set(work.gaps)], sources: await this.tools.sources(entry.securityId),
      evidence: evidence.slice(-6).map(e => ({ id: e.id, originId: e.originId, publishedAt: e.publishedAt, acquiredAt: e.acquiredAt, untrustedQuotedText: e.text.slice(0,1800) })), repair: work.repair>0 });
    const system = researchSystem+' Re-review the previous thesis against newly available evidence. Explicitly identify changes in attractiveness and invalidation. Delayed premarket data cannot validate entry or substitute for a daily close. Missing prices never imply unchanged conditions.';
    const inputBound = new TextEncoder().encode(system+context).length+1024;
    const maxOutput = 1200-(await this.tools.ledger.usage('pass','output',passId)).reserved;
    let call: string;
    try { call = await this.tools.ledger.reserve('model',passId,{ input: inputBound, output: maxOutput }); }
    catch { return finish(null,'model_budget_exhausted'); }
    work.pending = call; await save();
    let output: unknown;
    try { output = await dispatchModel(this.model,{ system,context,inputBound,maxOutput },this.tools.ledger,call,bound,this.clock); }
    catch { return finish(null,'unknown_billed_call'); }
    work.pending = null;
    try {
      const response = researchResponseSchema.parse(output);
      if (response.kind==='tools') { work.requests = response.requests; await save(); return false; }
      validateAssessment(response.proposal,{ ...entry, evidence, cutoff: Math.min(this.clock(),plan.cutoff), expiresAt: plan.open, modelId: this.model.modelId });
      return finish(response.proposal,work.gaps.length ? [...new Set(work.gaps)].join(';') : null);
    } catch {
      work.repair++; if (work.repair>1) return finish(null,'invalid_structured_output');
      await save(); return false;
    }
  }
}
export async function drainRefresh(store: Foundation, env: MarketEnv, candidate: Run, clock: () => number = Date.now, fetcher: typeof fetch = fetch) {
  const lease = await store.claim(candidate.id,crypto.randomUUID(),clock()); if (!lease) return;
  try {
    const shared = await ResearchRuntime.create(store,lease,env,clock,fetcher);
    const refreshes = new Refreshes(store,clock), publications = new RefreshPublication(refreshes);
    const prices = env.ALPACA_KEY && env.ALPACA_SECRET ? new DelayedPremarket(new MarketHttp(store,lease,{ alpacaKey: env.ALPACA_KEY, alpacaSecret: env.ALPACA_SECRET },clock,fetcher),clock) : null;
    const runtime = new RefreshRuntime(refreshes,shared.researcher.tools,shared.researcher.model,prices,shared.intake.mappings,clock);
    const start = clock();
    // Share the pipeline lease and reserve the existing 1.5s research-stage CPU allowance; max 10 stages/invocation.
    for (let i=0;i<refreshPolicy.stagesPerTick && clock()-start<195000;i++) {
      await store.renew(lease,clock());
      if (!await runtime.step(lease,Math.min(start+230000,clock()+35000))) continue;
      await publications.certify(lease);
      if (!await store.report(lease.runId)) {
        await store.stage(lease,0,[{ id: 'refresh', kind: 'disposition', acquiredAt: clock(), value: { refreshId: lease.runId, researchOnly: true } }],clock());
        await store.publish(lease,{ id: lease.runId, cutoff: clock(), expectedPages: 1 },clock());
      }
      await store.certify(lease,lease.runId,clock); await store.complete(lease,clock()); break;
    }
  } catch { await store.fail(lease,clock(),{ permanent: true }); }
  finally { await store.release(lease,clock()); }
}
