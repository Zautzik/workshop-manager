# Capture — build plan for local inference

Companion to [`capture-understanding-phase0.md`](capture-understanding-phase0.md), which holds the evidence. This document is the plan: what gets built, in what order, how each step is proved, and where it stops for the owner.

| | |
|---|---|
| Written against | `master @ 3a5da0c`, 2026-10-09 (re-baselined from `701ca43`; see Phase 0 report §0) |
| Evidence | Phase 0 report. Every claim below traces to a numbered section there. |
| House rule | **The owner commits, pushes, runs `supabase db push`, and deletes rows. I do none of those.** Migrations are written as files and left for review. |
| Per-phase gates | `npx tsc --noEmit` clean · `npx eslint src` 0 errors · `npx vitest run` green · `node scripts/smoke.mjs` green under dev bypass · `npm run verify:csp` · `npm run check:migrations` + `check:functions` when SQL changed |
| New npm dependencies | **Zero.** Both model adapters are `fetch`/subprocess. |

---

## 1. Decisions locked

Four answered on 2026-10-09; they are what makes this plan smaller than the original spec.

| Decision | Answer | Consequence |
|---|---|---|
| **Queue scope** | Only what the regex fails on | The regex keeps answering inline and instantly. I1's floor is preserved by construction, not by a flag. The queue stays near-empty. |
| **Images** | Keep today's behaviour | No vision model, no pull, no new capability. The QR path ([`qr-from-photo.ts`](../src/lib/qr-from-photo.ts)) and the OT-evidence path stay as they are. **The only image work is fixing H10**, where a captionless photo is currently *rejected* rather than stored. |
| **Volume** | Under ~30/day, bursts under 10 | Decisive for sizing. One-at-a-time has enormous margin (§2.3). The existing laptop can run the worker. No GPU question for now, so Q-7 is shelved. |
| **Order** | Voice first | Phase 2 is voice. **The text LLM path is deferred to Phase 4 and is conditional.** |

### Defaults I am taking — override any of these and I will adjust

| # | Default | Why |
|---|---|---|
| Q-5 | **Graph v25.0** | Expires 2028-07-29, the longest runway of the mature versions. v20.0 expired 2026-09-24 — **15 days ago**. |
| ~~Q-6~~ | ~~Clear the 9 ESLint errors~~ | **Withdrawn.** Already fixed upstream in `1464eb4` (`eslint-plugin-react-hooks` v7 was crashing, not reporting). The gate is green: 0 errors, 148 warnings. |
| Q-8 | **Both review doors run `resolveFlow`** | That is the point of consolidating them. Door B's behaviour is the complete one. **Flagged loudly:** this means approving from `/operaciones/whatsapp` will start advancing OTs where today it does not. If that is unwanted, say so before Phase 1D. |
| Q-4 | **A restricted database role for the worker**, not the service-role key | A plant PC holding the service-role key is a bigger risk than this feature. Costs one migration. |
| — | Retry policy: 3 attempts, then `failed` + regex fallback, no operator message | §4.7 of the spec: the failure was ours, not the message's. |
| — | Worker concurrency: **1**, global | Matches the answer, the hardware, and Ollama's own per-model serialisation. |
| — | Inbox `status` as `TEXT` + `CHECK`, not a Postgres enum | Extending an enum safely is painful; this table's status set will grow across phases. Deviation from the spec's wording, noted. |

### Still open, and when I need it

