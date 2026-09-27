# Family recipe book

Recipes and a shared shopping list for the two of us. Next.js on Vercel, Supabase for the
database, sign-in and photo storage, Claude for reading recipes from links and photos.

## What's here

| Path | What it does |
|---|---|
| `supabase/migrations/…_init.sql` | Tables, row-level security, photo bucket, live shopping list |
| `app/api/recipes` | List/search/filter (`?flags=baby,easy&q=chicken`), create |
| `app/api/recipes/[id]` | Read (with baby check), edit, delete |
| `app/api/recipes/import-url` | Link → draft recipe (site's recipe data first, Claude as fallback) |
| `app/api/recipes/import-photo` | Up to 3 photos → draft recipe; first photo kept as the picture |
| `app/api/shopping-lists` | Active list; add recipes (scaled, merged, sorted by aisle) |
| `app/api/shopping-lists/[id]/items` | Add your own item, clear ticked; tick/edit/delete one item |
| `app/api/household` | Household, members, invites |
| `app/api/auth/*` | Email + password sign-in, family emails only (accounts made in Supabase) |
| `app/manifest.ts`, `public/icons/` | Home-screen install: name, full-screen mode, icons |
| `lib/app-config.ts` | App name and colours: change the name here |
| `lib/` | Ingredient parser, aisle categories, baby check, list builder, page reader |

Imports return a **draft**; nothing is saved until the app POSTs it to `/api/recipes`.

## Set up (about 20 minutes)

**1. Supabase**
1. Create a project at supabase.com (region: London).
2. Install the CLI, then from this folder:
   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
3. **Accounts (no emails needed).** Authentication → Sign In / Providers: turn **off** "Allow new users to sign up"
   and "Confirm email". Then Authentication → Users → **Add user** → **Create new user** for each of you:
   email, password, tick **Auto Confirm User**. Use the same emails as `ALLOWED_EMAILS` in Vercel.

**2. GitHub and Vercel**
1. Push this folder to a new private GitHub repo.
2. Import it in Vercel and add the environment variables from `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`,
   `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-5`), `ALLOWED_EMAILS` (both your emails), `NEXT_PUBLIC_SITE_URL`.
3. Deploy.

**3. Put it on your phones**
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It opens full screen with the icon and name.
- **Pixel:** open the site in Chrome → ⋮ menu → **Add to home screen** → **Install**. It installs like an app (also in the app drawer).
- Sign in inside the installed app (email and password; iPhone and Android offer to save it). You stay signed in; there's no need to repeat it.

**4. Sign in, in this order**
1. You sign in first; that creates the household.
2. Invite your partner. In Supabase → SQL Editor, run (with their email):
   `insert into household_invites (email, household_id) select 'partner@example.com', household_id from household_members limit 1;`
3. Your partner signs in and lands in your household. If they signed in before the invite, they sign out and in
   again: their empty household is swapped for yours automatically.

**Forgotten password?** Supabase → SQL Editor:
`update auth.users set encrypted_password = crypt('new-password', gen_salt('bf')) where email = 'you@example.com';`

## Develop

```
cp .env.example .env.local   # fill it in
npm install
npm run dev
npm test          # parser, aisle sorting, list merging, baby check, page reading
npm run typecheck
```

Optional typed database client: `supabase gen types typescript --linked > lib/database.types.ts`.

## Good to know

- **Renaming the app.** Edit `lib/app-config.ts`. Phones that already installed it keep the old name until you
  remove and re-add the icon (Android may update it by itself after a day or so). Icons: edit and run `node scripts/make-icons.mjs`.

- **Costs.** Link imports on big recipe sites use their built-in recipe data and cost nothing. Pages without it
  and every photo import call Claude, which is billed per use on your Anthropic account (small for a family-sized volume; check the console after a week).
- **Photos.** Vercel caps uploads at 4.5 MB, so the app shrinks photos on the phone before sending (max 4 MB in total).
  iPhone HEIC photos need converting to JPEG first; the app screens will do this.
- **Abandoned photo imports** leave their photo in storage. Harmless; a clean-up job can come later.
- **The baby check** follows NHS weaning guidance for under-1s (salt, honey, whole nuts, stock cubes, choking foods…).
  It's a prompt for the cook, not medical advice. `Baby-friendly` is never ticked automatically.
- **Some sites block automated reading.** The app says so and suggests a photo instead.
