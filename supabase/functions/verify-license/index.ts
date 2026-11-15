import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodeBase64Url, encodeBase64Url, DEVICE_ID, KEY_ALGORITHM, MAX_LICENSE_LENGTH, SIGN_ALGORITHM, verifyLicense } from '../_shared/license.mjs';
import { getOwnerSigningKeys } from '../_shared/signing-keys.mjs';

const origins = new Set((Deno.env.get('LICENSE_ALLOWED_ORIGINS') ??
  'https://anti-markaryd.com,https://urumiosis.github.io').split(',').map(origin => origin.trim()));
const url = Deno.env.get('SUPABASE_URL') ?? '';
const authKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const publicKey = Deno.env.get('LICENSE_PUBLIC_KEY') ?? '';
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const MAX_REQUEST_BYTES = MAX_LICENSE_LENGTH + 2048;
const encoder = new TextEncoder();

async function readRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) return null;
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    if (size > MAX_REQUEST_BYTES) await reader.cancel();
    reader.releaseLock();
  }
}


/**
 * Record a signal about the authenticated uploader, never about the account
 * named by an unverified certificate. Deduplicate by hour to avoid a row flood.
 * Logging must never grant access or make an invalid certificate valid.
 */
async function recordUploadSecurityEvent(db, accountId, eventType) {
  console.warn('Certificate upload rejected', { eventType, accountId });
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 3600000) * 3600000).toISOString();
  try {
    const { error } = await db.from('certificate_security_events').upsert({
      account_id: accountId,
      event_type: eventType,
      hour_bucket: windowStart,
      last_seen_at: new Date(now).toISOString()
    }, { onConflict: 'account_id,event_type,hour_bucket' });
    if (error) console.error('Certificate audit unavailable', { code: error.code });
  } catch {
    console.error('Certificate audit temporarily unavailable');
  }
}

/**
 * A self-claimed ID in an INVALID certificate is untrusted. Comparing it to
 * the submitted public key only supports a low-confidence audit category;
 * it cannot authorize a device ban or establish real hardware identity.
 */
