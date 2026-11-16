# Anti Markaryd — owner guide (no Codex or terminal)

Supabase project: **Anti Markaryd** (`eqwlikflvpyghkvhsxmz`).
Public site: https://anti-markaryd.com

## What is already installed

- Server-side student email rule: accepts every `e0000@edu.markaryd.se`
  through `e9999@edu.markaryd.se` (case-insensitive). No roster.
- Supabase functions `issue-license` and `verify-license`.
- One-device-per-account challenge and proof of browser-profile key possession.
- Custom, readable, P-256 signed UTF-8 `.certificate` files.
- Service-role-only signing key storage in `public.license_signing_keys`.
  **The key is generated automatically on the first eligible certificate
  request. You don't need to install software or paste private keys.**
- The existing verified Supabase admin account is allowed independently of
  the student email domain. This does *not* allow new public nonstudent signups.
- Private app JavaScript is backed up in
  `app_private.private_app_code_backup_20261115` and integrated to use
  server-verified content, not the former legacy text certificate scheme.
- The second app's code stays in Supabase rather than public GitHub Pages.
- The old third-party JavaScript and third-party service worker were removed
  from the sign-in page for account safety.

## Two essential Dashboard settings to check manually

The connector can't change Supabase Auth configuration toggles.

**1. Restrict sign-up in Supabase Authentication → Hooks**

Open:
https://supabase.com/dashboard/project/eqwlikflvpyghkvhsxmz/auth/hooks

Select **Before User Created** → **Postgres Function** →
`public.hook_restrict_student_signup` → enable and save.

**2. Require verified school email**

Open:
https://supabase.com/dashboard/project/eqwlikflvpyghkvhsxmz/auth/providers

Under **Email**, enable **Confirm Email** and save. Verify that a school
mailbox receives the verification message. In **Authentication → URL
Configuration**, set **Site URL** to `https://anti-markaryd.com` and add
`https://anti-markaryd.com/confirmed.html` to **Redirect URLs** as an exact URL.
The signup page sets `emailRedirectTo` to this confirmation page. Do not set
this callback as the main Site URL. The confirmation page verifies the returned
Supabase session, shows confirmation status, and links to the login page.

**Keep student sign-up disabled until you confirm these settings and test
the site.** The database control is
`public.student_signup_config.enabled = false`.

## How to use the site as the owner

Your Supabase project already has **one verified admin account**.
Use that existing email and password; do not create a new E-number account
for administration.

After switching GitHub Pages from the maintenance branch to `main`, open
https://anti-markaryd.com on a Chromebook and sign in with the existing
administrator account. **For the first login only**, click
**Skapa mitt certifikat**, download `student.certificate` and save it
securely. Select **Välj certifikat** to upload it. At every later login,
upload the same file; no new certificate is made. Administrators are not
required to have a student email address.

Once unlocked, **Ägarpanel** links to the actual Supabase dashboard.
On a different computer, you can manage the Supabase dashboard directly
without accessing the Chromebook-only student site.

In Supabase Dashboard, you can:
- See users: **Authentication → Users**.
- Edit announcements and site text: **Table Editor → public.site_content**
  (row 1, `content` JSON).
- Edit the game catalog: **Table Editor → public.game_catalog**.
- Edit the private JavaScript: **Table Editor → public.private_app_code**
  (row 1, `code`). This powers the games and post-verification dashboard.
- Edit the private HTML and CSS: **Table Editor → public.private_app_assets**
  (row 1, `html` and `css`). These are separate strings and are sent with
  the JS only after a valid certificate and browser-key challenge.
  **Back up each field before editing** and do not place private code in
  a public GitHub file. The `verify-license` Edge Function alone reads them.
- Customize certificate terms: **Edge Functions → Secrets →
  `LICENSE_TEXT`**. Default validity is 90 days; optional secret
  `LICENSE_VALID_DAYS` accepts 1–365.
- Inspect certificate requests: **Edge Functions → issue-license /
  verify-license → Logs**.
- Review automatically blocked site accounts:
  **SQL Editor → `public.certificate_account_bans`**.
- Review permanently blocked registered browser keys:
  **SQL Editor → `public.certificate_device_bans`**.
  These are browser-profile identities, not physical Chromebook serial numbers.
- Suspend a user: **Authentication → Users**.
- Lost/expired certificate or new browser profile: verify account ownership
  and **explicitly reset** the issued binding in `license_devices` as
  described in [LICENSE-SETUP.md](LICENSE-SETUP.md). Never automatically
  issue a replacement just because someone signed in.

**Important certificate policy:** if a student uploads a still-valid,
owner-signed certificate from a different browser profile, the website
permanently blocks that logged-in account. If the owner signature is invalid
but the uploaded device claim matches the registered browser key AND the
user proves possession of that key cryptographically, that key is permanently
blocked. Wrong signature plus wrong device is only rejected as invalid.
**Do not upload an old certificate after changing browser profiles**;
contact the administrator to reset the registered device first. Resetting
does not undo an existing account ban.

**Never** expose a Supabase service-role key or database signing key in
GitHub code or to students.

## Turn student registration on only after testing

In Supabase SQL Editor:
```sql
update public.student_signup_config
set email_domain = 'edu.markaryd.se', enabled = true
where id = 1;
```

Then in **Authentication → General Configuration**, enable
**Allow new users to sign up**, leaving anonymous sign-in disabled.

After that, a student can:
1. Open **Skapa konto** (a separate `signup.html` page).
2. Register with their school email and password.
3. Click the confirmation link in their inbox.
4. Sign in from `index.html` on a Chromebook.
5. **First time only:** choose **Skapa mitt certifikat**, download the
   `.certificate` file and keep it.
6. Select **Välj certifikat** to unlock the site.
7. **Every later login:** upload the *existing* file. There is no
   automatic reissuance and no device-ID copy button.

If a certificate can't be generated, inspect the **issue-license logs**.
The server requires a confirmed eligible email, browser-profile key proof,
and a single registered device. The site checks ChromeOS using browser
metadata and cannot attest physical hardware.

### Emergency pause

To stop new student signups *and certificate requests for non-admin
accounts*, run in Supabase SQL Editor:

```sql
update public.student_signup_config set enabled = false where id = 1;
```

This does not automatically expire previously downloaded private JavaScript.
For strict revocation, suspend the user and manage their active sessions.

### Test coverage and limitations

The PR GitHub Actions suite covers ECDSA certificate tamper resistance,
one-time issuance checks, server-managed signing-key generation/reuse,
and the separate login and signup pages.
It does not simulate the real confirmation email or a student's Chromebook;
those two live checks require actual email and browser access.

The school email pattern plus email confirmation proves mailbox control,
not official school enrollment. The browser-profile identifier is not a
Chromebook serial number or hardware attestation.

## Public GitHub vs private Supabase files

GitHub Pages serves only `index.html` (login, certificate upload shell),
`signup.html`, `app.js` (Auth and proof bootstrap), `signup.js` and the
public `style.css`. The protected **HTML**, **CSS** and **JS** are stored in
Supabase private tables and returned only by `verify-license` after
successful certificate and registered browser-key proof. Do not change the
license check to merely `supabase.auth.getSession()`: password login is
not sufficient to unlock the app.

Privacy limitations: after unlocking, a legitimate user can inspect
the HTML/CSS/JS delivered to their browser. Earlier public repository
commits also remain in GitHub history; moving files does not erase that
history. Keep secrets, signing private keys and administrator credentials
out of all browser-delivered code.
