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

1. Apply `supabase/migrations/202611150003_certificate_upload_security_events.sql`
   if it is not already installed.
2. Apply `supabase/migrations/202611150004_certificate_enforcement_bans.sql`.
3. Deploy updated `issue-license` **and** `verify-license` Edge Functions.
   They authenticate JWTs internally via Supabase Auth.
4. Review GitHub Actions tests, and merge PR into `main`.
5. GitHub Pages may remain on the maintenance branch until website launch.

This design does **not** store certificates in the browser or silently
load them on a subsequent login. User must select a file to unlock.

The ChromeOS user-agent check is a best-effort compatibility gate, not
hardware attestation. Genuine device identity would require organizational
hardware-attestation infrastructure.

## Invalid certificate behavior

The server validates the owner's digital signature separately from the
current browser profile and the authenticated account. An uploaded
certificate never grants the power to ban a *different* account.

| Owner signature | Current device/profile | Server result |
|---|---|---|
| Invalid | Does not match claimed registered device | **Ogiltigt certifikat**; no ban |
| Valid and not expired, for the logged-in account | Does not match certificate | Permanently deny this account access to the website; all its certificates become unusable |
| Invalid | Matches the registered browser-key fingerprint **and the browser proves it owns the private key** | Permanently block that browser key, with **Du har blivit permanent avstängd från webbplatsen.** |
| Valid, account matches, device matches | Registered browser-key challenge succeeds | Unlock the application normally |

An invalid signature plus a matching *unverified claim* is **not enough**
to ban a device. The server must first challenge the registered browser key
and cryptographically verify the response. Authentic but **expired**
certificates and certificates belonging to a **different account** are
invalid for access and do not trigger these account/device bans.

These bans are stored in service-only Supabase tables:
`public.certificate_account_bans` and
`public.certificate_device_bans`. Both `issue-license` and
`verify-license` reject matching banned identities.

**Limits:** A browser-profile key is not the physical Chromebook ID,
so this cannot permanently block a physical computer after its browser
identity changes. An authentic file used in a different browser profile
might indicate loss of browser data rather than theft. By owner request
that event still locks the logged-in account. A ban prevents further
website unlocks, but existing downloaded JavaScript cannot be recalled.
Supabase Auth accounts are retained for audit/review rather than erased.

## Owner's review

Find site account bans and registered-browser-key bans in Supabase SQL Editor:

```sql
select user_id, reason, banned_at
from public.certificate_account_bans
order by banned_at desc;
```

```sql
select account_id, device_id, reason, banned_at
from public.certificate_device_bans
order by banned_at desc;
```

Rejected uploads remain logged in `public.certificate_security_events`
by authenticated uploader and event type. All three tables are private
to the server and Supabase administrators. They must not be writable
through the website.

The one-time `.certificate` creation rule is unchanged; returning
users upload their previously downloaded file at every login.
