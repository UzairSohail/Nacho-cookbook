# Nacho Cookbook

A shared household cookbook that plans a fortnight of meals and turns them into one shopping list. Android and web from one Expo (React Native) codebase; iOS can follow later.

Requirements: [Cookbook app requirements](https://claude.ai/artifact/EYCQsxYCUjh5jw13HQgSis)

## What works so far

- **Recipes:** list, search by name, tag or ingredient, and a recipe page.
- **Scaling:** change servings, or tap an ingredient and enter how much you have; everything rescales (both up and down). Amounts show as kitchen fractions, "to taste" items don't scale, and fractional eggs get a rounding hint.
- **Planner:** 14 days from Monday with breakfast, lunch, dinner and dessert. Servings per slot default to the household size. Meals of the same recipe within its "keeps for" days are grouped into one cook, labelled Cook / Leftovers.
- **Shopping list:** generated for the whole fortnight, week 1 or week 2. Recipes are scaled to the exact servings planned, the same ingredient is merged across recipes (converting cups to grams where the density is known), pantry staples are skipped, and items are grouped by aisle. Tick, edit, delete, add your own items, and share as text. Updating from the plan keeps your manual changes.
- **Settings:** household size, metric/imperial, your cup and spoon sizes (Australian by default, metric or US), pantry staples.
- **US recipes:** a recipe can be marked as written with US cups and spoons. Spoons are converted to your sizes (2 US tbsp shows as 1 1/2 Australian tbsp), cups are labelled "US cup", and scaling and the shopping list use the right amounts.

**Accounts:** email sign-in, then start a household or join one with an invite code (shown in Settings). Without Supabase settings the app skips sign-in and runs in demo mode on sample data.

**Offline sync:** once PowerSync is set up, recipes, the plan, pantry staples and the shopping list live in a database on each device and sync through the household. Everything works with no connection; changes upload when you're back online, and the last edit wins. The app also opens offline as the last signed-in person. Signing out removes the household's data from that device. A new household starts empty, with an "Add sample recipes" button.

Without PowerSync settings, a signed-in household still runs on in-memory sample data.

## Connecting Supabase and PowerSync

1. Create a Supabase project and run `supabase/schema.sql`, then each file in `supabase/migrations/` in order, in its SQL Editor.
2. Put the Project URL and publishable key in `.env` (already set for the household project; use `.env.local` to point at another one).
3. Set up PowerSync and add `EXPO_PUBLIC_POWERSYNC_URL` to `.env`: see [docs/powersync-setup.md](docs/powersync-setup.md).
4. Restart `npm run web` / `npm run android`.

## Project layout

| Path | What's there |
| --- | --- |
| `app/` | Screens (Expo Router). `(tabs)/` holds Recipes, Planner, Shopping and Settings. |
| `components/Themed.tsx` | Themed text, cards, buttons, inputs and the servings stepper. |
| `constants/Colors.ts` | The cream / tomato / herb green palette, light and dark. |
| `src/core/` | Pure TypeScript logic: units, fractions, scaling, planner batches, shopping list. No React, fully unit tested. |
| `src/state/` | App state: `reducer.ts` (every change as a pure function), `rows.ts` (to and from database rows, and which rows a change touched), `store.tsx` (in-memory or synced store). |
| `src/backend/` | Supabase client and sign-in / household state. |
| `src/backend/sync/` | PowerSync: device database schema, the Supabase connector that uploads changes, and opening the database on Android/iOS/web. |
| `supabase/` | `schema.sql` (tables and row level security) and `migrations/`. |
| `powersync/sync-config.yaml` | Sync Streams: which rows each person's devices get. |

## Running it

```bash
npm install       # also copies PowerSync's web workers into public/@powersync
npm test          # unit tests
npx tsc --noEmit  # typecheck
npm run web       # open in the browser
npm run android   # Android emulator or Expo Go on a phone
```

With PowerSync set up, Android needs a development build (`npx expo run:android`, or EAS) because the offline database is a native module that Expo Go doesn't include. Demo mode still runs in Expo Go.

## Test builds and hosting

- **Android APK:** `.github/workflows/android-apk.yml` checks the APK builds on every pull request. Each merge to `master` publishes it as the single "Test build N" release (older ones are deleted), so [this link](https://github.com/UzairSohail/Nacho-cookbook/releases/latest/download/nacho-cookbook.apk) always downloads the newest APK. It's signed with a debug key, so it's for testing only, and builds for 64-bit ARM phones.
- **Web app:** published to GitHub Pages at https://uzairsohail.github.io/Nacho-cookbook/ by `.github/workflows/pages.yml` on each merge to `master` that changes the app (or Actions → **Publish web app** → Run workflow). It's built for the `/Nacho-cookbook` path (`experiments.baseUrl` in `app.json`), and `404.html` is a copy of `index.html` so every route loads the app. One-time setup: Settings → Pages → Source: **GitHub Actions**. Add the address to Supabase under Authentication → URL Configuration (Site URL and Redirect URLs).
- **Recipe import on the web:** browsers can't read other sites' pages, so the web app asks the Supabase Edge Function `import-recipe` (`src/import/importHandler.ts`, bundled by `npm run build:import-function`) to fetch the page. Calls need the app's Supabase key. `.github/workflows/import-function.yml` deploys it when the import code changes on `master`; it needs the repository secret `SUPABASE_ACCESS_TOKEN` (a personal access token from supabase.com/dashboard/account/tokens). The Android app fetches pages itself.
- **AI sorting of imports:** pasted recipes, Instagram captions, photo text and website recipes are sorted by Google Gemini through the same `import-recipe` function (`src/import/aiSort.ts`), for signed-in people only. A website's own recipe data is written out as text for Gemini to tidy (`src/core/recipeForAi.ts`), keeping the page's photo, times and servings; a page without recipe data has its words sent instead. It needs the Supabase secret `GEMINI_API_KEY` (a free key from aistudio.google.com/apikey; Supabase dashboard → Edge Functions → Secrets). Optional `GEMINI_MODEL` picks another model (default `gemini-flash-lite-latest`, falling back to `gemini-flash-latest` and `gemini-2.5-flash`; check with `GET import-recipe?check=gemini&model=…`). Offline, signed out, without the key, or when the free allowance runs out, the app sorts with its own rules (`src/core/recipeText.ts`).
