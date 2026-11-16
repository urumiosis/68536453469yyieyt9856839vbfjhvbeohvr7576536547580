import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('style.css');
const signup = read('signup.html');
const bootstrap = read('app.js');
const server = read('supabase/functions/verify-license/index.ts');
const migration = read('supabase/migrations/202611160001_private_app_assets_and_strict_access.sql');

test('GitHub Pages holds only login, signup and certificate gate markup', () => {
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="cert-file"/);
  assert.match(html, /id="locked-site" hidden><\/div>/);
  assert.doesNotMatch(html, /id="game-modal"|id="game-cards"|id="games-section"|id="welcome-title"/);
  assert.match(signup, /id="signup-form"/);
});

test('Public stylesheet has login and certificate gate, not game dashboard', () => {
  assert.match(css, /\.auth-shell/);
  assert.match(css, /\.cert-box/);
  assert.doesNotMatch(css, /\.game-card\s*\{|\.game-frame\s*\{|\.proxy-instruction\s*\{|\.hero-banner\s*\{/);
});

test('Private HTML, CSS and JS loaded only after verification function completes', () => {
  assert.match(bootstrap, /typeof app\.html !== 'string'/);
  assert.match(bootstrap, /typeof app\.css !== 'string'/);
  assert.match(bootstrap, /lockedSite\.innerHTML = app\.html/);
  assert.match(bootstrap, /style\.textContent = app\.css/);
  const verified = bootstrap.indexOf('const app = await response.json();');
  const loaded = bootstrap.indexOf('lockedSite.innerHTML = app.html;');
  assert.ok(verified > -1 && loaded > verified);
});

test('Edge function retrieves private assets after browser-key proof', () => {
  const proof = server.indexOf("finish_license_device_challenge");
  const fetchAssets = server.indexOf("db.from('private_app_assets')");
  assert.ok(proof > 0 && fetchAssets > proof);
  assert.match(server, /html: assets\.data\.html/);
  assert.match(server, /css: assets\.data\.css/);
});

test('Anonymous and merely authenticated users have no direct database access', () => {
  assert.match(migration, /revoke all on table public\.private_app_code from PUBLIC, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.private_app_assets from PUBLIC, anon, authenticated/);
  assert.match(migration, /drop policy if exists "Authenticated users can read private app code"/);
  assert.match(migration, /alter table public\.private_app_assets enable row level security/);
});
