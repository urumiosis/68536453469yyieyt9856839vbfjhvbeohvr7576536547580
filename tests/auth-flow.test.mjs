import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const login = read('index.html');
const signup = read('signup.html');
const signupScript = read('signup.js');
const app = read('app.js');
const issuance = read('supabase/functions/issue-license/index.ts');
const sql = read('supabase/migrations/202611150002_one_time_certificate_issuance.sql');
const css = read('style.css');

test('login and signup are separate real HTML pages', () => {
  assert.match(login, /id="login-form"/);
  assert.doesNotMatch(login, /id="signup-form"/);
  assert.match(login, /href="\.\/signup\.html"/);
  assert.match(signup, /id="signup-form"/);
  assert.doesNotMatch(signup, /id="login-form"/);
  assert.match(signup, /href="\.\/"/);
  assert.match(signupScript, /supabase\.auth\.signUp/);
  assert.doesNotMatch(login + signup, /e0000.{0,10}e9999/);
});

test('all visible element IDs are unique on both pages', () => {
  for (const [name, html] of [['login',login],['signup',signup]]) {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, name + ': duplicate DOM IDs');
  }
});

test('no new certificate is issued during sign-in', () => {
  const gate = app.split('function showCertificateGate(user) {')[1].split('function expireAppAt')[0];
  assert.match(gate, /checkFirstCertificateStatus\(user\.id, loginGeneration\)/);
  assert.doesNotMatch(gate, /issueStudentCertificate\(/);
  assert.match(app, /action: 'status'/);
  assert.match(app, /issueFirstCertificateBtn\.addEventListener\('click'/);
  assert.doesNotMatch(app, /copyDeviceId|copy-device-id|auto-certificate-panel/);
  assert.doesNotMatch(login, /id="copy-device-id"|id="auto-certificate"/);
});

test('certificate still requires explicit upload on each login', () => {
  assert.match(login, /id="cert-file"/);
  assert.match(app, /certFileInput\.addEventListener\('change', \(\) => verifyUploadedCertificate\(\)\)/);
  assert.match(app, /privateAppStarted = false;/);
  assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\(['"]cert/);
});

test('backend never mints twice and check is atomic', () => {
  assert.match(issuance, /input\.action === 'status'/);
  assert.match(issuance, /certificate_already_issued/);
  assert.match(issuance, /rpc\('finish_license_initial_issuance'/);
  assert.doesNotMatch(issuance, /rpc\('finish_license_device_challenge'/);
  assert.match(sql, /activated_at is null/);
  assert.match(sql, /grant execute on function public\.finish_license_initial_issuance/);
});

test('subtle motion provides a reduced-motion mode', () => {
  assert.match(css, /@keyframes auth-arrive/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
