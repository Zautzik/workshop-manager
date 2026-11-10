# Local environment: dev without touching the cloud

Audit 2026-11-05, S-1: development ran against the only Supabase project.
The fix is not a second cloud project. It's three places with three jobs:

| Where | What it's for | Data |
|---|---|---|
| **Local stack** (Docker, `npx supabase start`) | Daily development, scripts, test-data fixes, experiments | A copy of the cloud, rebuilt on demand |
| **Cloud project** `sgnbbatucphbqhahgczq` | Staging: the WhatsApp webhook (Meta needs a public URL), demos | Seed / dummy data |
| **Production project** | Created at go-live from a baseline migration (S-2), not from this project | Real data only |

The CLI labels the cloud project "production". That's only the default name of a
project's main branch: no real customer data lives there.

## Daily use

```powershell
npx supabase start          # once per boot; Docker Desktop must be running
npm run db:use:local        # dev → local stack (writes .env.local)
npm run dev
```

- **Studio:** http://127.0.0.1:54323
- **Mail catcher (auth emails):** http://127.0.0.1:54324
- **Back to the cloud:** `npm run db:use:cloud` (deletes `.env.local`). A
  running `npm run dev` picks the change up without a restart.

## Rebuilding the local copy

```powershell
npm run db:local:refresh    # dump the cloud again, then rebuild local from it
npm run db:local:restore    # rebuild local from the last dump (supabase/.dump/)
```

Both wipe the local database and recreate it. Use them whenever local gets
messy, since that's what it's for. The cloud is only read (pg_dump).

## Why a dump and not the migrations

The local database is **not** built from `supabase/migrations`: replay dies at 20
of 196 (S-2). That's why [config.toml](../supabase/config.toml) has
`[db.migrations] enabled = false`.

[local-db-restore.ps1](../scripts/local-db-restore.ps1) loads, in order:

1. roles
2. schema
3. `pre.sql`
4. data
5. `post.sql`

[local-db-fixups.mjs](../scripts/local-db-fixups.mjs) generates `pre.sql` and
`post.sql`. They bridge two gaps between the cloud and a plain
schema-then-data restore:

- **`NOT VALID` checks.** `purchases_emitida_esta_completa` and two others are
  `NOT VALID` in the cloud because old rows break them. Created before the
  data, they'd reject all of `purchases`. The script drops them first and
  re-adds them afterwards.
- **Version skew.** The local auth and storage images can lag the cloud: no
  MFA recovery codes, no SCIM, no bucket lifecycle. Those tables are empty or
  unused, and their load errors are reported as *expected*. Buckets are
  re-inserted with the columns both versions share.

Verified 2026-11-09: 105 public tables and 16,994 rows, identical to the dump.

A restore that runs clean is also the proof the dump works as a backup (S-2's
recovery path).

## What doesn't come across

- **Storage files.** The 14 `storage.objects` rows load, but the files don't,
  so old images show as broken locally. New uploads work.
- **Inbound WhatsApp.** Meta calls the deployed URL, which writes to the cloud.
  Test the webhook on staging, or use the simulator or manual entry locally.
- **Outbound WhatsApp is still live.** `.env.local` only overrides the Supabase
  variables, so the Meta credentials in `.env` still send real messages to the
  phone numbers in the copy.

## When the migrations get a baseline (S-2)

1. Squash the current schema into one baseline migration.
2. Set `[db.migrations] enabled = true`.
3. `supabase db reset` then builds local from the repo, with the dump as the
   seed.

The same baseline creates the production project at go-live, and makes
Supabase branching possible if it's ever wanted.
