import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { AUDIENCE, decodeBase64Url, encodeBase64Url, KEY_ALGORITHM,
  MAX_LICENSE_LENGTH, SIGN_ALGORITHM, VERSION } from '../verify-license/license.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const authKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const signingKey = Deno.env.get('LICENSE_SIGNING_PRIVATE_KEY') ?? '';
const allowedOrigins = new Set((Deno.env.get('LICENSE_ALLOWED_ORIGINS') ??
  'https://anti-markaryd.com,https://urumiosis.github.io').split(',').map(x => x.trim()));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const encoder = new TextEncoder();

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  const reply = (status, body) => Response.json(body, { status, headers });
  if (origin) {
    if (!allowedOrigins.has(origin)) return reply(403, { error: 'Origin denied' });
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const jwt = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!jwt) return reply(401, { error: 'Sign in required' });

  try {
    const auth = createClient(url, authKey, options);
    const { data: { user }, error } = await auth.auth.getUser(jwt);
    if (error || !user || !user.email_confirmed_at || !user.email) {
      return reply(403, { error: 'Verified school email required' });
    }

    const email = user.email.toLowerCase();
    if (!/^e[0-9]{4}@[a-z0-9.-]+$/.test(email)) return reply(403, { error: 'Student email required' });

    const db = createClient(url, serviceKey, options);
    const { data: config, error: configError } = await db.from('student_signup_config')
      .select('email_domain,enabled').eq('id', 1).single();
    if (configError || !config?.enabled ||
        email.split('@')[1] !== config.email_domain) {
      return reply(403, { error: 'Student enrollment unavailable' });
    }
    const { data: approved, error: approvedError } = await db.from('student_approved_emails')
      .select('active').eq('email', email).maybeSingle();
    if (approvedError || !approved?.active) return reply(403, { error: 'Student enrollment unavailable' });

    const body = await request.text();
    if (encoder.encode(body).byteLength > 1024) return reply(400, { error: 'Invalid request size' });
    const input = JSON.parse(body);
    if (!input || typeof input.deviceKey !== 'string' || input.deviceKey.length !== 87) {
      return reply(400, { error: 'Device public key required' });
    }
    const raw = decodeBase64Url(input.deviceKey);
    if (raw.length !== 65 || raw[0] !== 4) return reply(400, { error: 'Invalid device public key' });
    await crypto.subtle.importKey('raw', raw, KEY_ALGORITHM, false, ['verify']);
    const device = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)));
    const { data: pinned, error: pinError } = await db.from('license_devices')
      .select('device_id,activated_at').eq('user_id', user.id).maybeSingle();
    if (pinError || (pinned?.activated_at && pinned.device_id !== device)) {
      return reply(409, { error: 'Account already registered to another browser profile' });
    }

    const privateKey = await crypto.subtle.importKey(
      'pkcs8', decodeBase64Url(signingKey.trim()), KEY_ALGORITHM, false, ['sign']
    );
    const now = Math.floor(Date.now() / 1000);
    const license = 'Personal, non-transferable student access for the approved account and registered ChromeOS browser profile.';
    const claims = { aud: AUDIENCE, sub: user.id, device, iat: now, exp: now + 30 * 24 * 3600, license };
    const signed = VERSION + '.' + encodeBase64Url(encoder.encode(JSON.stringify(claims)));
    const signature = encodeBase64Url(new Uint8Array(
      await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, encoder.encode(signed))
    ));
    const certificate = JSON.stringify({ format: VERSION, claims, signature }, null, 2) + '\n';
    if (encoder.encode(certificate).byteLength > MAX_LICENSE_LENGTH) {
      throw new Error('Certificate limit exceeded');
    }
    return reply(200, { certificate });
  } catch (error) {
    console.error('Student certificate issuance failed:', error);
    return reply(503, { error: 'Certificate issuer unavailable' });
  }
});
