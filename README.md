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

- **Android APK:** `.github/workflows/android-apk.yml` builds a test APK on every pull request push and merge and publishes it as a "Test build N" pre-release under GitHub Releases; open that page on the phone and install the `.apk`. It's signed with a debug key, so it's for testing only, and builds for 64-bit ARM phones.
- **Web app:** hosted on Netlify from `master` using `netlify.toml` (`npx expo export --platform web`, published from `dist`, every route falls back to `index.html`). Add the site's address to Supabase under Authentication → URL Configuration (Site URL and Redirect URLs).
