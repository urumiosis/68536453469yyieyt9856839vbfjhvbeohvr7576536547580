# Student sign-up, certificate issuance, and Supabase deployment

This is a **deployment checklist**, not a deployed service. The GitHub Pages
frontend is public; the main application code stays in the Supabase private
database and must only be released by the `verify-license` Edge Function.
No private signing key or Supabase service-role key belongs in GitHub Pages.

The website recognizes a ChromeOS browser platform string for its UI gate,
but that is **not hardware attestation** and can be spoofed. The device ID is a
SHA-256 fingerprint of a non-exportable browser-profile public key, not a
Chromebook serial number or an IP address.

## 0. Back up the database, and keep sign-up disabled initially

Open your Supabase project (the frontend uses project ref
`eqwlikflvpyghkvhsxmz`). Check the live schema before running migrations and
back up `public.private_app_code` row 1 and any existing policies. In Supabase
**Authentication → General Configuration**, leave **Allow new users to sign up**
OFF until step 3 is complete. The new policy defaults to DENY: no school domain
is configured in the repository.

Important: PR #5's older `LICENSE-SETUP.md` references a **private
`install-signed-license.sql`** and private application JavaScript supplied
separately. Those bytes are not in this public repository. Obtain/reconcile
that installer before deploying changes to your private application code.
Do not replace or overwrite private row 1 without verifying you have the
correct installer and a backup.

## 1. Apply the student policy SQL

In **Supabase → SQL Editor → New query**, paste and run the complete contents
of `supabase/migrations/202611140001_student_signup_policy.sql`.

In another SQL Editor query, replace the placeholder domain with the **exact
real school email domain**, then run:

```sql
update public.student_registration_config
set email_domain = 'students.example.edu',
    require_allowlist = false
where id = 1;
```

This example is **not** a real school domain. The rule permits only addresses
whose lowercase form is exactly `e` + **four digits** + `@` + the configured
domain: `e1234@students.example.edu` passes, but `e12345@...`,
`teacher@...`, and `e1234@gmail.com` do not.

If you need **only currently authorized members** rather than everyone with a
matching email shape, obtain an authorized roster and enable allowlisting:

```sql
insert into public.student_signup_allowlist(email)
values ('e1234@students.example.edu'), ('e5678@students.example.edu')
on conflict do nothing;

update public.student_registration_config
set require_allowlist = true
where id = 1;
```

Do not put a student roster in the public GitHub repository. Revoking a member
in allowlist mode requires removing their entry and, if applicable, disabling
their Supabase Auth account. In format-only mode, matching addresses are
eligible automatically; **an email pattern cannot independently prove student
status**.

## 2. Enable the *server-side* Before User Created Auth Hook

In **Supabase → Authentication → Hooks → Before User Created**:
- Choose **Postgres Function**.
- Select `public.hook_only_student_signup`.
- Enable and save the hook.

This hook rejects nonmatching email addresses *before* account creation. The
browser-only regex is a convenience, not a security boundary. Review official
documentation: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

## 3. Enable Supabase email sign-up with email confirmation

In **Authentication → Providers → Email**, enable the Email provider and
**Confirm Email**. In **Authentication → General Configuration**, enable
**Allow new users to sign up** *only after the hook and domain are configured*.
Keep anonymous sign-ins disabled. Consider CAPTCHA, rate limits, and a
configured SMTP service before inviting many users.

In **Authentication → URL Configuration**, set Site URL to
`https://anti-markaryd.com`. Add only your actual approved redirect origins
(e.g. `https://anti-markaryd.com/**`). The frontend calls Supabase's
`signUp` method and then asks the student to follow the confirmation email
before logging in. The email confirmation link and redirect must work before
certificates can be issued.

## 4. Set up the owner signing keys **outside Git**

On your trusted local machine, from a checkout of branch
`codex/owner-signed-licenses` (Node.js 20+):

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"
node scripts/prepare-license-secrets.mjs \
  "$HOME/anti-markaryd-signing-key.pk8" \
  "$HOME/anti-markaryd-secrets.env"
