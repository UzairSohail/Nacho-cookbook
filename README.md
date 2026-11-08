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

Recipes, the plan and the list are still held in memory on each device; syncing them through the household (PowerSync + Supabase) comes next.

## Connecting Supabase

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key from Project Settings → API.
3. Restart `npm run web` / `npm run android`.

## Project layout

| Path | What's there |
| --- | --- |
| `app/` | Screens (Expo Router). `(tabs)/` holds Recipes, Planner, Shopping and Settings. |
| `components/Themed.tsx` | Themed text, cards, buttons, inputs and the servings stepper. |
| `constants/Colors.ts` | The cream / tomato / herb green palette, light and dark. |
| `src/core/` | Pure TypeScript logic: units, fractions, scaling, planner batches, shopping list. No React, fully unit tested. |
| `src/state/` | App state and sample data. This is where the offline database plugs in. |
| `src/backend/` | Supabase client and sign-in / household state. |
| `supabase/schema.sql` | Database tables and row level security for households. |

## Running it

```bash
npm install
npm test          # unit tests for src/core
npx tsc --noEmit  # typecheck
npm run web       # open in the browser
npm run android   # Android emulator or Expo Go on a phone
```
