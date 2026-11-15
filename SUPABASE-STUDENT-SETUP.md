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
Configuration**, set Site URL to `https://anti-markaryd.com` and allow
`https://anti-markaryd.com/**` as a redirect.

**Keep student sign-up disabled until you confirm these settings and test
the site.** The database control is
`public.student_signup_config.enabled = false`.

## How to use the site as the owner

Your Supabase project already has **one verified admin account**.
Use that existing email and password; do not create a new E-number account
for administration.

On a Chromebook, open https://anti-markaryd.com and sign in with the
existing administrator account. The website automatically requests a signed
certificate bound to that Chrome browser profile. Download the
`student.certificate` file and select **Ladda upp** to unlock the app.
It is a certificate format name, not proof your admin must be a student.

Once unlocked, **Ägarpanel** links to the actual Supabase dashboard.
On a different computer, you can manage the Supabase dashboard directly
without accessing the Chromebook-only student site.

In Supabase Dashboard, you can:
- See users: **Authentication → Users**.
- Edit announcements and site text: **Table Editor → public.site_content**
  (row 1, `content` JSON).
- Edit the game catalog: **Table Editor → public.game_catalog**.
- Inspect the private code: **Table Editor → public.private_app_code**.
  Back up and review changes first; don't replace the file with public code.
- Customize certificate terms: **Edge Functions → Secrets →
  `LICENSE_TEXT`**. Default validity is 90 days; optional secret
  `LICENSE_VALID_DAYS` accepts 1–365.
- Inspect certificate requests: **Edge Functions → issue-license /
  verify-license → Logs**.
- Suspend a user: **Authentication → Users**. For device replacement,
  revoke the old binding in `license_devices` via administrator tools
  before they request a new certificate.

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
1. Open the website on a Chromebook.
2. Create an account with any matching school email and password.
3. Click the email verification link.
4. Sign in with the confirmed account.
5. Download their automatically created `.certificate`, then upload it
   through **Ladda upp** and access the application.

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
server-managed signing-key generation/reuse, and public page integration.
It does not simulate the real confirmation email or a student's Chromebook;
those two live checks require actual email and browser access.

The school email pattern plus email confirmation proves mailbox control,
not official school enrollment. The browser-profile identifier is not a
Chromebook serial number or hardware attestation.
