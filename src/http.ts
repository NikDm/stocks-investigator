import { purchaseList, purchaseDetail } from './purchases/view';
import { Purchases, purchaseCommand } from './purchases/store';
import { retrospectiveView } from './outcomes/retrospective';
import { Outcomes } from './outcomes/store';
import { evaluationView } from './outcomes/view';
import { Refreshes, refreshCommand } from './refresh/store';
import { refreshControls, refreshView } from './refresh/view';
import { Tracking, trackingCommand } from './tracking/store';
import { trackingList, trackingDetail } from './tracking/view';
import { dashboard, reportView, assessmentView, page, escape, css, sourceHref } from './morning/view';
import { evidenceSchema } from './research/assessment';
import { ReviewFeedback } from './morning/feedback';
import { ResearchPublisher } from './research/publisher';
import { Hono } from 'hono';
import { createRemoteJWKSet, createLocalJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { csrfToken, validCsrf } from './csrf';
import { Conflict, Foundation } from './persistence';
import { Screener } from './screening/persistence';
import { MarketCapture } from './market/capture';
import { marketCommand, type MarketEnv } from './market/runtime';
import { syntheticCommand } from './coordinator';

export type Env = MarketEnv & {
  DB: D1Database;
  APP_ORIGIN: string;
  ACCESS_ISSUER: string;
  ACCESS_AUDIENCE: string;
  ALLOWED_EMAIL: string;
  CSRF_SECRET: string;
  JOBS_ENABLED: string;
  LOCAL_JWKS?: string;
};
const accessConfig = z.object({
  APP_ORIGIN: z.string().url(),
  ACCESS_ISSUER: z.string().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/),
  ACCESS_AUDIENCE: z.string().min(1), ALLOWED_EMAIL: z.string().email(),
});
const keySets = new Map<string, JWTVerifyGetKey>();

