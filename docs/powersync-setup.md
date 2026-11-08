# Setting up offline sync (PowerSync)

The app keeps a full copy of your household's recipes, plan and shopping list on
each device, so it works with no signal. PowerSync copies changes between that
local copy and Supabase whenever you're online. Edits made offline are sent when
the connection comes back; if two people edit the same thing, the last edit wins.

## 1. Update the Supabase database

In the Supabase Dashboard, open **SQL Editor → New query**, paste the contents of
[`supabase/migrations/002_powersync.sql`](../supabase/migrations/002_powersync.sql)
and click **Run**. It should say "Success. No rows returned".

## 2. Create a free PowerSync account and instance

1. Sign up at <https://accounts.powersync.com/portal/powersync-signup> (the free plan is enough).
2. Create a project, e.g. "Nacho Cookbook". PowerSync creates a *Development*
   and a *Production* instance. Use **Development** for now.

## 3. Connect PowerSync to Supabase

1. In the instance, click **Set Up with Supabase** (in the **Health** or
   **Database Connection** view) and follow the on-screen steps. It signs in to
   Supabase, creates PowerSync's database user and the `powersync` publication,
   and saves the connection.
2. Go to **Client Auth**, choose **Use Supabase Auth**, leave the JWT secret
   empty, and click **Save and Deploy**.

<details>
<summary>Doing it by hand instead of "Set Up with Supabase"</summary>

Run this in the Supabase SQL Editor (choose your own password):

```sql
create role powersync_role with replication bypassrls login password 'choose-a-long-random-password';
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;
create publication powersync for all tables;
```

Then in Supabase click **Connect → Direct**, copy the connection string, paste it
into PowerSync's **Database Connection → Postgres → URI**, change the username to
`powersync_role` and the password to the one above, **Test Connection**, **Save**.
</details>

## 4. Tell PowerSync what to sync

Open **Sync Streams**, replace everything with the contents of
[`powersync/sync-config.yaml`](../powersync/sync-config.yaml), click **Validate**,
then **Deploy**.

## 5. Point the app at PowerSync

Click **Connect** in the PowerSync Dashboard's top bar and copy the instance URL
(it looks like `https://<id>.powersync.journeyapps.com`). Put it in `.env`:

```
EXPO_PUBLIC_POWERSYNC_URL=https://<id>.powersync.journeyapps.com
```

The URL is public, like the Supabase publishable key.

## Running the app with sync

- **Web:** `npm run web`. The `postinstall` script copies PowerSync's web
  workers into `public/@powersync`.
- **Android:** the offline database is a native module, so Expo Go can't run it.
  Use a development build: `npx expo run:android` locally, or
  `npx eas-cli@latest build --profile development --platform android`.
