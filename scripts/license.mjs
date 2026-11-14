import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  ACCOUNT_ID, AUDIENCE, DEVICE_ID, encodeBase64Url, KEY_ALGORITHM, SIGN_ALGORITHM,
  MAX_LICENSE_LENGTH, MAX_LICENSE_TEXT_BYTES, VERSION
} from '../supabase/functions/verify-license/license.mjs';

const { subtle } = webcrypto;

async function main([command, privateKeyPath, account, deviceId, expiry, outputPath, licensePath, ...extra]) {
  if (command === 'keygen' && privateKeyPath && account === undefined) {
    const keys = await subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
    const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', keys.privateKey));
    await writeFile(privateKeyPath, privateKey, { flag: 'wx', mode: 0o600 });
    const publicKey = new Uint8Array(await subtle.exportKey('spki', keys.publicKey));
    console.log(encodeBase64Url(publicKey));
    return;
  }

  if (command !== 'issue' || !privateKeyPath || !account || !deviceId || !expiry || !outputPath || extra.length) {
    throw new Error('Usage: license.mjs keygen <private-key-path>\n       license.mjs issue <private-key-path> <user-uuid> <device-id> <UTC-expiry> <output.certificate> [license.txt]');
  }
  const userId = account.toLowerCase();
  if (!ACCOUNT_ID.test(userId)) throw new Error('Use the account UUID from Supabase Authentication.');
  if (!DEVICE_ID.test(deviceId)) throw new Error('Use the device ID copied from the site.');
  const expires = new Date(expiry);
  const now = Math.floor(Date.now() / 1000);
  const exp = expires.getTime() / 1000;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(expiry) ||
      !Number.isSafeInteger(exp) || exp <= now || expires.toISOString() !== expiry.replace('Z', '.000Z')) {
    throw new Error('Use a future UTC expiry in YYYY-MM-DDTHH:mm:ssZ format.');
  }

  const license = licensePath
    ? (await readFile(licensePath, 'utf8')).replace(/\r\n/g, '\n').trim()
    : 'Personal, non-transferable access for the specified account and ChromeOS browser profile.';
  const encoder = new TextEncoder();
  if (!license || encoder.encode(license).byteLength > MAX_LICENSE_TEXT_BYTES) {
    throw new Error('License text must be nonempty and at most 2048 UTF-8 bytes.');
  }

  const privateKey = await subtle.importKey('pkcs8', await readFile(privateKeyPath), KEY_ALGORITHM, false, ['sign']);
  const claims = { aud: AUDIENCE, sub: userId, device: deviceId, iat: now, exp, license };
  const signed = VERSION + '.' + encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await subtle.sign(SIGN_ALGORITHM, privateKey, encoder.encode(signed)));
  const certificate = JSON.stringify({ format: VERSION, claims, signature: encodeBase64Url(signature) }, null, 2) + '\n';
  if (encoder.encode(certificate).byteLength > MAX_LICENSE_LENGTH) {
    throw new Error('The certificate exceeds the 4096-byte upload limit.');
  }
  await writeFile(outputPath, certificate, { flag: 'wx', mode: 0o600 });
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
