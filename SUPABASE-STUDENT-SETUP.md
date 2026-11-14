# Anti Markaryd — simple Supabase setup

This guide matches the **Anti Markaryd** Supabase project
(`eqwlikflvpyghkvhsxmz`) and GitHub pull request #5.

## Student sign-up rule

**All addresses from `e0000@edu.markaryd.se` through
`e9999@edu.markaryd.se` are eligible**, including uppercase `E`.
There is **no approved-email list** and no need to enter students manually.

An email must match `^e[0-9]{4}@edu[.]markaryd[.]se$` (case-insensitive).
Only students who can receive and confirm email at an eligible address
should be able to access an account. A matching address does not by itself
prove that its owner is a current student; official school SSO or a roster
is needed for stronger enrollment assurance.

## Already completed (November 14, 2026)

In the connected Supabase project:
- `student_signup_config.email_domain` is `edu.markaryd.se`.
- `student_signup_config.enabled` is **false**. Sign-up stays closed until
  the rest of the website is securely deployed.
- The existing `public.hook_restrict_student_signup` function now checks
  just the domain, four-digit username, and enabled flag. It does **not**
  consult `student_approved_emails`.
- The server-side `public.student_email_allowed(text)` check was installed
  for certificate issuance and verification. It also needs **no roster**.

Do not create duplicate student-signup tables or functions. Do not run the
old guide's approved-email insert statements. The updated source of both
checks is `supabase/migrations/202611140001_student_signup_policy.sql`.

## What you still need to do

### 1. Email confirmation and signup hook
In Supabase Dashboard for project `eqwlikflvpyghkvhsxmz`:

1. Go to **Authentication → Hooks → Before User Created**. Choose the
   existing Postgres Function `public.hook_restrict_student_signup`
   and save/enable the hook if it is not already enabled.
2. Go to **Authentication → Providers → Email**. Enable Email with
   **Confirm Email**. Verify that the school mailbox receives messages.
3. In **Authentication → URL Configuration**, set Site URL to
   `https://anti-markaryd.com` and add the redirect
   `https://anti-markaryd.com/**`.
4. **Do not enable public sign-up yet**. Wait until the certificate
   verification steps below work.

### 2. Back up and protect the private JavaScript
Make a database backup, including `public.private_app_code` row 1, and
review the existing Row Level Security policies. **Currently an
authenticated user can SELECT this protected code directly**, so the
certificate gate is not secure until direct client reads are blocked.

The pull request contains
`supabase/migrations/202611110001_require_signed_license.sql` and
`supabase/migrations/202611110002_bind_license_device.sql`.
The first blocks direct reads; the second installs the one-time
browser-key challenge. Review both with the *private*
`install-signed-license.sql` referenced by `LICENSE-SETUP.md`.
That private installer and your second JavaScript layer are stored
separately, not in the public GitHub repository. Do not overwrite them.

### 3. Generate certificate signing keys
On your own trusted computer, check out the PR branch
`codex/owner-signed-licenses`, install Node.js 20+, then run:

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"
node scripts/prepare-license-secrets.mjs \
  "$HOME/anti-markaryd-signing-key.pk8" \
  "$HOME/anti-markaryd-secrets.env"
```

In **Supabase → Edge Functions → Secrets**, enter
`LICENSE_PRIVATE_KEY` and `LICENSE_PUBLIC_KEY` from the local env file.
Never put the private key in GitHub or browser code. Optionally set
`LICENSE_TEXT` (human-readable license terms) and
`LICENSE_VALID_DAYS` (1–365, default 90).

### 4. Deploy Supabase's two Edge Functions
After applying the reviewed device and private-content migrations,
use the Supabase CLI from the PR checkout:

```sh
supabase login
supabase link --project-ref eqwlikflvpyghkvhsxmz
supabase functions deploy issue-license --no-verify-jwt
supabase functions deploy verify-license --no-verify-jwt
```

Both functions still **authenticate the bearer token themselves** using
Supabase Auth. Never remove those checks.

### 5. Turn on student sign-up only when everything is ready
Once the hook, confirmation emails, private-code access rules, and both
functions are deployed and tested, run in Supabase SQL Editor:

```sql
UPDATE public.student_signup_config
SET email_domain = 'edu.markaryd.se', enabled = true
WHERE id = 1;
```

Then in **Authentication → General Configuration**, enable
**Allow new users to sign up**. Leave anonymous sign-in disabled.

### 6. Test, then merge PR #5
Using a real school mailbox:
1. Sign up from Chrome on a Chromebook and click the email confirmation.
2. Sign in. The site asks Supabase for a personalized, signed, UTF-8 JSON
   `.certificate`. The private profile signing key stays in the browser.
3. Read the certificate and license in the website, then download it.
4. Upload the file to verify the signature and unlock the separate private
   JavaScript.
5. Make sure an invalid email, unconfirmed email, copied certificate in a
   different profile, and modified license all fail.

After these live tests succeed, merge PR #5 into `main`.

**Limitations:** a regular website cannot securely prove that a browser
belongs to a physical Chromebook, only inspect spoofable browser platform
information. The downloaded certificate is a readable, signed custom JSON
file—not an X.509 TLS certificate. Do not assume school email formatting
is official proof of current student status.
