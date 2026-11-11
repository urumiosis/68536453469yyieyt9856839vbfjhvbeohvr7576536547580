import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodeBase64Url, KEY_ALGORITHM, MAX_LICENSE_LENGTH, verifyLicense } from './license.mjs';

const origins = new Set((Deno.env.get('LICENSE_ALLOWED_ORIGINS') ??
  'https://anti-markaryd.com,https://urumiosis.github.io').split(',').map(origin => origin.trim()));
const url = Deno.env.get('SUPABASE_URL') ?? '';
const authKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const publicKey = Deno.env.get('LICENSE_PUBLIC_KEY') ?? '';
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

async function readLicense(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let token = '';
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return token + decoder.decode();
      size += value.byteLength;
      if (size > MAX_LICENSE_LENGTH) return null;
      token += decoder.decode(value, { stream: true });
    }
  } finally {
    if (size > MAX_LICENSE_LENGTH) await reader.cancel();
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
    const license = await readLicense(request).catch(() => null);
    const claims = await verifyLicense(license, key, user.id);
    if (!claims) return respond(403, { error: 'Invalid or expired certificate' });

    const db = createClient(url, serviceKey, clientOptions);
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
