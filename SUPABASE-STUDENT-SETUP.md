# Anti Markaryd: Exact student email + certificate setup

This guide is based on the **existing live Supabase project**, inspected on
2026-11-14: `Anti Markaryd` / `eqwlikflvpyghkvhsxmz`. It prepares ordinary
student membership access for authorized use, and does not conceal a site from
school administrators or change any school-managed access rules.

**No Supabase database changes or Edge Function deployments were performed
automatically.** PR #5 remains unmerged.

## Student account format

```text
e####@edu.markaryd.se
```

The local part is `e` followed by **exactly four digits**; the domain is
**exactly** `edu.markaryd.se`. Matching is case-insensitive. Examples:
`e1234@edu.markaryd.se` passes the pattern, `e12345@edu.markaryd.se`,
`e1234@gmail.com`, and `teacher@edu.markaryd.se` do not.

**An email format is not identity verification.** Enable email confirmation
so a person must have access to that actual school mailbox. The live database
is additionally configured for an **approved roster**; only actively approved
addresses can register or receive certificates. Maintain it with appropriate
authorization. If the school offers official student SSO, that is better
assurance than a regex.

## What is already installed in Supabase

The live database already has:
- `public.student_signup_config (id, email_domain, enabled)`
- `public.student_approved_emails (email, active, approved_at)`
- `public.hook_restrict_student_signup(event jsonb)`

At inspection time, configuration row 1 had `email_domain = NULL` and
`enabled = false`; the approved roster was empty. The existing hook checks
the exact student pattern, domain, enabled flag, and active roster entry.
**Do not install the earlier duplicate `student_registration_config`,
`student_signup_allowlist`, or `hook_only_student_signup` approach.**

No Edge Functions or `public.license_devices` table were deployed yet.
The present `public.private_app_code` policy permits direct SELECT by any
authenticated account, so it needs to be restricted before you claim the
protected second JavaScript layer is certificate-gated.

## Step 1 — Back up and check existing data

Open https://supabase.com/dashboard/project/eqwlikflvpyghkvhsxmz.
Take an appropriate database backup first; especially preserve the private
`public.private_app_code` content and policies. Check that you have the
private SQL installer mentioned in `LICENSE-SETUP.md`. **Do not overwrite
private app code with an incomplete copy.**

Leave **Allow new users to sign up** disabled in Auth until all below checks
are complete.

## Step 2 — Set the exact domain, initially disabled

Open **SQL Editor** and execute:

```sql
update public.student_signup_config
set email_domain = 'edu.markaryd.se',
    enabled = false
where id = 1;

select id, email_domain, enabled
from public.student_signup_config
where id = 1;
```

The SELECT must show the exact domain and `false`. This sets up the expected
domain without opening registration.

## Step 3 — Add authorized student addresses to your existing roster

Only add addresses you have permission to approve. For each *real, confirmed*
member, replace the example below with their exact email:

```sql
insert into public.student_approved_emails (email, active)
values ('e1234@edu.markaryd.se', true)
on conflict (email)
do update set active = excluded.active;
```

That is a **placeholder**, not an actual approved account.

To review the roster without disclosing email addresses, run:

```sql
select count(*) as approved_students
from public.student_approved_emails where active;
```

This project is currently **roster-first**. Leaving the list empty means no
one can sign up even when their email matches the regex. If you want fully
automatic eligibility, arrange an authorized roster sync with your school's
identity system; a formatting rule alone cannot prove current enrollment.
Do not publish the roster on GitHub or put it in browser JavaScript.

To revoke a member's authorization, disable the entry (and disable or end
their Auth session when necessary):

```sql
update public.student_approved_emails
set active = false
where email = 'e1234@edu.markaryd.se';
```

## Step 4 — Enable the EXISTING Supabase Auth Hook

In **Authentication → Hooks → Before User Created**, select
**Postgres Function → public.hook_restrict_student_signup**. Enable and save.

The exact existing function has already been created and the
`supabase_auth_admin` role has EXECUTE permission. Supabase Auth Hooks
documentation:
https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

Do **not** select the old draft's `hook_only_student_signup` name.
The hook must be enabled before the general sign-up toggle.

## Step 5 — Enable confirmed email sign-up

In **Authentication → Providers → Email**:
- Enable Email / password sign-up.
- Enable **Confirm Email** (important: do not allow unconfirmed email access).
- Configure SMTP if your project needs it; test delivery to a real school
  mailbox. Consider rate limits / CAPTCHA.

In **Authentication → URL Configuration**:
- Site URL: `https://anti-markaryd.com`
- Add `https://anti-markaryd.com/**` to allowed redirect URLs.

In **Authentication → General Configuration**:
- Keep **Allow anonymous sign-ins** disabled.
- After the hook and email provider have been verified, enable
  **Allow new users to sign up**.

Finally, in **SQL Editor**, enable your configured registration policy:

```sql
update public.student_signup_config
set email_domain = 'edu.markaryd.se',
    enabled = true
where id = 1;
```

Verify what is enabled, then test one approved school mailbox. Do not publish
the new front end until the private-code access restriction and certificate
functions below are working.

## Step 6 — Install the certificate eligibility RPC for your EXISTING tables

