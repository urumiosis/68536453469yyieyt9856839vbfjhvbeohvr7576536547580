import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  KEY_ALGORITHM, SIGN_ALGORITHM, encodeBase64Url, verifyLicense,
  verifyCertificateSignature, VERSION
} from '../supabase/functions/_shared/license.mjs';

globalThis.crypto ??= webcrypto;

const server = readFileSync(new URL('../supabase/functions/verify-license/index.ts', import.meta.url), 'utf8');
const issuer = readFileSync(new URL('../supabase/functions/issue-license/index.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const migrations = readFileSync(new URL('../supabase/migrations/202611150004_certificate_enforcement_bans.sql', import.meta.url), 'utf8');

const accountId = '11111111-2222-4333-8444-555555555555';
const otherId = '99999999-2222-4333-8444-555555555555';
const firstDevice = 'A'.repeat(43);
const secondDevice = 'B'.repeat(43);

async function makeCertificate(device, { sub = accountId, expired = false } = {}) {
  const pair = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: 'anti-markaryd.com', sub, device,
    iat: now - 7200, exp: expired ? now - 1 : now + 3600,
    license: 'Signed license terms.'
  };
  const payload = VERSION + '.' + encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = encodeBase64Url(new Uint8Array(await webcrypto.subtle.sign(
    SIGN_ALGORITHM, pair.privateKey, new TextEncoder().encode(payload)
  )));
  return { token: JSON.stringify({ format: VERSION, claims, signature }), key: pair.publicKey };
}

test('signed certificate and registered browser matching can verify', async () => {
  const { token, key } = await makeCertificate(firstDevice);
  const claims = await verifyLicense(token, key, accountId);
  assert.equal(claims.device, firstDevice);
  assert.ok(await verifyCertificateSignature(token, key));
});

test('authentic, current-user, different-profile certificate is distinguishable', async () => {
  const { token, key } = await makeCertificate(firstDevice);
  const claims = await verifyLicense(token, key, accountId);
  assert.equal(claims.sub, accountId);
  assert.notEqual(claims.device, secondDevice);
  assert.match(server, /if \(claims.device !== deviceId\) \{/);
  assert.match(server, /certificate_account_bans'\)\.upsert\(/);
  assert.match(server, /code: 'account_permanently_banned'/);
});

test('invalid issuer signature and matching device is NOT enough without device proof', async () => {
  const { token, key } = await makeCertificate(firstDevice);
  const changed = JSON.parse(token);
  changed.claims.license = 'Tampered content';
  const fake = JSON.stringify(changed);
  assert.equal(await verifyLicense(fake, key, accountId), null);
  assert.equal(await verifyCertificateSignature(fake, key), null);

  const challengeIndex = server.indexOf("start_license_device_challenge");
  const proofIndex = server.indexOf("if (!proven)");
  const consumeIndex = server.indexOf("finish_license_device_challenge");
  const banIndex = server.indexOf("certificate_device_bans').upsert");
  assert.ok(challengeIndex >= 0 && proofIndex > challengeIndex &&
    consumeIndex > proofIndex && banIndex > consumeIndex,
    'device is only banned after signing and consuming the challenge');
  assert.match(server, /registered\.data\.device_id === deviceId/);
  assert.match(server, /code: 'device_permanently_banned'/);
});

test('invalid signature and wrong device stays invalid with no account ban', async () => {
  const { token, key } = await makeCertificate(firstDevice);
  const changed = JSON.parse(token);
  changed.claims.license = 'Tampered content';
  assert.equal(await verifyCertificateSignature(JSON.stringify(changed), key), null);
  assert.notEqual(changed.claims.device, secondDevice);
  assert.match(server, /return respond\(403, \{ code: 'invalid_certificate', error: 'Invalid certificate' \}\)/);
});

test('authentic but expired file never qualifies as a FORGED signature', async () => {
  const { token, key } = await makeCertificate(firstDevice, { expired: true });
  assert.equal(await verifyLicense(token, key, accountId), null);
  assert.ok(await verifyCertificateSignature(token, key));
  assert.match(server, /const authenticClaims = await verifyCertificateSignature/);
  assert.match(server, /const sameClaimedDevice = !authenticClaims &&/);
});

test('authentic certificate for a different account cannot ban its subject', async () => {
  const { token, key } = await makeCertificate(firstDevice, { sub: otherId });
  assert.ok(await verifyCertificateSignature(token, key));
  assert.equal(await verifyLicense(token, key, accountId), null);
  assert.match(server, /payload\?\.claims\?\.sub !== accountId/);
  assert.match(server, /verifyLicense\(input.certificate, key, user.id\)/);
});

test('site bans persist server-side and cannot be written by browsers', () => {
  for (const name of ['certificate_account_bans', 'certificate_device_bans']) {
    assert.match(migrations, new RegExp('create table if not exists public\\.' + name));
    assert.match(migrations, new RegExp('alter table public\\.' + name + ' enable row level security'));
    assert.match(migrations, new RegExp('revoke all on table public\\.' + name));
    assert.match(migrations, new RegExp('grant select, insert on table public\\.' + name + ' to service_role'));
    assert.match(issuer, new RegExp("from\\('" + name + "'\\)"));
    assert.match(server, new RegExp("from\\('" + name + "'\\)"));
  }
  assert.doesNotMatch(server, /auth\.admin\.deleteUser/);
});

test('frontend shows the fullscreen wall for confirmed server bans', () => {
  assert.match(ui, /showPermanentBan\(code\)/);
  assert.match(ui, /document\.body\.classList\.add\('permanently-banned'\)/);
  assert.match(ui, /Ditt konto har permanent spärrats från webbplatsen/);
  assert.match(ui, /Chrome-profilens åtkomst till webbplatsen är permanent spärrad/);
  assert.match(ui, /Ogiltigt certifikat/);
});
