# Go-Live Checklist — $0 stack (Vercel + Supabase + WhatsApp)

Date: 2026-07-10
Stack: Vercel Hobby (hosting) · Supabase Free (DB/storage) · Twilio Sandbox → Meta Cloud API (WhatsApp) · Vercel Cron / GitHub Actions (scheduling) · Sentry Free + UptimeRobot (observability)

---

## Part 1 — General checklist

### Phase 0 · Prep (local)
- [ ] Current branch work committed and merged to `master`
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass locally
- [ ] All 89 migrations applied to the live Supabase project (`supabase db push`)
- [ ] Repo pushed to GitHub (private)

### Phase 1 · Hosting (Vercel)
- [ ] Vercel account created, repo imported as a project
- [ ] All production env vars set (see Part 2, step 4)
- [ ] First deploy green
- [ ] Login works on the live URL (dev bypass OFF)
- [ ] `https://<app>.vercel.app/api/health` returns `{"status":"ok"}`

### Phase 2 · Keep-alive & cron
- [ ] Daily ping of `/api/health` configured (Vercel Cron recommended)
- [ ] Confirmed the Supabase project shows API activity after the first cron run

### Phase 3 · WhatsApp pipeline
- [ ] Provider picked: Twilio Sandbox (pilot) or Meta Cloud API (production)
- [ ] Webhook signature verification adapted to that provider's real scheme
- [ ] `WHATSAPP_AUTH_TOKEN` + `WHATSAPP_VERIFY_TOKEN` set in Vercel
- [ ] Provider webhook pointed at `/api/whatsapp/webhook`, handshake passes
- [ ] End-to-end test: message from a real phone → appears in supervisor review queue

### Phase 4 · Observability (optional, still $0)
- [ ] Sentry project created, `NEXT_PUBLIC_SENTRY_DSN` set, test error visible
- [ ] UptimeRobot monitor on `/api/health` (emails you if the app or DB dies)

### Phase 5 · Post-launch hygiene
- [ ] Real user accounts created; no shared/dev credentials in use
- [ ] Backup routine in place (free tier has NO automated backups — see step 9)
- [ ] `.env.local` never committed; service-role key exists only server-side

---

## Part 2 — Detailed step-by-step

### Step 1 — Verify the build locally
```powershell
npm run typecheck
npm test
npm run build
```
`next.config.js` hard-fails the build if `NEXT_PUBLIC_DEV_BYPASS=true` outside development — that's the guard working, not a bug. Fix anything red before touching Vercel; debugging locally is faster than debugging a deploy.

### Step 2 — Sync the live database
From your machine (Supabase CLI, logged in):
```powershell
supabase link --project-ref <your-project-ref>
supabase db push
```
Then spot-check in the Supabase dashboard (Table Editor) that recent tables exist — e.g. `app_settings` from the cost-alert migration. Given this repo's schema-drift history, do this **before** the first deploy.

### Step 3 — Push to GitHub
```powershell
git push origin chore/audit-cleanup
# open PR → merge to master (or push master directly if solo)
```
Vercel will deploy `master` on every push from then on; PRs get free preview URLs.

### Step 4 — Create the Vercel project
1. vercel.com → **Add New… → Project** → import the GitHub repo. Next.js is auto-detected; leave build settings alone.
2. Before deploying, add env vars (Settings → Environment Variables, scope: Production):

| Variable | Value / where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page → anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → service_role key. Server-only — never with a `NEXT_PUBLIC_` prefix |
| `NEXTAUTH_URL` | `https://<your-app>.vercel.app` |
| `NEXTAUTH_SECRET` | run `openssl rand -base64 32`, paste output |
| `NEXT_PUBLIC_DEV_BYPASS` | `false` |
| `WHATSAPP_AUTH_TOKEN` | later, in step 7 |
| `WHATSAPP_VERIFY_TOKEN` | later, in step 7 — any random string you choose |
| `NEXT_PUBLIC_SENTRY_DSN` | later, in step 6 (optional) |

3. Deploy. Then smoke-test on the live URL: log in, open the planta board, check `/api/health`.

