import { describe, expect, it } from 'vitest';
import { createApp } from '../src/http';

describe('private HTTP', () => {
  it('rejects unauthenticated reports, health and mutation requests on every host', async () => {
    const app = createApp();
    for (const host of ['https://research.example', 'https://preview.workers.dev']) {
      for (const path of ['/', '/api/status', '/api/runs', '/health']) {
        const response = await app.request(`${host}${path}`, { method: path === '/api/runs' ? 'POST' : 'GET' }, {});
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
  });
});

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

it('verifies signature, identity, audience, issuer and expiry before exposing private status', async () => {
  const keys = await generateKeyPair('RS256');
  const jwk = await exportJWK(keys.publicKey);
  const app = createApp({ keySet: createLocalJWKSet({ keys: [{ ...jwk, kid: 'access' }] }) });
  const env = {
    APP_ORIGIN: 'https://research.example', ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
    ACCESS_AUDIENCE: 'application', ALLOWED_EMAIL: 'investor@example.com',
  };
  const token = (claims = {}, signingKey = keys.privateKey) => new SignJWT({ email: env.ALLOWED_EMAIL, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'access' }).setIssuer(env.ACCESS_ISSUER)
    .setAudience(env.ACCESS_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(signingKey);
  const request = (jwt: string, host = env.APP_ORIGIN) => app.request(`${host}/health`, { headers: { 'cf-access-jwt-assertion': jwt } }, env);
  expect((await request(await token())).status).toBe(200);
  for (const claims of [{ email: 'other@example.com' }, { aud: 'other' }, { iss: 'https://evil.example' }, { exp: 1 }]) {
    // Registered claims set after construction must be overridden explicitly.
    const jwt = await new SignJWT({ email: env.ALLOWED_EMAIL, iss: env.ACCESS_ISSUER, aud: env.ACCESS_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 60, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'access' }).sign(keys.privateKey);
    expect((await request(jwt)).status).toBe(401);
  }
  expect((await request(await token(), 'https://preview.workers.dev')).status).toBe(403);
  const otherKeys = await generateKeyPair('RS256');
  expect((await request(await token({}, otherKeys.privateKey))).status).toBe(401);
});

import { authenticated } from './auth';
import { env } from 'cloudflare:test';
import { Foundation } from '../src/persistence';

it('requires same-origin and a signed CSRF token, then queues manual work for the next tick', async () => {
  const { request } = await authenticated();
  const csrf = await (await request('/api/csrf')).json() as { token: string };
  const body = JSON.stringify({ key: 'manual-http', pages: 3 });
  const headers = { 'content-type': 'application/json', origin: 'https://research.example', 'x-csrf-token': csrf.token };
  expect((await request('/api/runs', { method: 'POST', body, headers: { ...headers, origin: 'https://evil.example' } })).status).toBe(403);
  expect((await request('/api/runs', { method: 'POST', body, headers: { ...headers, 'x-csrf-token': 'forged' } })).status).toBe(403);
  const response = await request('/api/runs', { method: 'POST', body, headers });
  expect(response.status).toBe(202);
  const result = await response.json() as { run: { id: string; state: string }; nextTickDelaySeconds: number };
  expect(result.run.state).toBe('queued');
  expect(result.nextTickDelaySeconds).toBeGreaterThan(0);
  expect(result.nextTickDelaySeconds).toBeLessThanOrEqual(300);
  expect((await new Foundation(env.DB).run(result.run.id))?.cursor).toBe(0);
});

it('renders report content as escaped text and never exposes server bindings', async () => {
  const store = new Foundation(env.DB), now = Date.now();
  const run = await store.enqueue('synthetic:html', { pages: 1 }, now);
  const lease = (await store.claim(run.id, 'html-writer', now))!;
  await store.stage(lease, 0, [{ id: 'X', kind: 'assessment', acquiredAt: now, value: { text: '<script>danger()</script>' } }], now);
  await store.publish(lease, { id: 'html-report', cutoff: now, expectedPages: 1 }, now);
  await store.release(lease, now);
  const { request, bindings } = await authenticated();
  const html = await (await request('/reports/html-report')).text();
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>danger()');
  expect(html).not.toContain(bindings.CSRF_SECRET);
});

it('allows generated local JWT keys only on the configured loopback origin', async () => {
  const keys = await generateKeyPair('RS256'), jwk = await exportJWK(keys.publicKey);
  const bindings = { ...env, APP_ORIGIN: 'http://127.0.0.1:8787', ACCESS_ISSUER: 'https://local.cloudflareaccess.com',
    ACCESS_AUDIENCE: 'local', ALLOWED_EMAIL: 'local@example.com', LOCAL_JWKS: JSON.stringify({ keys: [{ ...jwk, kid: 'local' }] }) };
  const jwt = await new SignJWT({ email: bindings.ALLOWED_EMAIL }).setProtectedHeader({ alg: 'RS256', kid: 'local' })
    .setIssuer(bindings.ACCESS_ISSUER).setAudience(bindings.ACCESS_AUDIENCE).setExpirationTime('5m').sign(keys.privateKey);
  const app = createApp(), headers = { 'cf-access-jwt-assertion': jwt };
  expect((await app.request('http://127.0.0.1:8787/health', { headers }, bindings)).status).toBe(200);
  expect((await app.request('https://research.example/health', { headers }, { ...bindings, APP_ORIGIN: 'https://research.example' })).status).toBe(401);
});