Run `supabase/migrations/202611140001_student_signup_policy.sql` from this
pull request in the SQL Editor. **The revised file does not create duplicate
tables or a duplicate Auth Hook.** It defines a
`public.student_email_allowed(text)` function that the server-side license
functions use to check your existing active roster, enabled flag, exact email
pattern, and domain. Only `service_role` may execute it over the Data API.

As a basic check, run:

```sql
select
  public.student_email_allowed('teacher@edu.markaryd.se') as staff_format,
  public.student_email_allowed('e12345@edu.markaryd.se') as wrong_length,
  public.student_email_allowed('e1234@gmail.com') as wrong_domain;
```

These should all return `false`. An example `e1234@edu.markaryd.se` should
return `true` **only if it has been actively approved in your roster**.

## Step 7 — Prepare the certificate signing key locally

On a trusted computer with Node.js 20+ and this PR branch checked out:

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"

node scripts/prepare-license-secrets.mjs \
  "$HOME/anti-markaryd-signing-key.pk8" \
  "$HOME/anti-markaryd-secrets.env"
```

The first command generates your signing key; the second prepares a local env
file with `LICENSE_PRIVATE_KEY` and `LICENSE_PUBLIC_KEY`. **Do not commit
either file, share the private key, or put it in GitHub Pages JavaScript.**

In **Supabase → Edge Functions → Secrets**, paste these two values from the
local env file. Optionally set:
- `LICENSE_TEXT`: your custom human-readable UTF-8 license terms, up to 2048
  UTF-8 bytes (e.g. `Personal access for this registered student account.`)
- `LICENSE_VALID_DAYS`: an integer from 1 to 365 (default: 90)
- `LICENSE_ALLOWED_ORIGINS`: `https://anti-markaryd.com`

If using CLI instead, run `supabase login`,
`supabase link --project-ref eqwlikflvpyghkvhsxmz`, then
`supabase secrets set --env-file "$HOME/anti-markaryd-secrets.env"`.
Use `supabase secrets set --help` to confirm flags for your installed CLI.
Supabase docs: https://supabase.com/docs/guides/functions/secrets

## Step 8 — Install private content security and device binding

Back up the database and inspect existing policy dependencies first.
This currently matters because the live database allows **any signed-in
account to SELECT** `public.private_app_code` directly, bypassing the proposed
certificate gate.

Review and apply the pull request's
`supabase/migrations/202611110001_require_signed_license.sql`
to block direct frontend reads, and
`supabase/migrations/202611110002_bind_license_device.sql`
to add `license_devices` and server-only challenge RPCs.

**The private app JavaScript and private `install-signed-license.sql` were
supplied separately and are not contained in the public GitHub PR.** Reconcile
the private installer before changing or deploying the second JavaScript
layer. Applying SQL before the new frontend and Edge Functions work may cause
temporary access interruption.

## Step 9 — Deploy the Edge Functions

From the checked-out PR branch, using the Supabase CLI:

```sh
supabase login
supabase link --project-ref eqwlikflvpyghkvhsxmz

supabase functions deploy issue-license --no-verify-jwt
supabase functions deploy verify-license --no-verify-jwt
```

The flags are intentionally used because each function explicitly validates
the Bearer token with `supabase.auth.getUser`. **Do not remove that internal
authentication.** The Supabase host supplies `SUPABASE_URL`, the legacy
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the deployed runtime;
never copy a service role key into the public browser scripts.

Confirm both appear in the **Edge Functions** page and inspect execution
logs if calls fail. Do not deploy a private signing key in source code.

## Step 10 — Test the entire student flow, then merge PR #5

1. With an authorized school Chromebook and an **active approved** student
   address, sign up at `https://anti-markaryd.com` and follow the email
   verification message.
2. Sign in using that confirmed account and the same normal Chrome profile.
   The GitHub frontend creates a browser-profile key. The `issue-license`
   function proves possession of that key and returns a readable UTF-8 JSON
   certificate file with account, profile ID, expiry, custom license terms,
   and owner signature.
3. Choose **Visa mitt certifikat och licensen** to read it, then
   **Ladda ned mitt certifikat** to save `student.certificate`.
4. Upload the file through **Ladda upp**. `verify-license` checks the user,
   membership authorization, owner signature, matching browser-profile key,
   and a one-time challenge. Only after success does Supabase release the
   **second, private application JavaScript**.
5. Test failure cases: a non-school domain, wrong number of digits,
   unapproved email, unverified email, copied certificate from another
   browser profile, tampered license text, and an expired or revoked member.
6. Run `node --test tests/license.test.mjs`. Inspect the PR GitHub Actions
   result. After the live end-to-end checks succeed, merge PR #5 into `main`
   and confirm GitHub Pages serves the updated version.

### Important limitations

- This is a **custom signed JSON** `.certificate`, not an X.509 TLS cert.
  It is human-readable and can be opened in a text editor.
- A browser platform/user-agent check cannot reliably prove a physical
  Chromebook; true Chromebook hardware attestation needs a managed-device
  system supported by the organization.
- A school-domain regex plus email verification demonstrates mailbox control,
  not necessarily active student status. The currently configured approved
  roster is an additional authorization check.
- Any JavaScript loaded into the same website context (including third-party
  scripts) may be able to observe page content. Review those scripts before
  relying on client-side secrecy.
- The public frontend and the second private JavaScript must be integrated
  and tested together. This PR does not automatically deploy Supabase or
  replace the separately stored private SQL/application source.