### Step 5 — Keep-alive cron
Supabase Free pauses after ~7 days without API activity. Use Vercel Cron (no GitHub 60-day-inactivity rule). Create `vercel.json` in the repo root:
```json
{
  "crons": [
    { "path": "/api/health", "schedule": "0 12 * * *" }
  ]
}
```
Commit, push, redeploy. Verify under Vercel → Settings → Cron Jobs. `/api/health` issues a real Postgres query, so each run counts as activity.

GitHub Actions alternative (if you also want richer scheduled jobs later):
```yaml
# .github/workflows/keep-alive.yml
name: keep-alive
on:
  schedule:
    - cron: "0 12 * * *"
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS https://<your-app>.vercel.app/api/health
```
Caveat: GitHub disables scheduled workflows after 60 days without pushes.

### Step 6 — Sentry (optional, 10 min)
1. sentry.io → sign up (Developer plan, $0) → Create Project → platform "Next.js".
2. Copy the DSN → set `NEXT_PUBLIC_SENTRY_DSN` in Vercel → redeploy.
3. Leave `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` empty (only needed for source-map upload).
4. Throw a test error and confirm it appears in Sentry.

### Step 7 — WhatsApp pipeline (pilot via Twilio Sandbox)
1. twilio.com → free account → Console → **Messaging → Try it out → Send a WhatsApp message** (the sandbox).
2. In sandbox settings, set **"When a message comes in"** to
   `https://<your-app>.vercel.app/api/whatsapp/webhook` (method POST).
3. In Vercel: `WHATSAPP_AUTH_TOKEN` = your Twilio Auth Token (Console dashboard), `WHATSAPP_VERIFY_TOKEN` = any random string. Redeploy.
4. **Signature adapter (required):** the webhook currently verifies HMAC-SHA256 (base64) over the raw body. Twilio actually signs with HMAC-SHA1 over URL + sorted form params (`X-Twilio-Signature`); Meta sends `X-Hub-Signature-256: sha256=<hex>`. Adapt `verifyTwilioSignature` in `src/app/api/whatsapp/webhook/route.ts` to the chosen provider before real traffic — it fails closed, so unmatched signatures are silently rejected with no capture created.
5. Each worker joins once: send `join <sandbox-code>` via WhatsApp to the sandbox number (+1 415 523 8886).
6. End-to-end test: send a realistic production message → confirm it lands in the supervisor review queue in the app.

**Production later:** Meta WhatsApp Cloud API directly — inbound messages free; needs a Meta developer app, business verification, and a phone number not tied to a personal WhatsApp.

### Step 8 — Uptime monitor
uptimerobot.com → free plan → new HTTP(S) monitor on `https://<your-app>.vercel.app/api/health`, 5-min interval, email alerts. Catches both app-down and DB-unreachable (health returns 503 when Postgres is unreachable).

### Step 9 — Backups (don't skip)
Supabase Free has **no automated backups**. Two $0 options:
- Weekly manual: `supabase db dump -f backup.sql` from your machine, keep the last few.
- Automated: a weekly GitHub Action running `pg_dump` against the connection string (stored as a repo secret), uploading the dump as a workflow artifact.
Either way: put a recurring reminder on it. An unpaused-but-corrupted free DB with no dump is unrecoverable.

### Step 10 — Go-live smoke test (run through once, on the live URL)
- [ ] Login / logout works, wrong password rejected
- [ ] Create a VB → OT flow end-to-end
- [ ] Photo upload (attachment) stores and renders back
- [ ] WhatsApp message → review queue (after step 7)
- [ ] Cost-alert banner renders where expected
- [ ] `/api/health` → 200, UptimeRobot green, Sentry received the test error

---

## When money eventually enters
- Supabase Pro ($25/mo): DB > 500 MB, storage > 1 GB, or you want no-pause + real backups. Likely the first paid upgrade.
- Vercel Pro ($20/mo) **or** migrate to Cloudflare Workers / Oracle Always Free VM: when commercial-use terms start to matter beyond pilot.
- Dedicated WhatsApp business number via Meta: when the crew outgrows the Twilio sandbox.
