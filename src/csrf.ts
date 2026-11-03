import { SignJWT, jwtVerify } from 'jose';
function key(secret: string) {
  if (!secret || secret.length < 32) throw new Error('csrf_unconfigured');
  return new TextEncoder().encode(secret);
}
export function csrfToken(secret: string, identity: string) {
  return new SignJWT({ purpose: 'csrf' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity).setIssuedAt().setExpirationTime('30m').sign(key(secret));
}
export async function validCsrf(secret: string, identity: string, token: string) {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'], subject: identity, requiredClaims: ['exp', 'iat'] });
    return payload.purpose === 'csrf';
  } catch { return false; }
}
