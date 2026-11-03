import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/http';
import { env } from 'cloudflare:test';
export async function authenticated() {
  const keys = await generateKeyPair('RS256');
  const jwk = await exportJWK(keys.publicKey);
  const bindings = { ...env, APP_ORIGIN: 'https://research.example', ACCESS_ISSUER: 'https://team.cloudflareaccess.com',
    ACCESS_AUDIENCE: 'application', ALLOWED_EMAIL: 'investor@example.com', CSRF_SECRET: 'synthetic-test-only-csrf-key-32-characters', JOBS_ENABLED: 'true' };
  const app = createApp({ keySet: createLocalJWKSet({ keys: [{ ...jwk, kid: 'access' }] }) });
  const token = await new SignJWT({ email: bindings.ALLOWED_EMAIL }).setProtectedHeader({ alg: 'RS256', kid: 'access' })
    .setIssuer(bindings.ACCESS_ISSUER).setAudience(bindings.ACCESS_AUDIENCE).setExpirationTime('5m').sign(keys.privateKey);
  return {
    bindings,
    request: (path: string, init: RequestInit = {}) => app.request(`${bindings.APP_ORIGIN}${path}`, {
      ...init, headers: { 'cf-access-jwt-assertion': token, ...Object.fromEntries(new Headers(init.headers)) },
    }, bindings),
  };
}