export function createApp(options: { keySet?: JWTVerifyGetKey; clock?: () => number } = {}) {
  const clock = options.clock ?? Date.now;
  const app = new Hono<{ Bindings: Env; Variables: { identity: string } }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    const config = accessConfig.safeParse(c.env);
    const token = c.req.header('cf-access-jwt-assertion');
    if (!config.success || !token || token.length > 16384) return c.text('Unauthorized', 401);
    const { ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: audience, APP_ORIGIN: origin, ALLOWED_EMAIL: email } = config.data;
    try {
      let keySet = options.keySet ?? keySets.get(issuer);
      if (!options.keySet && c.env.LOCAL_JWKS) {
        if (origin !== 'http://127.0.0.1:8787' || new URL(c.req.url).origin !== origin) return c.text('Unauthorized', 401);
        keySet = createLocalJWKSet(JSON.parse(c.env.LOCAL_JWKS));
      }
      if (!keySet) {
        keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
        keySets.set(issuer, keySet);
      }
      const { payload } = await jwtVerify(token, keySet, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'email'] });
      if (payload.email !== email) return c.text('Unauthorized', 401);
      c.set('identity', email);
    } catch { return c.text('Unauthorized', 401); }
    if (new URL(c.req.url).origin !== origin) return c.text('Forbidden', 403);
    await next();
  });
  app.use('/api/*', bodyLimit({ maxSize: 8192, onError: (c) => c.json({ error: 'request_too_large' }, 413) }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/csrf', async (c) => c.json({ token: await csrfToken(c.env.CSRF_SECRET, c.get('identity')) }));
  app.get('/api/status', async (c) => {
    const store = new Foundation(c.env.DB);
    return c.json({ jobsEnabled: c.env.JOBS_ENABLED === 'true', runs: await store.status(), storage: await store.metrics(), budgets: await store.budgets(), marketEnabled: c.env.MARKET_ENABLED === 'true' });
  });
  app.post('/api/runs', async (c) => {
    if (c.req.header('origin') !== c.env.APP_ORIGIN) return c.text('Forbidden', 403);
    if (!await validCsrf(c.env.CSRF_SECRET, c.get('identity'), c.req.header('x-csrf-token') ?? '')) return c.text('Forbidden', 403);
    if (c.env.JOBS_ENABLED !== 'true') return c.json({ error: 'jobs_disabled' }, 503);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_command' }, 400); }
    const parsed = z.object({ key: z.string().min(1).max(100), pages: syntheticCommand.shape.pages }).strict().safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_command' }, 400);
    const now = Date.now();
    try {
      const run = await new Foundation(c.env.DB).enqueue(`manual:${c.get('identity')}:${parsed.data.key}`, { pages: parsed.data.pages }, now);
      return c.json({ run, nextTickDelaySeconds: Math.ceil((300000 - now % 300000) / 1000) }, 202);
    } catch (error) { if (error instanceof Conflict) return c.json({ error: 'idempotency_conflict' }, 409); throw error; }
  });
  app.post('/api/market/runs', async c => {
    if (c.req.header('origin') !== c.env.APP_ORIGIN || !await validCsrf(c.env.CSRF_SECRET,c.get('identity'),c.req.header('x-csrf-token') ?? '')) return c.text('Forbidden',403);
    if (c.env.JOBS_ENABLED !== 'true' || c.env.MARKET_ENABLED !== 'true') return c.json({ error: 'market_disabled' },503);
    let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: 'invalid_command' },400); }
    const parsed = marketCommand.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_command' },400);
    const now = Date.now();
    try {
      const run = await new Foundation(c.env.DB).enqueue(`market:screen-eval-v1:${parsed.data.reportDate}:${parsed.data.seed ? 'seed' : 'morning'}`,parsed.data,now);
      return c.json({ run, nextTickDelaySeconds: Math.ceil((300000-now%300000)/1000) },202);
    } catch (error) { if (error instanceof Conflict) return c.json({ error: 'idempotency_conflict' },409); throw error; }
  });
  app.get('/api/market/snapshots/:id',async c => {
    const offset = Number(c.req.query('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return c.json({ error: 'invalid_offset' },400);
    const capture = new MarketCapture(new Foundation(c.env.DB));
    const snapshot = await capture.snapshot(c.req.param('id'),offset);
    if (!snapshot) return c.json({ error: 'snapshot_unavailable' },404);
    const watch = await capture.foundation.db.prepare('SELECT value FROM early_watch_publications WHERE snapshot_id=?').bind(snapshot.id).first<{ value: string }>();
    return c.json({ snapshot, screening: await new Screener(capture).result(snapshot.id,offset), research: await new ResearchPublisher(capture.foundation).publication(snapshot.id), earlyWatch: watch ? JSON.parse(watch.value) : null, coverage: await capture.coverage(snapshot.id), progress: await capture.progress(snapshot.id), offset, pageSize: 100 });
  });
  app.get('/retrospective/:id',async c => {
    const html = await retrospectiveView(new Foundation(c.env.DB),c.req.param('id'),clock(),c.req.query('coverageAfter') ?? '');
    return html ? c.html(html) : c.text('Retrospective unavailable',404);
  });
  app.get('/evaluation/:id',async c => {
    const horizon = Number(c.req.query('horizon') ?? 20);
    if (horizon!==10 && horizon!==20 && horizon!==30) return c.text('Invalid horizon',400);
    const html = await evaluationView(new Foundation(c.env.DB),c.req.param('id'),horizon,clock(),c.req.query('after') ?? '');
    return html ? c.html(html) : c.text('Evaluation unavailable',404);
  });
  app.get('/api/outcomes/:id',async c => {
    const horizon = Number(c.req.query('horizon') ?? 20);
    if (horizon!==10 && horizon!==20 && horizon!==30) return c.json({error:'invalid_horizon'},400);
    const report = await new Foundation(c.env.DB).db.prepare('SELECT 1 FROM market_snapshots WHERE id=? AND frozen=1').bind(c.req.param('id')).first();
    if (!report) return c.json({error:'snapshot_unavailable'},404);
    return c.json(await new Outcomes(new Foundation(c.env.DB),clock).members(c.req.param('id'),horizon,c.req.query('after') ?? ''));
  });
  app.get('/evaluation/:id/:security/history',async c => {
    const horizon = Number(c.req.query('horizon') ?? 20), after = Number(c.req.query('after') ?? 0);
    if (![10,20,30].includes(horizon) || !Number.isSafeInteger(after) || after<0) return c.text('Invalid history query',400);
    const history = await new Outcomes(new Foundation(c.env.DB),clock).history(c.req.param('id'),c.req.param('security'),horizon,after);
    return c.html(page('Outcome calculation history',`<a href="/evaluation/${encodeURIComponent(c.req.param('id'))}?horizon=${horizon}">Evaluation</a><p>Append-only revisions, oldest first. Source observation and review identifiers are retained for audit.</p><pre>${escape(JSON.stringify(history,null,2))}</pre>${history.length===100 ? `<a href="?horizon=${horizon}&amp;after=${history.at(-1)!.sequence}">Next revisions</a>` : ''}`));
  });
  app.get('/dashboard.css', c => c.body(css,200,{ 'Content-Type': 'text/css; charset=utf-8' }));
  app.get('/', async c => c.html(await dashboard(new Foundation(c.env.DB),clock(),c.env.JOBS_ENABLED==='true')));
  app.get('/morning/:id', async c => {
    const html = await reportView(new Foundation(c.env.DB),c.req.param('id'),clock(),await csrfToken(c.env.CSRF_SECRET,c.get('identity')));
    if (!html) return c.text('Morning report unavailable',404);
    const controls = await refreshControls(new Foundation(c.env.DB),c.req.param('id'),await csrfToken(c.env.CSRF_SECRET,c.get('identity')),clock(),c.env.JOBS_ENABLED==='true' && c.env.MARKET_ENABLED==='true');
    return c.html(html.replace('</main>',controls+'</main>'));
  });
  app.get('/refresh/:id',async c => {
    const html = await refreshView(new Foundation(c.env.DB),c.req.param('id'),clock());
    return html ? c.html(html) : c.text('Refresh unavailable',404);
  });
  app.use('/refresh/commands',bodyLimit({ maxSize: 8192, onError: c => c.text('Request too large',413) }));
  const refresh = async (c: import('hono').Context<{ Bindings: Env; Variables: { identity: string } }>, form: boolean) => {
    if (c.req.header('origin')!==c.env.APP_ORIGIN) return c.text('Forbidden',403);
    let raw: unknown, token = c.req.header('x-csrf-token') ?? '';
    try {
      if (form) { const fields = await c.req.parseBody(); token = String(fields.csrf ?? ''); raw = { morningId: fields.morningId, key: fields.key }; }
      else raw = await c.req.json();
    } catch { return c.json({ error: 'invalid_refresh_command' },400); }
    if (!await validCsrf(c.env.CSRF_SECRET,c.get('identity'),token)) return c.text('Forbidden',403);
    if (c.env.JOBS_ENABLED!=='true' || c.env.MARKET_ENABLED!=='true') return c.json({ error: 'refresh_disabled' },503);
    const command = refreshCommand.safeParse(raw); if (!command.success) return c.json({ error: 'invalid_refresh_command' },400);
    try {
      const result = await new Refreshes(new Foundation(c.env.DB),clock).command(c.get('identity'),command.data);
      return form ? c.redirect(`/refresh/${encodeURIComponent(result.runId)}`,303) : c.json(result,202);
    } catch (error) { if (!(error instanceof Conflict)) throw error; return c.json({ error: 'refresh_conflict', message: error.message },409); }
  };
  app.post('/api/refresh',c => refresh(c,false));
  app.post('/refresh/commands',c => refresh(c,true));
  app.get('/assessments/:id',async c => {
    const assessment = await new Tracking(new Foundation(c.env.DB),clock).version(c.req.param('id'));
    return assessment ? c.html(assessmentView(assessment,clock())) : c.text('Assessment unavailable',404);
  });
  app.get('/api/purchases',async c => c.json({ purchases: await new Purchases(new Foundation(c.env.DB),clock).list(c.req.query('after') ?? '') }));
  app.get('/api/purchases/:id',async c => {
    const after = Number(c.req.query('after') ?? 0);
    if (!Number.isSafeInteger(after) || after<0) return c.json({ error: 'invalid_cursor' },400);
    const store = new Purchases(new Foundation(c.env.DB),clock), id = c.req.param('id');
    const purchase = await store.get(id);
    if (!purchase) return c.json({ error: 'purchase_unavailable' },404);
    const events = await store.history(id,after);
    return c.json({ purchase, history: events.map(e => e.value), events, nextAfter: events.length===100 ? events.at(-1)!.sequence : null });
  });
  app.get('/purchases',async c => c.html(await purchaseList(new Purchases(new Foundation(c.env.DB),clock),await csrfToken(c.env.CSRF_SECRET,c.get('identity')),c.req.query('after') ?? '')));
  app.get('/purchases/:id',async c => {
    const after = Number(c.req.query('after') ?? 0);
    if (!Number.isSafeInteger(after) || after<0) return c.text('Invalid history cursor',400);
    const html = await purchaseDetail(new Purchases(new Foundation(c.env.DB),clock),c.req.param('id'),await csrfToken(c.env.CSRF_SECRET,c.get('identity')),after);
    return html ? c.html(html) : c.text('Purchase unavailable',404);
  });
  app.use('/purchases/commands',bodyLimit({ maxSize: 8192, onError: c => c.text('Request too large',413) }));
  const purchase = async (c: import('hono').Context<{ Bindings: Env; Variables: { identity: string } }>, form: boolean) => {
    if (c.req.header('origin')!==c.env.APP_ORIGIN) return c.text('Forbidden',403);
    let raw: unknown, token = c.req.header('x-csrf-token') ?? '';
    try {
      if (form) {
        const fields = await c.req.parseBody(); token = String(fields.csrf ?? '');
        raw = Object.fromEntries(Object.entries(fields).filter(([key,value]) => key!=='csrf' && value!=='').map(([key,value]) => [key,key==='expectedRevision' ? Number(value) : value]));
      } else raw = await c.req.json();
    } catch { return c.json({ error: 'invalid_purchase_command' },400); }
    if (!await validCsrf(c.env.CSRF_SECRET,c.get('identity'),token)) return c.text('Forbidden',403);
    const command = purchaseCommand.safeParse(raw);
    if (!command.success) return c.json({ error: 'invalid_purchase_command' },400);
    try {
      const result = await new Purchases(new Foundation(c.env.DB),clock).command(c.get('identity'),command.data);
      return form ? c.redirect(`/purchases/${encodeURIComponent(result.purchaseId)}`,303) : c.json(result,201);
    }
    catch (error) { if (!(error instanceof Conflict)) throw error; return c.json({ error: 'purchase_conflict', message: error.message },409); }
  };
  app.post('/api/purchases',c => purchase(c,false));
  app.post('/purchases/commands',c => purchase(c,true));
  app.get('/tracking',async c => c.html(await trackingList(new Tracking(new Foundation(c.env.DB),clock),clock())));
  app.get('/tracking/:id',async c => {
    const html = await trackingDetail(new Tracking(new Foundation(c.env.DB),clock),c.req.param('id'),clock(),await csrfToken(c.env.CSRF_SECRET,c.get('identity')));
    return html ? c.html(html) : c.text('Opportunity unavailable',404);
  });
  app.use('/tracking/commands',bodyLimit({ maxSize: 8192, onError: c => c.text('Request too large',413) }));
  const track = async (c: import('hono').Context<{ Bindings: Env; Variables: { identity: string } }>, form: boolean) => {
    if (c.req.header('origin')!==c.env.APP_ORIGIN) return c.text('Forbidden',403);
    let raw: unknown, token = c.req.header('x-csrf-token') ?? '';
    try {
      if (form) {
        const fields = await c.req.parseBody(); token = String(fields.csrf ?? '');
        raw = Object.fromEntries(Object.entries(fields).filter(([key]) => key!=='csrf').map(([key,value]) => [key,key==='expectedRevision' ? Number(value) : value]));
      } else raw = await c.req.json();
    } catch { return c.json({ error: 'invalid_tracking_command' },400); }
    if (!await validCsrf(c.env.CSRF_SECRET,c.get('identity'),token)) return c.text('Forbidden',403);
    const parsed = trackingCommand.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'invalid_tracking_command' },400);
    try {
      const result = await new Tracking(new Foundation(c.env.DB),clock).command(c.get('identity'),parsed.data);
      return form ? c.redirect(`/tracking/${encodeURIComponent(result.securityId)}`,303) : c.json(result,201);
    } catch (error) {
      if (!(error instanceof Conflict)) throw error;
      return form ? c.html(page('Tracking command conflict','<p>The opportunity or capacity changed, or the assessment/calendar is not current. Reload the opportunity and retry with its current revision.</p><a href="/tracking">Tracked opportunities</a>'),409)
        : c.json({ error: 'tracking_conflict', message: error.message },409);
    }
  };
  app.post('/api/tracking',c => track(c,false));
  app.post('/tracking/commands',c => track(c,true));
  app.get('/evidence/:id',async c => {
    const row = await c.env.DB.prepare('SELECT value FROM research_evidence WHERE id=?').bind(c.req.param('id')).first<{ value: string }>();
    if (!row) return c.text('Evidence unavailable',404);
    const evidence = evidenceSchema.parse(JSON.parse(row.value));
    return c.html(page('Evidence',`<a href="/">Dashboard</a><p><a href="${sourceHref(evidence.url)}">Original source</a></p><p>Published: ${evidence.publishedAt===null ? 'unknown' : new Date(evidence.publishedAt).toISOString()}; acquired: ${new Date(evidence.acquiredAt).toISOString()}.</p><blockquote>${escape(evidence.text)}</blockquote><p>Sanitized excerpt only; full replay unavailable.</p>`));
  });
  app.use('/morning/*/feedback',bodyLimit({ maxSize: 8192, onError: c => c.text('Request too large',413) }));
  const feedback = async (c: import('hono').Context<{ Bindings: Env; Variables: { identity: string } }>, form: boolean) => {
    if (c.req.header('origin')!==c.env.APP_ORIGIN) return c.text('Forbidden',403);
    let raw: unknown, token = c.req.header('x-csrf-token') ?? '';
    try {
      if (form) {
        const fields = await c.req.parseBody(); token = String(fields.csrf ?? '');
        raw = Object.fromEntries(Object.entries(fields).filter(([key,value]) => key!=='csrf' && value!=='').map(([key,value]) =>
          [key,key==='minutes' ? Number(value) : ['understanding','effort','decision'].includes(key) ? value==='true' ? true : value==='false' ? false : value : value]));
      } else raw = await c.req.json();
    } catch { return c.text('Invalid feedback',400); }
    if (!await validCsrf(c.env.CSRF_SECRET,c.get('identity'),token)) return c.text('Forbidden',403);
    try { await new ReviewFeedback(new Foundation(c.env.DB),clock).record(c.req.param('id')!,raw); }
    catch (error) { return c.json({ error: error instanceof Conflict ? 'feedback_conflict' : 'invalid_feedback' },error instanceof Conflict ? 409 : 400); }
    return form ? c.redirect(`/morning/${encodeURIComponent(c.req.param('id')!) }#feedback`,303) : c.json({ saved: true },201);
  };
  app.post('/api/morning/:id/feedback',c => feedback(c,false));
  app.post('/morning/:id/feedback',c => feedback(c,true));
  app.get('/reports/:id', async (c) => {
    const offset = Number(c.req.query('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return c.text('Invalid page', 400);
    const report = await new Foundation(c.env.DB).report(c.req.param('id'), offset);
    if (!report) return c.text('Report unavailable', 404);
    return c.html(page('Research report', `<p>Synthetic foundation record. Research only; no evaluated selection.</p>
      <p>Cutoff: ${escape(new Date(report.cutoff).toISOString())}. ${report.receipt ? `Observed availability: ${escape(new Date(report.receipt.observed_at).toISOString())}` : 'Publication timing unverified.'}</p>
      <p>${report.itemCount} total records. Showing up to 100.</p><pre>${escape(JSON.stringify(report.items, null, 2))}</pre>${offset + 100 < report.itemCount ? `<a href="?offset=${offset + 100}">Next page</a>` : ''}`));
  });
  app.onError((_error, c) => c.json({ error: 'unavailable' }, 503));
  return app;
}
