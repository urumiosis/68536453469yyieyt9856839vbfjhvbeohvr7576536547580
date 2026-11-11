import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodeBase64Url, encodeBase64Url, KEY_ALGORITHM, MAX_LICENSE_LENGTH, SIGN_ALGORITHM, verifyLicense } from './license.mjs';

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
    const key = await crypto.subtle.importKey('spki', decodeBase64Url(publicKey.trim()), KEY_ALGORITHM, false, ['verify']);
    const input = await readRequest(request).catch(() => null);
    if (input?.action !== 'start' && input?.action !== 'finish') {
      return respond(400, { error: 'Invalid verification request' });
    }
    const claims = await verifyLicense(input.certificate, key, user.id);
    if (!claims) return respond(403, { error: 'Invalid or expired certificate' });

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

    if (claims.device !== deviceId) return respond(409, { code: 'device_mismatch' });

    const db = createClient(url, serviceKey, clientOptions);
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
    if (!validProof) return respond(409, { code: 'device_retry' });

    const consumed = await db.rpc('finish_license_device_challenge', { ...device, nonce: challenge });
    if (consumed.error) throw consumed.error;
    if (!consumed.data) return respond(409, { code: 'device_retry' });

    const [app, content, games, profile] = await Promise.all([
      db.from('private_app_code').select('code').eq('id', 1).single(),
      db.from('site_content').select('content').eq('id', 1).maybeSingle(),
      db.from('game_catalog').select('id,title,description,emoji,launch_url')
        .eq('enabled', true).order('sort_order', { ascending: true }),
      db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
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
      expiresInMs
    });
  } catch (error) {
    console.error('License verification failed:', error);
    return respond(503, { error: 'Certificate verification unavailable' });
  }
});
