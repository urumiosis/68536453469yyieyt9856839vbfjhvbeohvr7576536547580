import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  KEY_ALGORITHM, SIGN_ALGORITHM, encodeBase64Url, verifyLicense, VERSION
} from '../supabase/functions/_shared/license.mjs';

globalThis.crypto ??= webcrypto;

const server = readFileSync(new URL('../supabase/functions/verify-license/index.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202611150003_certificate_upload_security_events.sql', import.meta.url), 'utf8');

const accountId = '11111111-2222-4333-8444-555555555555';
const alphabetDeviceId = 'A'.repeat(43);
const anotherDeviceId = 'B'.repeat(43);

async function signedCertificate(claimedDevice) {
  const signer = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: 'anti-markaryd.com',
    sub: accountId,
    device: claimedDevice,
    iat: now - 30,
    exp: now + 3600,
    license: 'Original license terms.'
  };
  const payload = VERSION + '.' + encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = encodeBase64Url(new Uint8Array(await webcrypto.subtle.sign(
    SIGN_ALGORITHM, signer.privateKey, new TextEncoder().encode(payload)
  )));
  return { token: JSON.stringify({ format: VERSION, claims, signature }), key: signer.publicKey };
}

test('valid owner signature and matching claimed device succeeds', async () => {
  const { token, key } = await signedCertificate(alphabetDeviceId);
  const verified = await verifyLicense(token, key, accountId);
  assert.equal(verified.device, alphabetDeviceId);
});

test('valid owner signature with different device is authentic but not authorized for this profile', async () => {
  const { token, key } = await signedCertificate(anotherDeviceId);
  const verified = await verifyLicense(token, key, accountId);
  assert.equal(verified.device, anotherDeviceId);
  assert.notEqual(verified.device, alphabetDeviceId);
});

test('an invalid signature plus matching claimed device never becomes trusted', async () => {
  const { token, key } = await signedCertificate(alphabetDeviceId);
  const forged = JSON.parse(token);
  forged.claims.license = 'Modified untrusted license terms.';
  assert.equal(forged.claims.device, alphabetDeviceId);
  assert.equal(await verifyLicense(JSON.stringify(forged), key, accountId), null);
});

test('invalid signature and wrong device is rejected', async () => {
  const { token, key } = await signedCertificate(anotherDeviceId);
  const forged = JSON.parse(token);
  forged.claims.license = 'Modified untrusted license terms.';
  assert.equal(await verifyLicense(JSON.stringify(forged), key, accountId), null);
});

test('verification rejects invalid signature before trusting device and attributes events only to uploader', () => {
  const checkSignature = server.indexOf('const claims = await verifyLicense(');
  const rejectSignature = server.indexOf("if (!claims) {", checkSignature);
  const compareDevice = server.indexOf('if (claims.device !== deviceId)');
  assert.ok(checkSignature >= 0 && rejectSignature > checkSignature && compareDevice > rejectSignature);
  assert.match(server, /recordUploadSecurityEvent\(db, user\.id, claimedDevice/);
  assert.match(server, /recordUploadSecurityEvent\(db, user\.id, 'signed_device_mismatch'\)/);
  assert.match(server, /recordUploadSecurityEvent\(db, user\.id, 'invalid_device_proof'\)/);
  assert.match(server, /error: 'Invalid certificate'/);
  assert.doesNotMatch(server, /auth\.admin\.deleteUser|auth\.admin\.updateUserById|ban_duration|banned_until/);
});

test('security alerts are service-only and do not automatically suspend users', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.certificate_security_events from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.certificate_security_events to service_role/);
  assert.match(migration, /primary key \(account_id, event_type, hour_bucket\)/);
  assert.doesNotMatch(migration, /delete from auth\.users|update auth\.users/);
});

test('frontend displays straightforward errors, not unverifiable permanent-ban claims', () => {
  assert.match(ui, /Ogiltigt certifikat/);
  assert.match(ui, /annan Chrome-profil/);
  assert.doesNotMatch(ui, /permanent bann|permanent avstängd|permanently banned/i);
});
