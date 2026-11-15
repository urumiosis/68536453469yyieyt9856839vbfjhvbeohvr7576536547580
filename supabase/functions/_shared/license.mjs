export const VERSION = 'am3';
export const AUDIENCE = 'anti-markaryd.com';
export const MAX_LICENSE_LENGTH = 4096;
export const MAX_LICENSE_TEXT_BYTES = 2048;
export const DEVICE_ID = /^[A-Za-z0-9_-]{43}$/;
export const ACCOUNT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };

const encoder = new TextEncoder();

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
  if (typeof token !== 'string' || !ACCOUNT_ID.test(userId) ||
      encoder.encode(token).byteLength > MAX_LICENSE_LENGTH) return null;
  try {
    const certificate = JSON.parse(token);
    if (!certificate || typeof certificate !== 'object' || Array.isArray(certificate) ||
        certificate.format !== VERSION ||
        Object.keys(certificate).sort().join(',') !== 'claims,format,signature' ||
        typeof certificate.signature !== 'string') return null;

    const claims = certificate.claims;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
        Object.keys(claims).sort().join(',') !== 'aud,device,exp,iat,license,sub' ||
        claims.aud !== AUDIENCE || claims.sub !== userId ||
        typeof claims.device !== 'string' || !DEVICE_ID.test(claims.device) ||
        typeof claims.license !== 'string' || !claims.license.trim() ||
        encoder.encode(claims.license).byteLength > MAX_LICENSE_TEXT_BYTES ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
        claims.iat > now || claims.exp <= now || claims.exp <= claims.iat) return null;

    const signature = decodeBase64Url(certificate.signature);
    if (signature.length !== 64) return null;
    const signed = VERSION + '.' + encodeBase64Url(encoder.encode(JSON.stringify(claims)));
    const valid = await crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signature, encoder.encode(signed));
    return valid ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Checks ONLY authenticity of the issuer signature. This deliberately does
 * not enforce account binding, expiry, or device identity; the normal
 * verifyLicense function still handles those access-control conditions.
 * An authentic but expired file is NOT a forged signature.
 */
export async function verifyCertificateSignature(token, publicKey) {
  if (typeof token !== 'string' ||
      encoder.encode(token).byteLength > MAX_LICENSE_LENGTH) return null;
  try {
    const certificate = JSON.parse(token);
    if (!certificate || typeof certificate !== 'object' || Array.isArray(certificate) ||
        certificate.format !== VERSION ||
        Object.keys(certificate).sort().join(',') !== 'claims,format,signature' ||
        typeof certificate.signature !== 'string') return null;
    const claims = certificate.claims;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
        Object.keys(claims).sort().join(',') !== 'aud,device,exp,iat,license,sub') return null;
    const signature = decodeBase64Url(certificate.signature);
    if (signature.byteLength !== 64) return null;
    const message = VERSION + '.' + encodeBase64Url(encoder.encode(JSON.stringify(claims)));
    return await crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signature, encoder.encode(message))
      ? claims : null;
  } catch {
    return null;
  }
}
