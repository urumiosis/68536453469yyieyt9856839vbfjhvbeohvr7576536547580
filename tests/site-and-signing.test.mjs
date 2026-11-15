import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getOwnerSigningKeys } from '../supabase/functions/_shared/signing-keys.mjs';
import { decodeBase64Url, KEY_ALGORITHM, SIGN_ALGORITHM } from '../supabase/functions/_shared/license.mjs';

globalThis.crypto ??= webcrypto;

test('server-owned signing key is generated once and reused', async () => {
  let stored = null;
  const db = {
    from(table) {
      assert.equal(table, 'license_signing_keys');
      return {
        select(columns) {
          assert.equal(columns, 'private_key,public_key');
          return {
            eq(field, value) {
              assert.equal(field, 'id');
              assert.equal(value, 1);
              return { maybeSingle: async () => ({ data: stored, error: null }) };
            }
          };
        },
        async insert(record) {
          assert.equal(record.id, 1);
          stored = record;
          return { error: null };
        }
      };
    }
  };
  await assert.rejects(getOwnerSigningKeys(db), /not been initialized/);
  const keys = await getOwnerSigningKeys(db, true);
  assert.equal(keys.privateKey, stored.private_key);
  assert.equal(keys.publicKey, stored.public_key);
  assert.deepEqual(await getOwnerSigningKeys(db), keys);
  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8', decodeBase64Url(keys.privateKey), KEY_ALGORITHM, false, ['sign']
  );
  const publicKey = await webcrypto.subtle.importKey(
    'spki', decodeBase64Url(keys.publicKey), KEY_ALGORITHM, false, ['verify']
  );
  const message = new TextEncoder().encode('certificate signing test');
  const signature = await webcrypto.subtle.sign(SIGN_ALGORITHM, privateKey, message);
  assert.equal(await webcrypto.subtle.verify(SIGN_ALGORITHM, publicKey, signature, message), true);
});

test('GitHub Pages certificate UI uses a single supported endpoint and unique IDs', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = readFileSync('app.js', 'utf8');
  assert.equal((html.match(/id="issue-first-certificate"/g) || []).length, 1);
  assert.equal((html.match(/id="first-time-certificate"/g) || []).length, 1);
  assert.equal((html.match(/id="certificate-issuance"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="copy-device-id"/);
  assert.match(script, /\/functions\/v1\/issue-license/);
  assert.match(script, /\/functions\/v1\/verify-license/);
  assert.doesNotMatch(script, /\/functions\/v1\/issue-student-certificate/);
  assert.doesNotMatch(html, /vignette\.min\.js/);
  assert.doesNotMatch(html, /anti-adblock\.js/);
});
