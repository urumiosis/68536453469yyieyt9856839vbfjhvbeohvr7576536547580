import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('style.css');
const app = read('app.js');
const signup = read('signup.js');
const sql = read('supabase/migrations/202611160002_signup_error_messages.sql');
const issuer = read('supabase/functions/issue-license/index.ts');

test('signup messages are friendly, policy stays on the server', () => {
  assert.match(sql, /address ~ '\^e\[0-9\]\{4\}@edu\[\.\]markaryd\[\.\]se\$'/);
  assert.match(sql, /Registreringen är tillfälligt stängd/);
  assert.match(sql, /Använd din skolmejl för att skapa konto/);
  assert.doesNotMatch(signup, /e0000|e9999|e\[0-9\]/i);
  assert.match(signup, /Registreringen kunde inte slutföras/);
});

test('ban wall is a distinct accessible full-screen section with caution icon', () => {
  assert.match(html, /id="ban-screen"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<svg[^>]*viewBox="0 0 128 128"/);
  assert.match(html, /PERMANENT AVSTÄNGD/);
  assert.match(css, /body\.permanently-banned > :not\(#ban-screen\) \{ display: none !important/);
  assert.match(css, /\.ban-screen \{[\s\S]*position: fixed/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate public element ids');
});

test('ban walls appear only for explicit server-confirmed ban codes', () => {
  assert.match(app, /function showPermanentBan\(code\)/);
  assert.match(app, /document\.body\.classList\.add\('permanently-banned'\)/);
  const calls = [...app.matchAll(/showPermanentBan\(code\)/g)];
  assert.equal(calls.length, 3, 'function definition + issue and verify error paths');
  assert.match(app, /code === 'account_permanently_banned'/);
  assert.match(app, /code === 'device_permanently_banned'/);
  assert.match(app, /if \(document\.body\.classList\.contains\('permanently-banned'\)\) return/);
});

test('signin device status consults server before certificate gate can be used', () => {
  assert.match(app, /action: 'status', deviceKey: device\.publicKey/);
  const deviceCheck = issuer.indexOf("if (deviceBan.data)");
  const status = issuer.indexOf("if (input.action === 'status')");
  assert.ok(deviceCheck >= 0 && status > deviceCheck, 'status checks banned registered browser key');
  assert.match(issuer, /certificate_account_bans/);
  assert.match(issuer, /certificate_device_bans/);
  assert.match(issuer, /issued: !!existing\.data\?\.activated_at/);
  assert.doesNotMatch(app, /issueStudentCertificate\(user\.id, loginGeneration\)/);
});
