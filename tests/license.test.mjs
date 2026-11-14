import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  decodeBase64Url, KEY_ALGORITHM, verifyLicense, VERSION
} from '../supabase/functions/verify-license/license.mjs';

// Node 20 provides Web Crypto; explicitly supply it in test runners that do not.
globalThis.crypto ??= webcrypto;

test('owner-issued UTF-8 certificate verifies and altered claims are rejected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'am-certificate-test-'));
  try {
    const cli = resolve('scripts/license.mjs');
    const keyPath = join(directory, 'owner.pk8');
    const licensePath = join(directory, 'terms.txt');
    const certPath = join(directory, 'member.certificate');
    const userId = '11111111-2222-4333-8444-555555555555';
    const otherUserId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const deviceId = 'A'.repeat(43);
    const licenseText = 'Special access license\nIssued to one browser profile only.\nÅÄÖ';
    writeFileSync(licensePath, licenseText, 'utf8');

    const keygen = spawnSync(process.execPath, [cli, 'keygen', keyPath], { encoding: 'utf8' });
    assert.equal(keygen.status, 0, keygen.stderr);
    const publicKey = await webcrypto.subtle.importKey(
      'spki', decodeBase64Url(keygen.stdout.trim()), KEY_ALGORITHM, false, ['verify']
    );
    const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const issue = spawnSync(process.execPath,
      [cli, 'issue', keyPath, userId, deviceId, expiration, certPath, licensePath],
      { encoding: 'utf8' });
    assert.equal(issue.status, 0, issue.stderr);

    const text = readFileSync(certPath, 'utf8');
    const certificate = JSON.parse(text);
    assert.equal(certificate.format, VERSION);
    assert.equal(certificate.claims.device, deviceId);
    assert.equal(certificate.claims.license, licenseText);
    assert.equal(typeof certificate.signature, 'string');
    assert.deepEqual(await verifyLicense(text, publicKey, userId), certificate.claims);
    assert.equal(await verifyLicense(text, publicKey, otherUserId), null);

    const tampered = JSON.parse(text);
    tampered.claims.license = 'Different license';
    assert.equal(await verifyLicense(JSON.stringify(tampered), publicKey, userId), null);
    tampered.claims.license = licenseText;
    tampered.claims.device = 'B'.repeat(43);
    assert.equal(await verifyLicense(JSON.stringify(tampered), publicKey, userId), null);
    assert.equal(await verifyLicense(text, publicKey, userId, certificate.claims.exp), null);
    assert.deepEqual(await verifyLicense(JSON.stringify(certificate), publicKey, userId),
      certificate.claims, 'Pretty-print changes should not invalidate the signature');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
