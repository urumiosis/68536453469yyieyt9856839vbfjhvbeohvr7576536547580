export const VERSION = 'am2';
export const AUDIENCE = 'anti-markaryd.com';
export const MAX_LICENSE_LENGTH = 4096;
export const DEVICE_ID = /^[A-Za-z0-9_-]{43}$/;
export const ACCOUNT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function encodeBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) throw new Error('Invalid base64url');
  return bytes;
}

export async function verifyLicense(token, publicKey, userId, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > MAX_LICENSE_LENGTH || !ACCOUNT_ID.test(userId)) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [version, payload, encodedSignature] = parts;
  try {
    const signature = decodeBase64Url(encodedSignature);
    if (signature.length !== 64) return null;
    const valid = await crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signature, encoder.encode(`${version}.${payload}`));
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(decodeBase64Url(payload)));
    if (!claims || claims.aud !== AUDIENCE || claims.sub !== userId ||
        typeof claims.device !== 'string' || !DEVICE_ID.test(claims.device) ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
        claims.iat > now || claims.exp <= now || claims.exp <= claims.iat) return null;
    return claims;
  } catch {
    return null;
  }
}
