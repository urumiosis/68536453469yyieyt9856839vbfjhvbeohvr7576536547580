# Certificates — one per account, upload on each login

For account setup and the existing owner's controls, see
[SUPABASE-STUDENT-SETUP.md](SUPABASE-STUDENT-SETUP.md).

## New student flow

1. Open **Skapa konto** on `signup.html`, provide a school email and
   password, and confirm the email from the inbox.
2. Sign in at `index.html`.
3. **Only if this account has never received a certificate**, choose
   **Skapa mitt certifikat**, then **Ladda ned certifikat**.
4. Save `student.certificate` somewhere accessible to that same Chrome
   profile. Select **Välj certifikat** to upload and unlock.
5. **For every later login:** upload that *same* certificate. The site
   never generates, offers, fetches, or stores a replacement automatically.

The first-time button is hidden for accounts with a recorded issuance.
The Edge Function `issue-license` exposes a read-only authenticated
`status` action and rejects direct repeat issuance requests. The SQL
function `finish_license_initial_issuance` permits only the first
successful issuance for each account, even if parallel requests race.

The custom `.certificate` is readable, signed UTF-8 JSON with the account
UUID, browser-profile key fingerprint, expiration date, and license terms.
Changing its contents invalidates the signature. The browser's private key
is stored in IndexedDB and is not a Chromebook serial number.

## What the owner controls

- View accounts in **Supabase → Authentication → Users**.
- View issuance bindings in **Table Editor → license_devices**.
- Set optional `LICENSE_TEXT` and `LICENSE_VALID_DAYS` in
  **Edge Functions → Secrets**. Default validity is 90 days.
- View errors in **Edge Functions → issue-license / verify-license → Logs**.
- Keep signing keys out of GitHub and public page JavaScript.

**Lost file, expired certificate, or different browser profile:** the owner
must verify the student's identity and *explicitly* authorize a fresh
issuance. In Supabase **SQL Editor**, replace the UUID with the verified
account's User UID from Authentication → Users:

```sql
update public.license_devices
   set activated_at = null,
       challenge = null,
       challenge_expires_at = null
 where user_id = 'VERIFIED_USER_UUID';
```

This revokes the existing one-device binding; on their next login, the
student can create and download a replacement once. The old file will no
longer pass verification after the new browser binding is activated.
The owner should confirm that the update targeted exactly one account.

## Deployment sequence

1. Apply `supabase/migrations/202611150002_one_time_certificate_issuance.sql`.
2. Deploy the changed `issue-license` Supabase Edge Function. It validates
   every JWT internally using `supabase.auth.getUser(jwt)`.
3. Run `node --test tests/*.test.mjs` or inspect GitHub Actions.
4. Merge PR into `main`, and only later switch GitHub Pages off the
   separate maintenance branch when ready.

This design does **not** store certificates in the browser or silently
load them on a subsequent login. User must select a file to unlock.

The ChromeOS user-agent check is a best-effort compatibility gate, not
hardware attestation. Genuine device identity would require organizational
hardware-attestation infrastructure.
