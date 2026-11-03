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
  app.get('/dashboard.css', c => c.body(css,200,{ 'Content-Type': 'text/css; charset=utf-8' }));
  app.get('/', async c => c.html(await dashboard(new Foundation(c.env.DB),clock(),c.env.JOBS_ENABLED==='true')));
  app.get('/morning/:id', async c => {
    const html = await reportView(new Foundation(c.env.DB),c.req.param('id'),clock(),await csrfToken(c.env.CSRF_SECRET,c.get('identity')));
    return html ? c.html(html) : c.text('Morning report unavailable',404);
  });
  app.get('/assessments/:id',async c => {
    const assessment = await new ResearchPublisher(new Foundation(c.env.DB)).version(c.req.param('id'));
    return assessment ? c.html(assessmentView(assessment,clock())) : c.text('Assessment unavailable',404);
  });
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
