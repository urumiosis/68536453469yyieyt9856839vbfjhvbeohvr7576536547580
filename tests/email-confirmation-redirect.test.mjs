import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const signup = read('signup.js');
const signupHtml = read('signup.html');
const confirmed = read('confirmed.html');
const callback = read('confirmed.js');
const guide = read('SUPABASE-STUDENT-SETUP.md');

test('signup confirmation goes to dedicated route, never directly to home', () => {
  assert.match(signup, /emailRedirectTo:\s*new URL\('\.\/confirmed\.html', location\.href\)\.href/);
  assert.doesNotMatch(signup, /emailRedirectTo:\s*new URL\('\.\/', location\.href\)/);
  assert.match(signupHtml, /signup\.js\?v=am10/);
});

test('dedicated confirmation page works without Chromebook-only app bootstrap', () => {
  assert.match(confirmed, /id="confirmation-title"/);
  assert.match(confirmed, /id="confirmation-message"/);
  assert.match(confirmed, /id="confirmation-login"/);
  assert.match(confirmed, /href="\.\/"/);
  assert.match(confirmed, /confirmed\.js\?v=am10/);
  assert.doesNotMatch(confirmed, /app\.js|verify-license|id="cert-file"/);
});

test('callback handles errors and confirms user identity with Supabase', () => {
  assert.match(callback, /query\.has\('error'\)/);
  assert.match(callback, /fragment\.has\('error_code'\)/);
  assert.match(callback, /detectSessionInUrl: true/);
  assert.match(callback, /persistSession: false/);
  assert.match(callback, /supabase\.auth\.getUser\(\)/);
  assert.match(callback, /data\?\.user\?\.email_confirmed_at/);
  assert.match(callback, /Din mejl är bekräftad!/);
});

test('owner guide specifies the exact URL for Supabase Auth allowlist', () => {
  assert.match(guide, /https:\/\/anti-markaryd\.com\/confirmed\.html/);
  assert.match(guide, /\*\*Redirect URLs\*\*/);
});