| # | Question | Needed by |
|---|---|---|
| **Q-2** | Does a WhatsApp group export exist? What is the go-live date for excluding older rows? **And: can you collect 60–100 real voice notes from 6+ operators next to running presses?** | **Phase 3.** The voice corpus is the gate on everything after it, and it cannot be invented. Start collecting during Phase 1. |
| **Q-3** | Which machine runs the worker, and is it on whenever the plant is? Who tells operators their voice notes are transcribed? | **Phase 2C.** H13: a worker asleep over a weekend wakes outside WhatsApp's 24-hour reply window. |
| **Q-9** | The labelling edge cases (bare number with no unit, "4.800 buenos de 5.000", resmas/cajas, "media hora", a correction inside one message, two people's reports in one message) | **Phase 3**, before anyone labels. |
| **Q-11** | May I `py -m pip install faster-whisper` and download a ~500 MB model? | **Phase 2B.** It installs software on your machine, so I am asking. |

---

## 2. The shape

### 2.1 Dataflow

```
Meta ──> POST /api/whatsapp/webhook                              (Vercel)
   1  tope de tamaño, HMAC, extractMetaInbound (+ audio)
   2  insert_whatsapp_inbound_idempotent(...)      <── ANTES del 200  (I4, I5)
        duplicado -> para acá
   3  texto:  mantención -> parseWhatsAppEvents (sin cambios)
               la regex lo leyó?
                 SÍ  -> processEvent, como hoy        status = parsed_regex
                 NO  -> status = queued (stage=model) [Phase 4; hasta
                                                       entonces: sin leer]
      audio:  status = queued (stage=stt)
      foto:   igual que hoy (QR / evidencia), y AHORA queda guardada
   4  200 a Meta
   5  after(): descargar el audio a Storage           <── la URL de Meta
                                                          dura 5 minutos
                                                          (§4.3)

Planta (una máquina, detrás del NAT, sin puerto abierto):
   worker (uno por vez)
     -> claim: UPDATE ... WHERE status='queued' ... RETURNING
     -> stage=stt:   Storage -> ffmpeg -> faster-whisper -> transcrito
                     -> parseWhatsAppEvents(transcrito)   <── la regex primero
                     -> ¿leyó? SÍ -> processEvent (parsed_regex)
                                NO -> stage=model [Phase 4] | abstained
     -> escribe por el RPC, registra en capture_extractions
     -> pide a Vercel que responda al operario (si la ventana sigue abierta)

   supervisor -> revisa, corrige, aprueba -> costo UNA vez, pasada, OT
```

### 2.2 Why the worker pulls instead of Vercel pushing

Three independent reasons, all grounded in Phase 0 §4:

1. **Vercel cannot reach `127.0.0.1:11434`** on a machine behind the plant's NAT. Decisive on its own.
2. **Meta's media URLs expire in 5 minutes**, so audio must be downloaded by Vercel while the URL lives — which also keeps the Meta token off the plant machine. The worker needs *no* Meta credential.
3. **It is the spec's own mechanism.** §4.2 already specifies `queued_model`, claim-by-`UPDATE ... RETURNING`, and three retry drains. The worker *is* a drain.

### 2.3 Capacity, at the stated volume

| | |
|---|---|
| Measured, 3B text extraction | p50 25 s (Design B) / 92 s (Design C) |
| Transcription | **unmeasured** — benchmark in Phase 2B |
| Worst stated burst | 10 messages |
| If all 10 were queued at 92 s | ~15 min to drain |
| Realistically queued (regex handles most) | 2–3 messages, ~5 min |

At under 30 messages/day the one-at-a-time queue is not a bottleneck and needs no tuning. **Instrument it anyway** (depth, wait, latency) so the number is observed rather than assumed.

---

## 3. Phase 1 — the money path and the inbox · no model, no pull

Justified entirely by confirmed defects. Nothing here depends on any open question or on a model working. Four sub-phases so you can review and commit in digestible pieces; each one leaves the tree green.

### Phase 1A — Stop the bleeding

Smallest possible, independently committable, ship first.

| Step | Files | What |
|---|---|---|
| **1A.1 ✅ done** | **new** `src/lib/whatsapp-graph.ts`; edited `whatsapp-ingest.ts`, `whatsapp-media.ts`, `whatsapp-send.ts` | `GRAPH_VERSION = 'v25.0'` + `graphUrl(path)`, in one module. **Found more than planned:** `whatsapp-ingest.ts:100` held a *private duplicate* of `resolveMetaMediaUrl`, byte-identical to the one `whatsapp-media.ts` exports — and that module's own header had predicted it (*"duplicar la llamada al Graph API … sería la forma segura de que un día una de las dos copias siga usando v20.0 y la otra no"*). Both copies were indeed on the expired v20.0. The duplicate is deleted and the exported function imported, so three call sites became two and the version now has exactly one home. |
| ~~1A.2~~ | — | **Not needed.** The owner fixed these in `1464eb4` before this plan was written; I had audited an older commit. Nothing to do. |

**Acceptance — measured 2026-10-09, all green:**

| Check | Result |
|---|---|
| `grep -rn "graph.facebook.com" src/` | **1 hit**, `whatsapp-graph.ts:42` |
| definitions of `resolveMetaMediaUrl` | **1**, `whatsapp-media.ts:32` (was 2) |
| `npx tsc --noEmit` | clean, exit 0 |
| `npx eslint src` | **0 errors**, 148 warnings (none new) |
| `npx vitest run` | **1058 passed / 67 files** |
| `npm run verify:csp` | passed |
| `npm run check:migrations` / `check:functions` | passed · 67 functions, no new drift (no SQL changed) |

`node scripts/smoke.mjs` not run — needs the dev server up, which is yours to start.

**What a test cannot prove here.** The three endpoints (`GET /{media-id}`, media download, `POST /{phone-number-id}/messages`) are stable across versions, but only a live call confirms v25.0 accepts the same outbound payload. That means **sending a real WhatsApp message to the test number** — a data-producing action, so it is yours to run, not mine. Until it is run, treat 1A.1 as written-and-typechecked rather than verified. The fallback is a one-line revert of the constant.

**Owner:** review, commit, push, then one live send against the Meta test number. No migration, so no `db push`.

### Phase 1B — Define "as today", then fix the lost START

H1 is the feature's flagship message silently losing half of itself. The tests come first because they are what makes the fix provable.

| Step | Files | What |
|---|---|---|
| 1B.1 | **new** `src/lib/__tests__/helpers/fake-supabase.ts` | A chainable recorder fake. `processMessage` needs `.from().select().in().limit().maybeSingle()`, `.from().select().eq()×3.order().limit().maybeSingle()`, `.from().update().eq()`, and `.rpc()`. The existing one-level stub in `sales-scope.test.ts` is too shallow. Records every call so a test can assert *which* RPC was called with *what*. **Not** named `*.test.ts` — the repo has no vitest `include` filter, so any such file would run as a suite. |
| 1B.2 | **new** `src/lib/__tests__/whatsapp-ingest.test.ts` | Characterisation tests pinning today's behaviour: START → RPC with `auto_approved`; END → `inferProductionCosts` then RPC with `pending`; CANCEL; `unknown`; no OT number; **compound**; duplicate wamid. This file is the definition of I1. The pipeline that writes money currently has **zero** tests. |
| 1B.3 | `src/lib/whatsapp-ingest.ts` | Fix H1. Derive the idempotency key in TypeScript: `wamid` for event 0, `wamid#1`, `wamid#2` for the rest. **No migration** — the RPC signature is untouched, which also respects the house rule against two signatures of one function. A redelivery maps to the same keys, so it stays idempotent. |

**Acceptance:** a test delivers `Fin OT 40879, 7600 pliegos, entro OT 40965` with a wamid and asserts **two** rows inserted, both `inserted: true`; redelivering the same envelope asserts **zero** new rows and two `inserted: false`. Before 1B.3 that test fails with the START reported as `duplicate` — run it red first.

**Owner:** review, commit, push.

### Phase 1C — The inbox

H4 and H10. This is also the precondition for the golden set: there is no corpus of what the parser cannot read, and Meta's docs are explicit that *"you will not be able to query historical webhook event notification data."*

| Step | Files | What |
|---|---|---|
| 1C.1 | **new** `supabase/migrations/20261009130000_bandeja_de_entrada_de_whatsapp.sql` | `whatsapp_inbound_messages`: `id`, `external_message_id` (unique partial where not null), `kind` (`text\|audio\|image\|other`), `from_phone`, `body`, `media_id`, `media_mime`, `audio_storage_path`, `transcript`, `transcript_model`, `message_timestamp`, `status` TEXT + CHECK, `queue_stage` (`stt\|model\|null`), `attempts`, `claimed_at`, `last_error`, timestamps. Plus `insert_whatsapp_inbound_idempotent(...)` returning `(id, inserted)`, catching `unique_violation` in an EXCEPTION block — same technique as `insert_whatsapp_log_idempotent`, which is the only reason it is atomic under concurrent redelivery. RLS on; SELECT for admin/manager/supervisor only (the table holds phone numbers); no write policy for `authenticated`. `SECURITY DEFINER SET search_path = public`. Spanish header explaining H4 and quoting Meta's retention sentence. |
| 1C.2 | `src/app/api/whatsapp/webhook/route.ts`, `src/lib/whatsapp-ingest.ts`, `src/app/api/whatsapp/simulate/route.ts` | Write the inbound row **before** the 200. Bodies over 500 chars, unsupported types, and captionless photos are **stored** instead of dropped or rejected (H10). The existing regex path runs exactly as before — proved by 1B.2 still passing untouched. |
| 1C.3 | `src/integrations/supabase/types.ts` | Cannot be regenerated until the owner applies the migration. Until then use the existing pattern — `.from('whatsapp_inbound_messages' as any)` plus a local row type — and **every such cast is listed in the hand-off** for removal after `node scripts/gen-types.mjs`. |

**Acceptance:** a `vitest` test asserts the inbound row is written before `processMessage` is consulted, and that an `audio` message and a 600-character body both land with `status` set and no throw. `scripts/smoke.mjs` stays green.

**Owner:** review, **`npx supabase db push`** (one migration), then `node scripts/gen-types.mjs` and tell me so I can drop the casts. Commit, push.

### Phase 1D — One cost per parte, and a correction that reaches the ledger

H2, H3, H3′. This is the highest-severity cluster: money counted twice, and arbitrary money postable by curl.

| Step | Files | What |
|---|---|---|
| 1D.1 | **new** `supabase/migrations/20261009140000_un_solo_costo_por_parte.sql` | Close the loop both ways at the DB level. `CREATE OR REPLACE FUNCTION feed_whatsapp_to_real_costs(log_id UUID)` — same signature — now also marks the mirrored `capture_events` row `applied`, and **gains the missing `SET search_path = public`** (fixes D-e at the same time). `apply_capture_event` likewise sets `fed_to_system` on the legacy row when `legacy_table = 'whatsapp_production_logs'`. Neither can then be double-applied even if called directly. |
| 1D.2 | **new** `src/lib/capture-review.ts` | One server-side review function, called by both PATCH routes. Validates corrections with Zod to **only** `pliegos_produced`, `merma`, `buenos`, `hours_reported` (non-negative; hours ≤ 24). **Recomputes costs server-side** via `inferProductionCosts` into `corrected_costs`. Applies costs once. Runs `resolveFlow` (Q-8). |
| 1D.3 | `src/app/api/whatsapp/logs/[id]/route.ts`, `src/app/api/whatsapp/logs/batch/route.ts`, `src/app/api/captures/[id]/route.ts` | Both doors delegate to 1D.2. **`corrected_costs` is removed from both request schemas** — door A's `z.record(z.unknown())` and door B's `z.any()` are the H3′ hole, and costs are never taken from the client. |
| 1D.4 | **new** `src/components/workflow/CaptureReviewFields.tsx`; edit `WhatsAppDashboard.tsx` | Editable `pliegos`, `merma`, `buenos` and **`horas`** — `hours_reported` is currently in no component at all, despite being the most frequently reported number. A source badge. New component because `WhatsAppDashboard.tsx` is still over the master plan's 600-line cap — 693 lines at `3a5da0c`, down from 907 after `491a94b` extracted four pieces. |
| 1D.5 | `src/lib/__tests__/capture-review.test.ts` | Approving the same report from either door inserts cost lines **once**. A correction recomputes costs and the recomputed value is what reaches `ot_real_costs`. A request carrying `corrected_costs` is rejected. |

**Acceptance:** 1D.5 green. Manually verifying the double-apply would create real `ot_real_costs` rows, so **I will not trigger it** — the proof is the test plus the two RPC bodies.

**Owner:** review, `db push` (one migration), commit, push.

### Phase 1E — Golden-set tooling and the regex baseline

No model. Produces the number every later decision is measured against.

| Step | Files | What |
|---|---|---|
| 1E.1 | **new** `evals/capture/` + `.gitignore` + `npm run check:golden-private` in CI | `import-whatsapp-export` (Android and iOS formats, multi-line messages, media placeholders, pseudonymised senders), `export-from-db` (reads the new inbox), CSV round trip, `agreement`, `freeze` writing `manifest.json` with per-split/stratum counts and SHA-256 per file. `data/` and `reports/` git-ignored; the check fails if `git ls-files` finds anything under them. **This repo is public** — no real message, transcript, audio, phone number or name is ever committed. |
| 1E.2 | **new** `evals/capture/GUIDELINE.md` | Drafted from the regex's current mapping (hojas→pliegos, unidades/copias→buenos, the waste words→merma), with Q-9's edge cases listed for you to rule on. |
| 1E.3 | **new** `evals/capture/scorer.ts`, `harness.ts` | `--system regex` only. Bootstrap CIs and McNemar in pure TypeScript with unit tests. Entry file run with `tsx`, **never** named `*.test.ts` — the no-include-filter rule means that would run in CI. |

**Acceptance:** `npm run eval:capture -- --system regex --split dev` prints a real baseline on a frozen set.

**Owner:** provide the export and go-live date (Q-2), rule on the guideline (Q-9), label with a second annotator, freeze v1.

---

## 4. Phase 2 — Voice, end to end, with no LLM

The first user-visible win, and the cheapest. Voice notes are discarded today, so captured value is zero and the bar is "beat nothing". **A transcript is ordinary text, so the regex already handles it** — `"termine la OT 40879, 7600 pliegos"` spoken and transcribed is a message `parseWhatsAppEvents` reads today.

### Phase 2A — Accept and store audio

| Step | Files | What |
|---|---|---|
| 2A.1 | `src/lib/whatsapp-intake.ts` | `MetaMessageSchema` gains `audio: { id, mime_type, sha256, voice, url? }`. `NormalizedInbound` carries the media id, mime and the `voice` flag. The **`url` field is new** (rolling out since 2025-11-12) and must stay optional. Audio **skips `InboundMessageSchema`**, whose `body` cannot be empty. |
| 2A.2 | `src/app/api/whatsapp/webhook/route.ts` | Store the inbound row (`kind='audio'`, `status='queued'`, `queue_stage='stt'`), then **in `after()` download the audio to a private `capture-audio` bucket** — because Meta's URL dies in 5 minutes and the worker may be hours away. Caps: over ~2 MB or ~2 minutes is stored but not transcribed, with a short notice. Set `maxDuration` explicitly on the route. |
| 2A.3 | `src/lib/whatsapp-media.ts` | Generalise the `"foto"`-specific error strings, without touching the photo path. |

**Acceptance:** a test asserts an inbound audio envelope yields exactly one row with `queue_stage='stt'` and an `audio_storage_path`, and that redelivery yields none. No transcription yet.

### Phase 2B — Local transcription, benchmarked before it is wired in · **owner-gated (Q-11)**

`faster-whisper` over `whisper.cpp`: Python 3.13.0 is available via the `py` launcher, **cmake is not installed**, so whisper.cpp would need a build step or a prebuilt download while faster-whisper is a pip install. ffmpeg 9.0 is already present.

| Step | What |
|---|---|
| 2B.1 | `py -m pip install faster-whisper`; download `small` (~500 MB). Verify a CTranslate2 wheel exists for Python 3.13 — it is new enough to check rather than assume. |
| 2B.2 | **new** `scripts/capture/transcribe.py` — stdin/argv WAV path → JSON on stdout. Thin on purpose. |
| 2B.3 | **new** `src/lib/capture-stt.ts` — the `SpeechToText` port with **two** adapters: `local-subprocess` (default: ffmpeg → `py transcribe.py`) and `openai-http` (for a cloud swap, the same `/v1/audio/transcriptions` shape §5.6 proved works). At under 30 messages/day, paying model load per message costs nothing and saves running a server. |
| 2B.4 | **Benchmark before wiring:** `small` vs `medium` on real voice notes, measuring field-level capture end to end (audio → transcript → regex → events), not word error rate. Report transcript-only errors separately so failures can be attributed. |

**Acceptance:** a measured table of model × (fields correct, latency p50/p95) on real audio. **If transcription cannot read Chilean plant Spanish reliably, voice-first is wrong and this is where we find out** — before building the worker around it.

**Owner:** approve the install (Q-11); supply voice notes (Q-2).

### Phase 2C — The worker

| Step | Files | What |
|---|---|---|
| 2C.1 | **new** `supabase/migrations/20261009150000_rol_acotado_para_el_worker.sql` | A restricted role (Q-4): claim/update `whatsapp_inbound_messages`, insert `capture_extractions`, execute the two insert RPCs, read the audio bucket. **Not** the service-role key. |
| 2C.2 | **new** `scripts/capture/worker.ts` (`npm run capture:worker`) | Loop: claim one row with a single `UPDATE ... WHERE status='queued' ... RETURNING` so **the database decides the winner, not a prior SELECT** — the rule the wamid migration states for inserts. Concurrency 1. Transcribe, run `parseWhatsAppEvents` on the transcript, write through the RPC when it reads, else `abstained`. 3 attempts then `failed`. Imports the same pure modules as the app (`tsx`, like `scripts/seed/`) so nothing is computed twice. |
| 2C.3 | `src/app/api/whatsapp/webhook/route.ts` + **new** `src/app/api/cron/capture-drain/route.ts` | Two backstops for rows the worker misses: drain a few stale rows per webhook invocation, plus a daily cron (Hobby allows once a day). Add the GET to `scripts/smoke.mjs`'s read sweep. |
| 2C.4 | **new** `src/app/api/capture/reply/route.ts` | The worker cannot talk to Meta (it has no token), so it asks Vercel to send the echo. **Must check message age and skip when the 24-hour customer-service window has closed** (H13), recording why — outside it only approved templates can be sent. |
| 2C.5 | `src/lib/__tests__/capture-worker.test.ts` | Claim is atomic under two simultaneous workers. A `failed` row falls back to the regex. An echo outside 24 h is skipped, not attempted. |

**Acceptance:** a real voice note sent to the test number becomes a `pending` report with a transcript, visible for review, with an echo to the operator — and with Ollama stopped, every typed message still behaves exactly as Phase 1B pinned.

**Owner:** `db push`, decide the worker machine (Q-3), tell the operators about transcription, commit, push.

### Phase 2D — Review surface for voice

| Step | Files | What |
|---|---|---|
| 2D.1 | `CaptureReviewFields.tsx`, `WhatsAppDashboard.tsx` | Source badge (`Regex` / `Voz`), the transcript, an audio player behind a signed URL from an authenticated route, and a **"Mensajes sin leer"** list of `abstained`/`failed`/`queued` with "Reprocesar". |
| 2D.2 | **new** `src/app/api/whatsapp/capture-quality/route.ts` | Volume, abstention rate, supervisor-correction rate, queue depth and latency, by source — with the diagnostics block the README's "empty states explain themselves" principle requires. Added to the smoke sweep. |

---

## 5. Phase 3 — Measure, then decide

Gate, not a build phase. Needs Q-2 and Q-9 answered.

1. Freeze the voice golden set. Score **audio → transcript → regex** end to end.
2. Confirm gates before scoring the test split. Proposed for voice: OT ≥ 97%, each numeric field ≥ 95%, **zero ungrounded numbers**. One run per prompt version; append to `test-runs.log`.
3. Write a one-page go/no-go: what voice captures that was previously lost, what it gets wrong, and whether the residue is large enough to justify Phase 4 at all.

**The stop rule matters here.** If transcript→regex already captures most voice reports, Phase 4 does not happen and the feature is finished — cheaply, with no LLM in production.

---

## 6. Phase 4 — Conditional: the LLM for what the regex cannot read

**Do not start this without a Phase 3 go.** Phase 0 measured the regex reading the founding example correctly while both tested models got it wrong, so this has the highest bar and the weakest evidence.

If it proceeds, it starts from the corrected design, not the original spec:

- **Design C** (§5.5): schema in `format` **and** as prompt text — the vendor's own recommendation, which fixed the dominant truncation failure.
- **D2**: the regex owns the OT number; the model never sees the OT list. It emits `ot_evidence`, and `extractOTNumber()` recovers the digits — 7/7 in Phase 0, including correctly returning `null` for junk.
- **D3**: `done_reason === 'stop'` + schema parse; `think: false`; explicit `num_ctx` with a `prompt_eval_count` assertion; digest not tag; log `prompt_eval_cached_count` to prove prefix caching hits.
- **One provider-agnostic adapter** over the OpenAI-compatible shape (§5.6 proved `json_schema` is enforced), so local and cloud differ by a base URL.
- **Before tuning prompts, try Lever 1** (§6): a purpose-built extractor — **NuExtract** is documented as *"purely extractive, so all text output by the model is present as is in the original text"*, which is validator V4 enforced by training. The two models benchmarked in Phase 0 were general-purpose chat models from the qwen2.5 generation, so "local extraction cannot work" is **not** established.
- **Shadow mode first.** It records what would have happened and changes nothing.

---

## 7. What could stop this, honestly

| Risk | Where it shows | If it happens |
|---|---|---|
| Transcription cannot read plant Spanish over press noise | Phase 2B benchmark, before the worker exists | Voice-first is wrong. Fall back to Phase 1 plus the cloud design, or better microphones. Cheap to discover because 2B precedes 2C. |
| No voice corpus materialises | Phase 3 cannot run | Phases 1 and 2 still ship and still pay for themselves; the gate just stays unproven. Start collecting in Phase 1. |
| Worker machine is off when the plant is on | H13, delayed echoes | Rows wait; no message is lost (I4 + Meta's 36 h retries). Operators stop trusting the echo, which is the real cost. Q-3. |
| Q-8 is wrong and OTs should not advance from door A | Phase 1D changes plant behaviour | Say so before 1D; it is a one-line switch in `capture-review.ts`. |
| `ctranslate2` has no Python 3.13 wheel | Phase 2B.1 | Use a prebuilt whisper.cpp Windows release instead; the port (2B.3) is unchanged either way. |

---

## 8. Sequence at a glance

| Phase | Needs a model? | Pull? | Migration | Blocked on |
|---|---|---|---|---|
| **1A** stop the bleeding | no | no | — | nothing — **start here** |
| **1B** pin behaviour, fix H1 | no | no | — | nothing |
| **1C** the inbox | no | no | 1 | nothing |
| **1D** one cost per parte | no | no | 1 | Q-8 if you disagree |
| **1E** golden-set tooling | no | no | — | Q-2, Q-9 for the data |
| **2A** accept audio | no | no | — | 1C |
| **2B** local STT | STT only | **yes** | — | **Q-11** |
| **2C** the worker | no LLM | no | 1 | Q-3, Q-4, 2B passing |
| **2D** review surface | no | no | — | 2C |
| **3** measure and decide | no | no | — | Q-2, Q-9 |
| **4** LLM, conditional | yes | maybe | 1 | a Phase 3 go |

Phase 1A can start immediately: it needs no answers, no model, no migration, and it fixes a Graph version that expired 15 days ago.

---

## 9. Working-tree state

Nothing has been committed, pushed, or applied to the database. No migration has been written yet — the filenames above are the plan, not files on disk. `AGENTS.md` and `CLAUDE.md` remain untracked; `next dev` writes them and they should be committed with the next piece of work. Per AGENTS.md, I will read the relevant guide under `node_modules/next/dist/docs/` before writing route or `after()` code in any phase.