```

The second command writes `LICENSE_PRIVATE_KEY` and `LICENSE_PUBLIC_KEY`
to a file outside the repository with restrictive permissions. **Never
commit, publish, upload, or share this file**. Back up the original private
key securely. The same public key must be used by both issuing and verifying
functions. The `LICENSE_TEXT` Edge Function secret can hold your custom
license text (UTF-8, up to 2048 bytes). For example:
`Personal, non-transferable access to the named account and browser profile.`
Set `LICENSE_VALID_DAYS` to a whole number between 1 and 365 if you want
something other than the default 90-day certificate validity. Automatically
issuing a fresh certificate on later sign-ins means **certificate expiration
alone does not revoke membership**. To revoke, disable the account or enforce
an up-to-date membership/allowlist check.

In **Supabase → Edge Functions → Secrets**, set the keys from that local env
file, plus any optional `LICENSE_TEXT`, `LICENSE_VALID_DAYS`, and
`LICENSE_ALLOWED_ORIGINS` values. Alternatively, with the Supabase CLI:

```sh
supabase login
supabase link --project-ref eqwlikflvpyghkvhsxmz
supabase secrets set --env-file "$HOME/anti-markaryd-secrets.env"
```

Use the Secrets dashboard to set `LICENSE_TEXT` if you want to avoid quoting
or shell-escaping multi-line UTF-8 license text.

## 5. Install the device-binding migration and deploy functions

Apply `supabase/migrations/202611110002_bind_license_device.sql` with the SQL
Editor, after reviewing existing schemas and taking backups. This creates
`public.license_devices` and the server-only challenge RPCs used by BOTH
functions. The private-content RLS migration
`supabase/migrations/202611110001_require_signed_license.sql`
is also required for the protected code gate; coordinate it with your private
SQL installer so that the site is never deployed with unprotected private
content.

Deploy the Edge Functions from this branch (CLI uses your linked project):

```sh
supabase functions deploy issue-license --no-verify-jwt
supabase functions deploy verify-license --no-verify-jwt
```

`--no-verify-jwt` **does not disable user authentication in the code**:
both functions explicitly validate the Bearer token with
`supabase.auth.getUser(token)`, and both require the school email to be
confirmed and eligible. Supabase's API gateway may not natively validate
certain newer publishable-key token combinations; the Edge code checks them
itself. Do not remove those checks.

## 6. Verify the first student end to end

1. From Chrome on a Chromebook, sign up with a real, eligible school email.
2. Click the confirmation link delivered to that mailbox; then sign in.
3. The site generates a browser-profile P-256 key in IndexedDB, asks the
   `issue-license` function for a challenge, signs it with the non-exportable
   private key, and receives a **UTF-8 JSON** certificate.
4. Click **Ladda ned mitt certifikat** and save the `student.certificate`
   file. Click **Visa mitt certifikat och licensen** to read its fields and
   custom text directly in the site. The signature covers all claims.
5. Upload the same file via **Ladda upp**. The `verify-license` function
   checks the owner signature, the authenticated account, the profile device
   key, student eligibility, and the one-time challenge. Only then should
   Supabase return the protected JavaScript.
6. Test negative cases: wrong email format, different email domain,
   unconfirmed mailbox, copied certificate in another browser profile,
   altered license text, expired certificate, and revoked member.

For the issuance/verification logic, run `node --test tests/license.test.mjs`
locally before merging. The browser, Supabase SQL, private installer, and
production deployment require separate end-to-end testing.

## Important limitations

- A plain website cannot reliably determine a Chromebook hardware serial
  number. Browser platform checks are spoofable. Strong device proof requires
  managed-device attestation supported by your school or organization.
- Without a verified school domain or authorized student roster, no
  email regex can guarantee that an account is held by a current student.
- The certificates here are custom signed JSON credentials with a
  `.certificate` extension. They are **not X.509 TLS certificates**.
- The PR changes only the public loader, database migrations, and Edge
  Functions in GitHub. It does not deploy to live Supabase or supply the
  separately stored private app JavaScript or SQL installer.
