// One-time owner-signed issuance after verified email and device-key proof.
// A PKCS#8 signing key is either in an owner-provided Edge secret or in a service-role-only Supabase table.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  AUDIENCE, decodeBase64Url, DEVICE_ID, encodeBase64Url, KEY_ALGORITHM,
  MAX_LICENSE_LENGTH, MAX_LICENSE_TEXT_BYTES, SIGN_ALGORITHM, VERSION
} from '../_shared/license.mjs';
import { getOwnerSigningKeys } from '../_shared/signing-keys.mjs';

const origins = new Set((Deno.env.get('LICENSE_ALLOWED_ORIGINS') ??
  'https://anti-markaryd.com,https://urumiosis.github.io').split(',').map(value => value.trim()));
const url = Deno.env.get('SUPABASE_URL') ?? '';
const authKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const privateKeyBytes = Deno.env.get('LICENSE_PRIVATE_KEY')?.trim() ?? '';
const configuredLicenseText = Deno.env.get('LICENSE_TEXT') ??
  'Personal, non-transferable access for the named account and registered ChromeOS browser profile.';
const configuredValidity = Number(Deno.env.get('LICENSE_VALID_DAYS') ?? '90');
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const encoder = new TextEncoder();

async function readBody(request: Request): Promise<any> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      count += value.length;
      if (count > 2048) return null;
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    if (count > 2048) await reader.cancel();
    reader.releaseLock();
  }
}

Deno.serve(async request => {
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
    const { data: { user }, error: userError } = await auth.auth.getUser(jwt);
    if (userError || !user) return respond(401, { error: 'Sign in required' });
    if (!user.email || !user.email_confirmed_at) {
      return respond(403, { error: 'Confirm your school email first' });
    }

    const db = createClient(url, serviceKey, clientOptions);
    const accountBan = await db.from('certificate_account_bans')
      .select('user_id').eq('user_id', user.id).maybeSingle();
    if (accountBan.error) throw accountBan.error;
    if (accountBan.data) return respond(403, {
      code: 'account_permanently_banned', error: 'Account permanently banned'
    });
    const eligibility = await db.rpc('license_account_allowed', { p_user_id: user.id, p_email: user.email });
    if (eligibility.error) throw eligibility.error;
    if (eligibility.data !== true) return respond(403, { error: 'Account not eligible' });
    if (!Number.isSafeInteger(configuredValidity) || configuredValidity < 1 || configuredValidity > 365 ||
        !configuredLicenseText.trim() ||
        encoder.encode(configuredLicenseText).byteLength > MAX_LICENSE_TEXT_BYTES) {
      throw new Error('Invalid license configuration');
    }

    const input = await readBody(request).catch(() => null);
    if (input?.action !== 'status' && input?.action !== 'start' && input?.action !== 'finish') {
      return respond(400, { error: 'Invalid enrollment request' });
    }

    // Status is read-only. Existing certificates may be uploaded on every login,
    // but the account may not mint another certificate without owner approval.
    const existing = await db.from('license_devices')
      .select('activated_at').eq('user_id', user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (input.action !== 'status' && existing.data?.activated_at) {
      return respond(409, { code: 'certificate_already_issued' });
    }

    let deviceId: string;
    let deviceKey: CryptoKey;
    try {
      if (typeof input.deviceKey !== 'string' || input.deviceKey.length !== 87) throw new Error('Invalid key');
      const raw = decodeBase64Url(input.deviceKey);
      if (raw.length !== 65 || raw[0] !== 4) throw new Error('Invalid key');
      deviceId = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)));
      if (!DEVICE_ID.test(deviceId)) throw new Error('Invalid device identifier');
      deviceKey = await crypto.subtle.importKey('raw', raw, KEY_ALGORITHM, false, ['verify']);
    } catch {
      return respond(400, { error: 'Invalid device key' });
    }

    const deviceBan = await db.from('certificate_device_bans')
      .select('device_id').eq('device_id', deviceId).maybeSingle();
    if (deviceBan.error) throw deviceBan.error;
    if (deviceBan.data) return respond(403, {
      code: 'device_permanently_banned', error: 'You have been permanently banned'
    });

    // Status must check the registered browser key for a permanent ban,
    // but never issues a certificate or registers a new browser profile.
    if (input.action === 'status') {
      return respond(200, { issued: !!existing.data?.activated_at });
    }

    // Use the owner's explicit secret key when configured, otherwise generate
    // and store a service-role-only signing key at first explicit issuance.
    const signingMaterial = privateKeyBytes || (await getOwnerSigningKeys(db, true)).privateKey;
    const signer = await crypto.subtle.importKey(
      'pkcs8', decodeBase64Url(signingMaterial), KEY_ALGORITHM, false, ['sign']
    );

    const device = { account_id: user.id, requested_device_id: deviceId };
    if (input.action === 'start') {
      const challenge = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const started = await db.rpc('start_license_device_challenge', { ...device, nonce: challenge });
      if (started.error) throw started.error;
      if (!started.data) return respond(409, { error: 'Device is already bound to another profile' });
      return respond(200, { challenge });
    }

    const { challenge, signature } = input;
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
        typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      return respond(400, { error: 'Invalid enrollment proof' });
    }
    const proof = encoder.encode(`anti-markaryd-enrollment-v1\n${user.id}\n${challenge}\n${input.deviceKey}`);
    let valid = false;
    try {
      valid = await crypto.subtle.verify(SIGN_ALGORITHM, deviceKey, decodeBase64Url(signature), proof);
    } catch {
      return respond(400, { error: 'Invalid enrollment signature' });
    }
    if (!valid) return respond(403, { error: 'Invalid enrollment signature' });
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      aud: AUDIENCE, sub: user.id, device: deviceId,
      iat: now, exp: now + configuredValidity * 86400, license: configuredLicenseText
    };
    const payload = VERSION + '.' + encodeBase64Url(encoder.encode(JSON.stringify(claims)));
    const ownerSignature = new Uint8Array(await crypto.subtle.sign(
      SIGN_ALGORITHM, signer, encoder.encode(payload)
    ));
    const certificate = JSON.stringify({
      format: VERSION, claims, signature: encodeBase64Url(ownerSignature)
    }, null, 2) + '\n';
    if (encoder.encode(certificate).byteLength > MAX_LICENSE_LENGTH) {
      throw new Error('Certificate too large');
    }

    // Atomic compare-and-set; even two simultaneous requests cannot issue twice.
    const consumed = await db.rpc('finish_license_initial_issuance', {
      ...device, nonce: challenge
    });
    if (consumed.error) throw consumed.error;
    if (!consumed.data) {
      const latest = await db.from('license_devices').select('activated_at')
        .eq('user_id', user.id).maybeSingle();
      if (latest.error) throw latest.error;
      return latest.data?.activated_at
        ? respond(409, { code: 'certificate_already_issued' })
        : respond(409, { error: 'Expired or reused challenge' });
    }
    return respond(200, { certificate });
  } catch (error) {
    console.error('Enrollment unavailable:', error);
    return respond(503, { error: 'Enrollment temporarily unavailable' });
  }
});
