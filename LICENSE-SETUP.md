# Owner-signed, UTF-8 certificates for ChromeOS browsers

Each `.certificate` file is readable UTF-8 JSON with the recipient's Supabase account UUID, browser device ID, expiration date, **custom license text**, and a P-256 digital signature covering every signed field. Supabase checks your signature and asks the browser to prove it holds the private key for that device ID. The server allows one active device ID per account.

The device ID belongs to one Chrome profile on one site origin. Use the same regular Chrome profile and site address every time. Guest mode, Incognito, a different profile, and cleared site data can lose or change the device ID. This uses a browser key and does not read a Chromebook serial number or attest its hardware. The site's ChromeOS-only check uses browser platform information and **can be spoofed**; it is a usability restriction, not security-grade Chromebook enforcement. Genuine ChromeOS hardware verification requires a separately provisioned managed ChromeOS Verified Access / extension setup. An IP address is not used as a device ID.

## Set up once

Use Node.js 20 or later on your own machine and run this command from a checkout of this branch.

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"
```

The command prints the **public key**. Keep the private key file outside the repo and make a secure backup. The same key signs each certificate.

1. In **Supabase → Edge Functions → Secrets**, set `LICENSE_PUBLIC_KEY` to the printed public key. The function also uses the project's injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. For a different site address, set `LICENSE_ALLOWED_ORIGINS` to a comma-separated list of exact origins.
2. Deploy the function from the branch checkout. Substitute your existing Supabase project ref. The function verifies the bearer token with Supabase Auth itself.

   ```sh
   supabase functions deploy verify-license --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```

3. Back up `public.private_app_code` row 1. In the **Supabase SQL Editor**, run the updated private `install-signed-license.sql` delivered with this change. It installs the new private app row, access policies, and device verification tables and functions in one transaction. If row 1 differs from the supplied export and the replacement, the installer aborts so newer edits can be integrated first.
4. Merge the pull request into `main` and wait for GitHub Pages. Plan a brief interruption between applying the SQL and the Pages deployment. Earlier certificates without a signed device ID must be reissued.

## Enrollment and certificate issuance

**Enrollment is owner-approved, not automatic:** The current site has registration disabled. Create or approve the user's Supabase account as you already do, then have that user sign in from Chrome on their Chromebook. Do **not** put the owner signing key or a signing endpoint that accepts arbitrary users on GitHub Pages.

## Issue and use a certificate

1. Have the recipient sign in at **https://anti-markaryd.com** on the Chromebook and Chrome profile they intend to use. They click **Kopiera enhets-ID** and send you the copied value. The ID is also displayed for manual copying.
2. Create a UTF-8 text file called `license.txt` containing the custom license conditions you want to include. The file may contain multiple lines (maximum 2048 UTF-8 bytes). For example:

   ```text
   Personal access license
   Licensed only to the named account and registered ChromeOS browser profile.
   Not transferable to another account or profile.
   ```

3. In **Supabase → Authentication → Users**, copy that user's **User UID**. Replace `USER_UUID` and `DEVICE_ID` below and choose an expiration date and time in UTC.

   ```sh
   node scripts/license.mjs issue "$HOME/anti-markaryd-signing-key.pk8" \
     USER_UUID DEVICE_ID 2027-12-31T23:59:59Z member.certificate license.txt
   ```

   You may omit `license.txt` to use the built-in default license statement. The command prints no secret key and refuses to overwrite an existing certificate.

4. Give the resulting `member.certificate` file to the recipient. It is **human-readable JSON**, and the signature protects the device ID, account ID, dates, and license text against changes. They click **Ladda upp** and select the file on the same Chrome profile. After reloading the page or signing in again, they upload the same file until it expires. A renewal on the same profile uses the same device ID.

## Replace a device or recover after clearing site data

Get the new device ID and issue a certificate for it. Before handing over the new file, pin that account to the new ID in the SQL Editor. Replace both quoted placeholders.

```sql
insert into public.license_devices (user_id, device_id, activated_at)
values ('USER_UUID', 'NEW_DEVICE_ID', now())
on conflict (user_id) do update
set device_id = excluded.device_id,
    activated_at = excluded.activated_at,
    challenge = null,
    challenge_expires_at = null;
```

This clears any pending verification and blocks the old device on its next request. Code and links already downloaded can still be retained. Rotating the owner's signing key invalidates all previously issued files on their next verification. Existing scripts on the website share the browser page with the upload and unlocked content.

## Checking your changes

Run `node --test tests/license.test.mjs` from this branch to exercise certificate verification and tampering cases. This does not test deployed Supabase, ChromeOS device detection, or the private SQL installer. Certificate files in the previous compact `am2` format will need reissuing in readable `am3` format.
