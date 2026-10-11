# ANTI MARKARYD

## Website content

Dashboard copy and the game catalogue are stored in Supabase instead of hard-coded in `index.html`.

### One-time setup

1. Open the project's Supabase SQL Editor.
2. Run `supabase/migrations/202610110001_site_content_and_game_catalog.sql`.
3. Confirm every administrator has `profiles.role = 'admin'`. Do not let regular users update their own role.
4. Deploy this branch after the migration is applied.

The migration enables row-level security on both content tables. Signed-in users can read enabled website content; only users whose profile role is `admin` can insert, update, or delete game entries. Only the Supabase publishable key belongs in browser code—never use a service-role key in the frontend.

### Updating website text

In Supabase Table Editor, open `site_content`, edit the JSON in the `content` column for row `id = 1`, and save. Supported keys include:

- `site_intro`
- `games_heading`
- `certificate_eyebrow`, `certificate_heading`, `certificate_hint`
- `admin_note`, `admin_note_small`
- `warning_title`, `warning_body`

For example, change `warning_body` to update the warning shown under the game list.

### Updating the game list

Edit rows in `game_catalog`. Change `title`, `description`, `emoji`, `sort_order`, or `enabled`. Use a known built-in game ID (`snake`, `tetris`, `2048`, `flappy`, `pong`, `minesweeper`) for games rendered inside the site. Set `launch_url` to an HTTPS URL for an external game. Disable a game by setting `enabled = false`.

### Authentication and limits

The dashboard is hidden by default and is only activated after Supabase returns an authenticated user. Auth sessions persist and refresh normally. Content is requested after authentication, and Supabase RLS is the data-access boundary.

This is a static frontend: HTML and JavaScript files can still be downloaded by anyone who knows the site URL. Do not place secrets or sensitive private data in frontend code. Protect sensitive records with RLS and server-side checks. This change protects dashboard content/data, not the source code itself.


## One-time AnyProxy instruction

After certificate verification, the dashboard shows a polished Swedish setup card linking to `https://anyproxy.site/`. The user can open the site, press **Go!**, close that tab, and select **Klart, fortsätt**. The acknowledgement is stored per authenticated user in `public.user_onboarding`, so it should not reappear on later visits or other devices.

Apply `supabase/migrations/202610110002_user_onboarding.sql` in the Supabase SQL Editor. The page does not read, capture, or store an AnyProxy session ID; it only links to the external site and remembers that the user dismissed the instruction.
