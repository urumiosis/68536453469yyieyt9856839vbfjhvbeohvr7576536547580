# Student enrollment + readable certificates: deployment runbook

**Current status:** GitHub PR #5 has the frontend, Edge Function sources and SQL migration. The student roster SQL has been installed on the Anti Markaryd Supabase project, but it is **disabled** with **no domain and no allowed email addresses**. Supabase Auth has **not** been enabled for public registration, and the two Edge Functions have **not** been deployed. The certificate-protected application cannot go live until the private code installer is reconciled.

## 1. Understand the access checks

The browser uses a best-effort ChromeOS user-agent gate (spoofable; this is not hardware attestation).
A signed-in student must also pass:
- **Exact email pattern**: e followed by four digits at the configured school email domain (case insensitive).
- **Email confirmation**: Supabase must have a confirmed school mailbox.
- **Private roster membership**: an active row in student_approved_emails.
- **Device proof**: a per-account, per-origin browser private key proves possession during certificate verification.
- **Owner signature**: an owner-controlled private signing key produces a human-readable UTF-8 certificate; the verification service trusts only its public key.

An email format cannot distinguish every teacher from every student. Maintain an approved student roster from a source you are authorized to use. Do not use these controls to bypass school policies or hide access from administrators.

## 2. Configure approved students (Supabase SQL Editor)

Replace the example domain below with the **real exact student domain** and replace the example student address with an approved address. Do not insert placeholder values as real approvals.

```sql
update public.student_signup_config
set email_domain = 'students.example.edu', enabled = false
where id = 1;

insert into public.student_approved_emails (email, active)
values ('e1234@students.example.edu', true)
on conflict (email) do update set active = excluded.active;
```

Use as many approved addresses as needed. They must be verified student addresses. Turn enrollment on **last**, after testing:

```sql
update public.student_signup_config set enabled = true where id = 1;
```

To immediately stop new enrollments, set enabled = false. This only stops new registrations and certificate issues; existing sessions and already issued certificates must be revoked separately if needed.

## 3. Connect the Supabase signup hook

In Supabase **Authentication → Hooks → Before User Created**, enable a **Postgres** hook and select the function `public.hook_restrict_student_signup`.
This hook blocks signup unless the configured domain, four-digit student identifier, and approved roster **all** match. The database script grants `supabase_auth_admin` the necessary execution and SELECT rights. Do not turn on public signups without this hook.

In **Authentication → Providers → Email**, ensure email confirmation is required. Check SMTP delivery and the email-confirmation template. Configure **Authentication → URL Configuration** with site URL `https://anti-markaryd.com` and the exact redirect origin(s).

Finally enable email/password signup in Supabase Authentication settings (the UI label may be **Allow new users to sign up**).

## 4. Create and protect the signing keys

Use Node.js 20+ on a trusted machine with this PR branch checked out:

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"
```

The command prints the public key to use as `LICENSE_PUBLIC_KEY`. The binary `.pk8` file is the owner private key; **never commit or upload it to GitHub**. Keep a secure backup.

For automated issuance, encode the binary private file as base64url (without padding). For example, from the checkout on a trusted computer with Node:

```sh
node -e "const fs=require('node:fs');console.log(fs.readFileSync(process.argv[1]).toString('base64url'))" "$HOME/anti-markaryd-signing-key.pk8"
```

Treat the output as a **secret**. Paste it into Supabase **Edge Functions → Secrets** as `LICENSE_SIGNING_PRIVATE_KEY`. Paste the corresponding *public* key as `LICENSE_PUBLIC_KEY`. These must be a matching pair. Also set `LICENSE_ALLOWED_ORIGINS=https://anti-markaryd.com` (add other actual deployment origins only if needed).

Optionally set `LICENSE_STUDENT_TERMS` to your desired UTF-8 license text (max 2048 bytes). It will appear in each signed certificate and changing it later affects **new** certificates, not existing certificates.

The automated issuer creates certificates valid for 30 days. The manual `scripts/license.mjs issue` command still supports per-user custom `license.txt` text and a chosen expiration date.

## 5. Deploy database controls and functions BEFORE merging

These scripts are committed to this PR:
- `supabase/migrations/202611140001_student_signup_approval.sql` — already applied to this project with registration **disabled**
- `supabase/migrations/202611110001_require_signed_license.sql` — **not yet applied**
- `supabase/migrations/202611110002_bind_license_device.sql` — **not yet applied**

**Critical:** the current database still allows any authenticated account to query `private_app_code` through an old RLS policy. Do not turn signup on until the signed-license restrictive policy is installed.

PR #5 also says its private `install-signed-license.sql` / updated `private_app_code` payload is delivered separately, but it is not in the public repository. Back up `private_app_code` row 1 and confirm the private replacement implements the `initPrivateApp(session.user, app)` interface before executing the complete private installer. Applying only some migration files may break the application.

After SQL and private code are reconciled, deploy both functions from the PR checkout:

```sh
supabase functions deploy verify-license --project-ref eqwlikflvpyghkvhsxmz --no-verify-jwt
supabase functions deploy issue-student-certificate --project-ref eqwlikflvpyghkvhsxmz --no-verify-jwt
```

They independently validate bearer JWTs using Supabase Auth, so the `--no-verify-jwt` flag is intentional **only for these implemented functions**. Do not expose the service-role key or private signing key to GitHub Pages.

## 6. Test before release

1. With registration **disabled**, check that random email signup is rejected by the hook.
2. Approve one test mailbox on the roster and set the exact domain; enable registration.
3. On ChromeOS, register with the approved `E1234@`-style email, confirm it using the email link, then sign in.
4. Click **Skapa och ladda ner certifikat**. The website downloads a UTF-8 JSON `student.certificate` and verifies it with the per-profile private key before asking Supabase for protected app content.
5. Open the certificate as text and check the license, dates, account UUID, device ID and signature are visible.
6. Edit the license or device field in the file and try uploading it. Server verification must reject it. Test wrong accounts, expired certificates and copied certificates on other profiles.
7. Confirm that unauthorized accounts cannot request a certificate, read the private app code, or open protected data through direct Supabase REST calls.
8. Confirm that a teacher or other unlisted email is blocked by roster policy **without assuming the naming pattern proves role**.
9. Merge PR #5 into `main` only after the Supabase deployment and the private app code are prepared.

## 7. Expected student workflow

Student enters an approved school address and a password -> verifies the email link -> signs in from Chromebook -> clicks **Skapa och ladda ner certifikat** -> receives readable, digitally signed `student.certificate` -> server verifies certificate and per-profile key -> protected content loads.

**Limitations:** ChromeOS detection can be spoofed; a browser key does not prove Chromebook ownership. Downloaded JavaScript or game links cannot be revoked once copied. A student access list should respect school privacy and usage rules.
