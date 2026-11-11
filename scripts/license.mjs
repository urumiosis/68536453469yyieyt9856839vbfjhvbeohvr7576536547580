import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  ACCOUNT_ID, AUDIENCE, encodeBase64Url, KEY_ALGORITHM, SIGN_ALGORITHM, VERSION
} from '../supabase/functions/verify-license/license.mjs';

const { subtle } = webcrypto;

async function main([command, privateKeyPath, account, expiry, outputPath, ...extra]) {
  if (command === 'keygen' && privateKeyPath && account === undefined) {
    const keys = await subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
    const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', keys.privateKey));
    await writeFile(privateKeyPath, privateKey, { flag: 'wx', mode: 0o600 });
    const publicKey = new Uint8Array(await subtle.exportKey('spki', keys.publicKey));
    console.log(encodeBase64Url(publicKey));
    return;
  }

  if (command !== 'issue' || !privateKeyPath || !outputPath || extra.length) {
    throw new Error('Usage: license.mjs keygen <private-key-path>\n       license.mjs issue <private-key-path> <user-uuid> <UTC-expiry> <output.certificate>');
  }
  const userId = account.toLowerCase();
  if (!ACCOUNT_ID.test(userId)) throw new Error('Use the account UUID from Supabase Authentication.');
  const expires = new Date(expiry);
  const now = Math.floor(Date.now() / 1000);
  const exp = expires.getTime() / 1000;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(expiry) ||
      !Number.isSafeInteger(exp) || exp <= now || expires.toISOString() !== expiry.replace('Z', '.000Z')) {
    throw new Error('Use a future UTC expiry in YYYY-MM-DDTHH:mm:ssZ format.');
  }

  const privateKey = await subtle.importKey('pkcs8', await readFile(privateKeyPath), KEY_ALGORITHM, false, ['sign']);
  const encoder = new TextEncoder();
  const claims = { aud: AUDIENCE, sub: userId, iat: now, exp };
  const signed = `${VERSION}.${encodeBase64Url(encoder.encode(JSON.stringify(claims)))}`;
  const signature = new Uint8Array(await subtle.sign(SIGN_ALGORITHM, privateKey, encoder.encode(signed)));
  await writeFile(outputPath, `${signed}.${encodeBase64Url(signature)}\n`, { flag: 'wx', mode: 0o600 });
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
