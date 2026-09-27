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
| `app/api/auth/*`, `app/auth/callback` | Email code sign-in (link as a desktop fallback), family emails only |
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
3. Authentication → URL Configuration: set **Site URL** to your Vercel URL and add
   `https://YOUR-APP.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback`) to **Redirect URLs**.
4. **Sign-in email (required).** The app signs in with a 6-digit code, not a link, because an iPhone
   home-screen app keeps its own cookies: a link would open Safari and sign Safari in, not the app.
   In Authentication → Email Templates, edit both **Magic Link** and **Confirm signup** so the body is:
   ```html
   <h2>Your Our Kitchen code</h2>
   <p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   <p>Or, on a computer: <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">sign in with this link</a></p>
   ```
5. **Email sender.** Supabase's built-in sender is for testing: it's heavily rate-limited and may only deliver
   to members of your Supabase organisation. Set up a free sender (e.g. Resend) under
   Authentication → Emails → SMTP Settings before your partner signs in.

**2. GitHub and Vercel**
1. Push this folder to a new private GitHub repo.
2. Import it in Vercel and add the environment variables from `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`,
   `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-5`), `ALLOWED_EMAILS` (both your emails), `NEXT_PUBLIC_SITE_URL`.
3. Deploy.

**3. Put it on your phones**
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. It opens full screen with the icon and name.
- **Pixel:** open the site in Chrome → ⋮ menu → **Add to home screen** → **Install**. It installs like an app (also in the app drawer).
- Sign in inside the installed app (email → code). You stay signed in; there's no need to repeat it.

**4. Sign in, in this order**
1. You sign in first; that creates the household.
2. Invite your partner: `POST /api/household/invites {"email": "…"}` (the app will have a button for this).
3. Your partner signs in and lands in the same household. If they signed in before the invite, they
   just sign in again: an empty household of their own is swapped for yours automatically.
4. Once you're both in, turn off Authentication → Providers → Email → **Allow new users to sign up**.
   Existing accounts keep working. (The API already refuses anyone not in `ALLOWED_EMAILS`;
   this also stops strangers creating empty accounts in your Supabase project.)

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
