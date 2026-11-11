# Owner-signed certificates

The site requires both a Supabase login and a `.certificate` issued for that account. The Edge Function verifies the owner's ECDSA P-256 signature, the site audience, the authenticated user's UUID, and the expiry before returning the private JavaScript and game catalog. Existing unsigned certificates must be reissued. The browser asks for a certificate again after a reload or sign-out.

## Generate your signing key and issue certificates

Use Node.js 20 or later on your own machine. Run these commands from a checkout of this branch.

```sh
node scripts/license.mjs keygen "$HOME/anti-markaryd-signing-key.pk8"
node scripts/license.mjs issue "$HOME/anti-markaryd-signing-key.pk8" \
  12345678-1234-4234-8234-123456789abc 2027-12-31T23:59:59Z member.certificate
```

The first command prints the public key. Keep the private key file outside the repo and keep a secure backup. Use the recipient's actual **User UID** from Supabase **Authentication → Users** and choose a UTC expiry. Send the resulting file to that account holder. Generating a new signing key and changing the configured public key invalidates all certificates issued with the previous key on subsequent verification requests.

## Deploy

1. In your Supabase project's Edge Function secrets, set `LICENSE_PUBLIC_KEY` to the public key printed by `keygen`. The function uses the project's injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. If you host the site at another origin, set `LICENSE_ALLOWED_ORIGINS` to a comma-separated list of exact origins.
2. From the branch checkout, deploy the function with the Supabase CLI. Replace `YOUR_PROJECT_REF` with your existing project's ref. The handler checks the bearer token against Supabase Auth before accessing any protected rows.

   ```sh
   supabase functions deploy verify-license --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```

3. Back up the current `public.private_app_code` row with ID 1. In the Supabase SQL Editor, run the private `install-signed-license.sql` delivered with this change. It replaces that row's JavaScript and applies the access policies in one transaction. It aborts if the row differs from the supplied export so that newer edits can be integrated first. The public migration in this repo contains the same policy changes for tracking and can be applied again safely.
4. Merge the pull request into `main` and wait for GitHub Pages to deploy. Plan a brief interruption between the SQL change and the Pages deployment. Keep a signed certificate for a test account available before starting.
5. Sign in and confirm a valid file opens the dashboard. Try an unsigned file and a file for a different account, and confirm they leave the dashboard locked. As a regular authenticated user, direct database reads of the private app and catalog should return no rows.

The existing admin permissions for editing site copy and the game catalog still apply. License expiry prevents subsequent server responses and returns the site to the upload screen. Users can retain code or links already delivered to their browser. Scripts already running on the site, including its ad scripts, share the browser page with the upload and the unlocked content.
