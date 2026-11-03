import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'local' };
await writeFile('.dev.vars', [
  'ALLOWED_EMAIL=local@example.com',
  `CSRF_SECRET=${randomBytes(32).toString('hex')}`,
  'APP_ORIGIN=http://127.0.0.1:8787',
  'ACCESS_ISSUER=https://local.cloudflareaccess.com',
  'ACCESS_AUDIENCE=local',
  `LOCAL_JWKS='${JSON.stringify({ keys: [jwk] })}'`,
  'JOBS_ENABLED=true',
].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
const token = await new SignJWT({ email: 'local@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'local' })
  .setIssuer('https://local.cloudflareaccess.com').setAudience('local').setIssuedAt().setExpirationTime('2h').sign(privateKey);
await mkdir('.wrangler', { recursive: true });
await writeFile('.wrangler/local-auth-header', `cf-access-jwt-assertion: ${token}\n`, { mode: 0o600 });
console.info('Created local-only .dev.vars and .wrangler/local-auth-header (expires in two hours).');
