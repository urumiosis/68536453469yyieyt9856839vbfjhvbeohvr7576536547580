# ANTI MARKARYD — v1

Förbjuden spelportal. Login via Supabase. Certifikat verifieras mot `profiles.certificate_key`.

## Supabase setup (du kör detta i dashboarden)

1. Öppna projektet → **SQL Editor** → New query  
2. Klistra in allt i `supabase-profiles.sql` → **Run**  
3. **Authentication → Users → Add user** (e-post + lösenord)  
4. Kopiera användarens **UUID**  
5. Kör t.ex.:

```sql
update public.profiles
set full_name = 'Anna Svensson',
    certificate_key = 'AM-KEY-7f3a9c2e',
    role = 'student',
    updated_at = now()
where id = 'PASTE-USER-UUID-HERE';
```

### Tabellen `profiles`

| Kolumn | Betydelse |
|--------|-----------|
| `id` | samma som `auth.users.id` |
| `full_name` | visas som "Välkommen …!" |
| `certificate_key` | måste matcha nyckeln i certifikatfilen |
| `role` | t.ex. `member` / `student` / `admin` |

RLS: inloggad användare får **bara läsa sin egen** rad. Endast admin (SQL/dashboard) sätter namn och nyckel.

## Certifikatfil

```text
# namn: Anna Svensson
# födelsedatum: 2009-05-12
# klass: 8B
AM-KEY-7f3a9c2e
```

`namn` ska matcha `full_name`, sista raden ska matcha `certificate_key`.

## Filer

- `index.html`, `app.js`, `style.css`
- `supabase-profiles.sql` — kör i Supabase
- `assets/exempel-certifikat.txt`
