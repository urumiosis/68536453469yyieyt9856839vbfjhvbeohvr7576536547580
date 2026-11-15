// A service-role-only, server-managed P-256 certificate signing key.
// Generated on the first eligible issuance and persisted in a table that
// has RLS enabled, no anon/authenticated privileges, and no user-facing API.
import { encodeBase64Url, KEY_ALGORITHM } from './license.mjs';

export async function getOwnerSigningKeys(db, createIfMissing = false) {
  const read = () => db.from('license_signing_keys')
    .select('private_key,public_key').eq('id', 1).maybeSingle();
  let { data, error } = await read();
  if (error) throw error;
  if (!data && createIfMissing) {
    const pair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
    const [privateBytes, publicBytes] = await Promise.all([
      crypto.subtle.exportKey('pkcs8', pair.privateKey),
      crypto.subtle.exportKey('spki', pair.publicKey)
    ]);
    const inserted = await db.from('license_signing_keys').insert({
      id: 1,
      private_key: encodeBase64Url(new Uint8Array(privateBytes)),
      public_key: encodeBase64Url(new Uint8Array(publicBytes))
    });
    // Concurrent first enrollment may already have committed the key.
    if (inserted.error && inserted.error.code !== '23505') throw inserted.error;
    const refreshed = await read();
    if (refreshed.error) throw refreshed.error;
    data = refreshed.data;
  }
  if (!data || !data.private_key || !data.public_key) {
    throw new Error('Owner certificate signing key has not been initialized');
  }
  return { privateKey: data.private_key, publicKey: data.public_key };
}