async function claimsDeviceFromUnverifiedCertificate(certificate, deviceKey) {
  try {
    if (typeof certificate !== 'string' || typeof deviceKey !== 'string') return false;
    const claimed = JSON.parse(certificate)?.claims?.device;
    if (typeof claimed !== 'string' || !DEVICE_ID.test(claimed)) return false;
    const raw = decodeBase64Url(deviceKey);
    if (raw.length !== 65 || raw[0] !== 4) return false;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
    return claimed === encodeBase64Url(hash);
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  const respond = (status: number, body: object) => Response.json(body, { status, headers });
  if (origin) {
    if (!origins.has(origin)) return respond(403, { error: 'Origin denied' });
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!jwt) return respond(401, { error: 'Sign in required' });

  try {
    const auth = createClient(url, authKey, clientOptions);
    const { data: { user }, error } = await auth.auth.getUser(jwt);
    if (error || !user) return respond(401, { error: 'Sign in required' });
    if (!user.email || !user.email_confirmed_at) {
      return respond(403, { error: 'Confirm your school email first' });
    }
    const db = createClient(url, serviceKey, clientOptions);
    const eligibility = await db.rpc('license_account_allowed', { p_user_id: user.id, p_email: user.email });
    if (eligibility.error) throw eligibility.error;
    if (eligibility.data !== true) {
      return respond(403, { error: 'Account not eligible' });
    }
    const signingMaterial = publicKey.trim() || (await getOwnerSigningKeys(db)).publicKey;
    const key = await crypto.subtle.importKey('spki', decodeBase64Url(signingMaterial), KEY_ALGORITHM, false, ['verify']);
    const input = await readRequest(request).catch(() => null);
    if (input?.action !== 'start' && input?.action !== 'finish') {
      return respond(400, { error: 'Invalid verification request' });
    }
    // Verify the owner's signature and matching authenticated account FIRST.
    // Never trust a claimed device ID to ban or delete a user before this check.
    const claims = await verifyLicense(input.certificate, key, user.id);
    if (!claims) {
      const claimedDevice = await claimsDeviceFromUnverifiedCertificate(
        input.certificate, input.deviceKey
      );
      await recordUploadSecurityEvent(db, user.id, claimedDevice
        ? 'untrusted_matching_device_claim'
        : 'invalid_certificate');
      return respond(403, { code: 'invalid_certificate', error: 'Invalid certificate' });
    }

    let deviceKey: CryptoKey;
    let deviceId: string;
    try {
      if (typeof input.deviceKey !== 'string' || input.deviceKey.length !== 87) {
        throw new Error('Invalid device key');
      }
      const raw = decodeBase64Url(input.deviceKey);
      if (raw.length !== 65 || raw[0] !== 4) throw new Error('Invalid device key');
      deviceId = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)));
      deviceKey = await crypto.subtle.importKey('raw', raw, KEY_ALGORITHM, false, ['verify']);
    } catch {
      return respond(400, { error: 'Invalid device key' });
    }

    if (claims.device !== deviceId) {
      // A valid signature proves the certificate is authentic, NOT that it
      // was stolen. A changed browser profile is also a legitimate explanation.
      // Log the authenticated uploader for manual review; do not ban anybody.
      await recordUploadSecurityEvent(db, user.id, 'signed_device_mismatch');
      return respond(409, { code: 'device_mismatch' });
    }

    const device = { account_id: user.id, requested_device_id: deviceId };
    if (input.action === 'start') {
      const challenge = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const { data, error } = await db.rpc('start_license_device_challenge', { ...device, nonce: challenge });
      if (error) throw error;
      if (!data) return respond(409, { code: 'device_mismatch' });
      return respond(200, { challenge });
    }

    const { challenge, signature } = input;
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
        typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      return respond(400, { error: 'Invalid device proof' });
    }
    const proof = encoder.encode(`anti-markaryd-device-v1\n${user.id}\n${challenge}\n${input.certificate.trim()}`);
    let validProof = false;
    try {
      validProof = await crypto.subtle.verify(SIGN_ALGORITHM, deviceKey, decodeBase64Url(signature), proof);
    } catch {
      return respond(400, { error: 'Invalid device proof' });
    }
    if (!validProof) {
      await recordUploadSecurityEvent(db, user.id, 'invalid_device_proof');
      return respond(409, { code: 'device_retry' });
    }

    const consumed = await db.rpc('finish_license_device_challenge', { ...device, nonce: challenge });
    if (consumed.error) throw consumed.error;
    if (!consumed.data) return respond(409, { code: 'device_retry' });

    const [app, content, games, profile] = await Promise.all([
      db.from('private_app_code').select('code').eq('id', 1).single(),
      db.from('site_content').select('content').eq('id', 1).maybeSingle(),
      db.from('game_catalog').select('id,title,description,emoji,launch_url')
        .eq('enabled', true).order('sort_order', { ascending: true }),
      db.from('profiles').select('full_name,role').eq('id', user.id).maybeSingle()
    ]);
    if (app.error || typeof app.data?.code !== 'string' || !app.data.code ||
        content.error || games.error || profile.error) {
      throw new Error('Could not load licensed content');
    }
    const expiresInMs = claims.exp * 1000 - Date.now();
    if (expiresInMs <= 0) return respond(403, { error: 'Invalid or expired certificate' });
    return respond(200, {
      code: app.data.code,
      content: content.data?.content ?? {},
      games: games.data,
      fullName: profile.data?.full_name ?? null,
      isOwner: profile.data?.role === 'admin',
      expiresInMs
    });
  } catch (error) {
    console.error('License verification failed:', error);
    return respond(503, { error: 'Certificate verification unavailable' });
  }
});
