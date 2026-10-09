# Capture Understanding — Phase 0 report

**Local-inference variant (Ollama).** Report only. No production code, no migration, no commit.

| | |
|---|---|
| Spec applied | `Capture Understanding: build spec for Claude Code`, §0 Phase 0 |
| Spec read against | `master @ 0f87509` |
| **This report read against** | **`master @ 701ca43`**, 2026-10-05 |
| **Re-baselined** | **`master @ 3a5da0c`**, 2026-10-09 — see §0 |
| Repo facts | Read. Executed where the row says *executed*. No database writes. |
| Benchmarks | Executed on the owner's laptop, 2026-10-05. Numbers are real and reproducible. |
| Deviation requested | Yes — five. §7. The first is structural and blocks Phase 2 until ruled on. |
| Vendor documentation | Read 2026-10-05 from primary sources only. Every page cited in §12. Two vendor pages contradicted each other and one contradicted my own first draft; both are resolved by experiment, not by preference. |

---

## 0. Re-baseline, 2026-10-09

This audit was read against `701ca43`. **The branch has since advanced 22 commits to `3a5da0c`**, and the whole of §2–§3 was re-checked against it on 2026-10-09 before any code was written. What changed:

| Claim | At `701ca43` | At `3a5da0c` |
|---|---|---|
| `npx eslint src` | 9 errors, 115 warnings — "the gate is RED" | **0 errors, 148 warnings — the gate is GREEN** |
| `npx vitest run` | 993 tests, 60 files | **1058 tests, 67 files** |
| `WhatsAppDashboard.tsx` | 907 lines | **693 lines** |
| **Q-6** (the lint-gate question) | open | **withdrawn — nothing to decide** |

**The 9 errors were real, and the owner already fixed them.** `1464eb4 build(deps)` records the cause precisely: `eslint-plugin-react-hooks` jumped to v7 via `eslint-config-next 16.4.0` and *"su analizador nuevo literalmente revienta — no reporta, crashea — con `useMemo(fn, [])` sin arrow inline"*. So my §2.3 reading was correct for its commit and is now obsolete. `71560fd` added the 65 new tests (auth, rate-limiting, middleware — **not** the capture pipeline), and `491a94b` decomposed the dashboard.

**Re-verified as still true at `3a5da0c`** — these are the findings the plan is built on, so they were checked individually, not assumed:

- **H1** — `whatsapp-ingest.ts` untouched by all 22 commits. Confirmed live.
- **H3′** — door A's `ReviewSchema` still accepts `corrected_costs: z.record(z.unknown())`. `1464eb4` touched that file but only added an `as any` to the `.update()` call for stricter `@supabase/supabase-js` types. **Confirmed live.**
- **No `whatsapp-ingest.test.ts`** — the pipeline that writes money still has zero tests. Confirmed.
- **H2, H4, H5, H6, H7** — no migration or route in the range alters them. `20261007120000` only mentions `capture_events` in a comment about FK cascades.

**Lesson worth keeping:** an audit is a photograph. This one aged 22 commits in four days. Anything below that is load-bearing gets re-checked at the moment it is used, not trusted because it is written down.

---

## 1. Headline

Three things came out of Phase 0, in descending order of confidence.

1. **The capture pipeline has live defects in the money path that need no model to fix.** H1 loses the START of the plant's canonical compound report — the founding example of this whole feature — every time it arrives from Meta. H2 lets one report's costs reach `ot_real_costs` twice. H3′ lets a supervisor-role token post arbitrary money into `ot_real_costs` by curl. H5 is now past its expiry date, not approaching it. All of Phase 1 is justified on this alone.

2. **Local extraction, as the spec designs it, does not work on this hardware with the two models I tested.** Measured: `qwen2.5:3b` is fast enough (p50 25 s) and wrong in ways that matter; `qwen2.5:7b` took **6.9 minutes for one message** and was *worse*, writing `ot_number: "siete mil seiscientos"` — the Spanish words for 7600 — into the OT field. Both invented the same quantity, `48000`, by lifting it out of the active-OT list in the prompt. The regex read the same message correctly.

   **Scope that claim carefully.** Both models are general-purpose chat models from the qwen2.5 generation, which is roughly two years old. The documentation sweep found models purpose-built for this job — notably **NuExtract** (3.8B), documented as *"purely extractive, so all text output by the model is present as is in the original text"*, which is validator V4 enforced by training. Those are untested. So: **these models are unfit; "local extraction cannot work" is not established** (§6, Lever 1, and Q-10). The *latency* finding is independent of model choice and stands.

3. **The two failures above point at the same redesign, and it makes the model's job much smaller.** The models located the OT correctly in `ot_evidence` while mangling `ot_number`; `extractOTNumber()` recovers the digits from that fragment in 7/7 cases. And the plant's voice notes don't need an LLM at all for the common case — transcribe locally, then feed the transcript to the regex that already exists. §7 and §8.

**Recommendation: approve Phase 1 as specified. Do not approve Phase 2's text path on this hardware.** Re-point the model work at voice, where the regex currently scores zero and the bar is therefore "beat nothing" rather than "beat a parser that already works".

---

## 2. §2 verified against `701ca43`

### 2.1 Matches the spec

Read, not executed, except where noted.

| Spec claim | Verified at |
|---|---|
| Next 16 App Router, params as Promise, zod `^3.25.76`, no LLM dependency | `package.json` — zero deps matching `anthropic\|openai\|ollama\|langchain` |
| Webhook: 256 KB cap *before* HMAC, `extractMetaInbound`, `InboundMessageSchema` per message, `after(mediaTask)`, always 200 to Meta | [route.ts:60-118](../src/app/api/whatsapp/webhook/route.ts#L60-L118) |
| Ingest: rate limit 30/min keyed on sender, maintenance tried first, `findEmployeeByPhone`, `parseWhatsAppEvents`, `processEvent` per event | [whatsapp-ingest.ts:506-556](../src/lib/whatsapp-ingest.ts#L506-L556) |
| START → RPC as `auto_approved`; END → `inferProductionCosts` then RPC as `pending` | [whatsapp-ingest.ts:297-436](../src/lib/whatsapp-ingest.ts#L297-L436) |
| `insert_whatsapp_log_idempotent` is the only writer; partial unique index; catches `unique_violation` in an EXCEPTION block | [20260906120000](../supabase/migrations/20260906120000_wamid_es_la_llave_de_idempotencia.sql) |
| `mirror_legacy_capture` is one-way legacy → `capture_events`, and overwrites `parsed_data`, `corrected_data`, `corrected_costs` on UPDATE | [20260629200000:39-60](../supabase/migrations/20260629200000_capture_mirror_triggers.sql#L39-L60) |
| `appliesWithoutReview` defined, called nowhere in `src` | `whatsapp-flow.ts:238`; only callers are its own tests |
| `ParsedProductionData` keys as listed | [whatsapp-production.ts](../src/types/whatsapp-production.ts) |
| `normalize` and `parseChileanNumber` are module-private | `whatsapp-parser.ts:32`, `:46` |
| No tests for the ingest pipeline | no `src/lib/__tests__/whatsapp-ingest.test.ts`; 58 test files exist, none covers it |
| Vitest has no `include` filter → any `*.test.ts` anywhere runs | [vitest.config.ts](../vitest.config.ts) |
| Graph `v20.0` hardcoded at three sites | `whatsapp-ingest.ts:103`, `whatsapp-media.ts:35`, `whatsapp-send.ts:46` |
| `checkRateLimit` is a module-level `Map` — per instance, not a spending guard | `rate-limiter.ts:19` |
| `processEvent` is not exported (Phase 2 would need it) | `whatsapp-ingest.ts` exports only `redactPhone`, `findEmployeeByPhone`, `processMessage`, two schemas, two types |
| App is on Vercel, Hobby-shaped cron (once daily) | [vercel.json](../vercel.json) |
| No route sets `maxDuration` | `grep -rn maxDuration src/` → nothing |

### 2.2 Differs from the spec

Five differences. Two matter.

**D-a. Captionless photos are no longer dropped — on the production webhook they are now *rejected*.** §2.2 says any non-text type without a caption "is counted in `ignored` and dropped". Not true at HEAD: `extractMetaInbound` emits a message with `media_only: true` and `body: ''` ([whatsapp-intake.ts:247-251](../src/lib/whatsapp-intake.ts#L247-L251)). But `InboundMessageSchema` requires `body` to be 1–500 chars ([whatsapp-ingest.ts:35](../src/lib/whatsapp-ingest.ts#L35)), so on the production webhook that message fails `safeParse` and comes back `{ status: 'invalid' }` — stored nowhere. Only the *warehouse* webhook handles `media_only` ([warehouse/webhook/route.ts:359](../src/app/api/whatsapp/warehouse/webhook/route.ts#L359)). Logged as **H10**.

**D-b. Door A already accepts `corrected_costs` from the client.** §2.2 mentions only `corrected_data`. The route's `ReviewSchema` takes both as `z.record(z.unknown())` ([logs/[id]/route.ts:13-18](../src/app/api/whatsapp/logs/[id]/route.ts#L13-L18)) and writes them straight to the row, and `useReviewWhatsAppLog` already plumbs both ([use-whatsapp.ts:99-111](../src/hooks/use-whatsapp.ts#L99-L111)). The spec's conclusion still holds — `handleReview` sends only `{ id, action, comments }` ([WhatsAppDashboard.tsx:345-353](../src/components/workflow/WhatsAppDashboard.tsx#L345-L353)) — but the *route* is far more permissive than the spec describes, and that is a hole rather than a head start. See **H3′**.

**D-c. Door B takes `corrected_costs: z.any()`** — unvalidated by construction ([captures/[id]/route.ts:16](../src/app/api/captures/[id]/route.ts#L16)).

**D-d. A migration the spec does not list:** `20260911120000_whatsapp_aprende_a_hablar.sql`. Phase 1 must read it before touching outbound.

**D-e. `feed_whatsapp_to_real_costs` has no `SET search_path = public`** ([20260410120000](../supabase/migrations/20260410120000_whatsapp_production_tracking.sql)), breaking the house rule for `SECURITY DEFINER` functions. Pre-existing, April, out of this feature's scope — reported, not fixed.

### 2.3 Gate baseline — executed

> **Superseded by §0.** The figures below are the `701ca43` reading. At `3a5da0c` the gate is **green**: 0 errors, 148 warnings, 1058 tests in 67 files. Kept for the record, because the diagnosis of the 9 errors turned out to matter.

| Gate | Result at `701ca43` |
|---|---|
| `npx tsc --noEmit` | **clean**, exit 0 |
| `npx vitest run` | **993 tests in 60 files, all pass** (the spec said "about 900") |
| `npx eslint src` | **124 problems: 9 errors, 115 warnings — the gate is RED** |

The 9 were 8 × `react/no-unescaped-entities` in `PautasPanel.tsx:272` and `VencimientosPanel.tsx:341`, and 1 × `react-hooks/use-memo` in `CalibracionMotor.tsx:369`. I called them cosmetic. They were in fact the symptom of `eslint-plugin-react-hooks` v7's analyser **crashing** rather than reporting — the owner diagnosed and fixed that in `1464eb4` two days later. **Q-6 is withdrawn.**

`smoke.mjs` and `verify:csp` were not run — they need the dev server up, and starting it is the owner's call.

---

## 3. Hazards

Evidence standard: a failing test where one is possible, otherwise a file-and-line trace. **No hazard below was proven by writing to the database** — that would create real rows, which is the owner's call and not needed to establish any of them.

### H1 — Compound messages collide on the wamid · **CONFIRMED**

Executed:

```
mensaje: Fin OT 40879, 7600 pliegos, entro OT 40965
eventos: 2
  [0] type=end   ot=40879 pliegos=7600 conf=70
  [1] type=start ot=40965 pliegos=null
```

The chain:

1. `processMessage` builds **one** `ctx` with `messageId: input.message_id ?? null` and loops both events through it ([whatsapp-ingest.ts:543-553](../src/lib/whatsapp-ingest.ts#L543-L553)).
2. Both branches of `processEvent` pass `p_external_message_id: messageId` ([:308](../src/lib/whatsapp-ingest.ts#L308), [:389](../src/lib/whatsapp-ingest.ts#L389)).
3. `idx_wa_logs_external_message_id` is unique on `external_message_id` alone.
4. So the END inserts; the START raises `unique_violation`; the RPC's EXCEPTION branch returns **the END's row id** with `inserted: false`; `processEvent` reports `{ status: 'duplicate', type: 'start' }`.

**Effect: the plant's canonical report silently loses its START whenever it arrives from Meta.** OT 40965 never opens, so its eventual END finds no START, `elapsedMinutes` is null, and the labour cost of that job is never inferred. The simulator cannot reveal this because it sends no wamid, and `whatsapp-ingest.ts` has no tests. This is the feature's own flagship example, broken in production today.

### H2 — Two review doors, two guards, one pot of money · **CONFIRMED**

Both guards exist and neither can see the other:

- `apply_capture_event` refuses if `capture_events.applied`, inserts into `ot_real_costs`, then sets `capture_events.applied = true` ([20260629190000:23-45](../supabase/migrations/20260629190000_capture_apply_user_guard.sql#L23-L45)). It never touches `whatsapp_production_logs`.
- `feed_whatsapp_to_real_costs` refuses if `whatsapp_production_logs.fed_to_system`, inserts into `ot_real_costs`, then sets `fed_to_system = true` ([20260410120000](../supabase/migrations/20260410120000_whatsapp_production_tracking.sql)). It never reads `capture_events`.

Door B writes only `capture_events` ([captures/[id]/route.ts:48-52](../src/app/api/captures/[id]/route.ts#L48-L52)), so after approving there the legacy row is still `pending` with `fed_to_system = false` — it stays in door A's queue, and approving it there inserts **a second set of cost lines for the same report**. Add the mirror: it is one-way and overwrites `corrected_data`/`corrected_costs` on every legacy UPDATE, so a correction saved only through door B is erased by the next touch of the legacy row. And door A never runs `resolveFlow`, so the same approval advances the OT from one screen and not from the other.

### H3 — A supervisor cannot correct a reading · **CONFIRMED** · and H3′ is worse

As specified: `handleReview` sends `{ id, action, comments }` only, and `hours_reported` appears in **no** component (`grep -rn hours_reported src/components/` → nothing), so the field the spec calls the most frequently reported number in real messages is invisible to the person approving it.

**H3′ — new, and the most serious thing found.** Door A accepts `corrected_costs` from the request body and writes it to the row unvalidated (D-b), and `feed_whatsapp_to_real_costs` uses `COALESCE(v_log.corrected_costs, v_log.inferred_costs)`. So a holder of any `supervisor`, `admin` or `manager` session can `PATCH /api/whatsapp/logs/[id]` with hand-written `cost_lines` and have them land in `ot_real_costs` — the table the margin is computed from. Not reachable from the current UI; reachable with curl. Door B has the same shape via `z.any()` (D-c). The spec's §4.9 rule — *costs are never taken from the client* — is the fix, and it is a fix for today's code, not only for the new feature.

### H4 — Unread messages leave no trace · **CONFIRMED**

No table stores inbound messages; `whatsapp_production_logs` requires `ot_number` and `raw_message` NOT NULL and is only written for recognised events. A message with no OT, an `unknown` classification, a body over 500 chars, audio, or a captionless photo (H10) is answered and forgotten. There is no corpus of what the parser cannot read — which is also why §6.1's golden set cannot be built from the database until this is fixed. **Phase 1 must land the inbox before the evaluation can be built from real data.**

### H5 — Graph API v20.0 · **CONFIRMED, and now urgent**

Meta's changelog: v20.0 was released 2024-05-21 with expiry **2026-09-24**. Today is **2026-10-05** — it expired 11 days ago. This is no longer preventive maintenance; three live call sites (media resolve, media download, outbound send) target an expired version. Currently available: v21.0 (to 2027-01-21), v22.0, v23.0, v24.0 (to 2028-02-18), v25.0 (to 2028-07-29), v26.0. **Q-5** picks the target; v24.0 or v25.0 gives a multi-year runway.

### H6 — The "mensajes reales" fixtures are seed data · **CONFIRMED**

Six strings appear verbatim in both `whatsapp-parser.test.ts` and `seed_10_whatsapp_realcosts.sql`:

```
OT 40494 lista, 6 horas offset turno noche
cajas hogarmax 40492 terminadas, barniz uv 5 hrs
listo 40499, 3.5 horas offset, 12 planchas
promo distribuidora 40488 impresa, 8 hrs ryobi 2
termine pre prensa 40500, 2 horas
troquel 40498 terminado 4 hrs, 1 reventón ajustado
```

`NOTES.md` §10 confirms the mechanism — the seed generates messages *as text* and runs them through the production parser, and a test closes the loop. Excellent discipline for a seed that cannot lie; useless as evidence about how the plant writes. §6.1's exclusion of everything under `supabase/seeds/` and `scripts/seed/` stands.

### H7 — `checkRateLimit` is not a spending guard · **CONFIRMED, and reclassified**

True as written. But with local inference there is no bill, so the guard that matters changes shape: the plant machine has **one** CPU pool, and at the measured 25 s–7 min per message a burst does not cost money, it builds an unbounded queue and starves whatever else that machine does. The guard becomes **queue depth and worker concurrency**, not a daily token cap. §7, D4.

### New hazards

**H8 — the context window is small by default, and what happens when you exceed it is undocumented.** The model's own `qwen2.context_length` is 32768, but `ollama ps` reported it loaded at `CONTEXT 4096` — which the context-length page confirms is the documented default for a machine with under 24 GB of VRAM. §4.5 of the spec wants a prompt carrying rules, a glossary built from the keyword tables, six to ten few-shot examples and a capped OT list; that is plausibly over 4k, and 4k is what this class of machine gets by default.

The danger is what the vendor does *not* say. Ollama's docs state the defaults and how to change them, and say nothing about over-long prompts — no statement that input is truncated, and none about which end is cut. The conventional llama.cpp behaviour is to drop from the front, which is where the rules live, so the failure would present as a model that quietly stopped obeying its instructions rather than as an error. **Because the behaviour is undocumented, do not rely on it in either direction:** set `num_ctx` explicitly on every call and have the adapter assert `prompt_eval_count < num_ctx`, treating a breach as a failed extraction. Grounded by §4.1; the mitigation is ours, not the vendor's.

**H9 — a model tag is mutable.** `qwen2.5:7b` is a moving pointer; `ollama pull` can change what it means and silently invalidate a frozen evaluation. `/api/tags` returns a per-tag digest (`qwen2.5:3b → 357c53fb659c5076`, `qwen2.5:7b → 845dbda0ea48ed74`). Record the **digest**, not the tag, in `capture_extractions`. This is the local equivalent of §3.1's "pin a dated snapshot".

**H10 — a captionless photo on the production webhook is rejected, not stored.** D-a. Worse than the spec's "dropped", because `{ status: 'invalid' }` also tells Meta nothing is wrong. Folded into H4's fix.

**H11 — grammar-constrained output is not complete output.** Proven: four probe calls returned `done_reason: 'length'` and **invalid, truncated JSON** mid-string, despite `format` carrying a JSON schema. Ollama's docs do not warn about this. So V1 must assert `done_reason === 'stop'` *and* schema-parse — the same discipline §3.1 specifies for Claude's `stop_reason: max_tokens`, independently confirmed necessary here. This also makes `think: false` mandatory (§4.1): a thinking model spends the same `num_predict` budget on reasoning and would truncate its own answer.

**H12 — the 256 KB body cap is a bet on envelope size.** Meta batches notifications *"with a maximum of 1000 updates"* and says batching *"cannot be guaranteed"*. A large batch would exceed the cap, get a 413, be retried for 36 hours and then be dropped. Near-theoretical for a plant with a handful of operators, and the cap defends a real event-loop concern, so **no change proposed** — recorded so the number gets revisited if the group grows.

**H13 — a delayed worker can miss the 24-hour reply window.** Free-form WhatsApp messages can only be sent while the customer-service window is open; outside it, only approved templates. A pull worker decouples the reply from the message, so a Monday drain of a Friday report would attempt a send that cannot succeed. The echo in §4.10 must check message age and skip the reply, recording why, when the window has closed. Grounded in §4.3.

### Dropped

None. H1–H7 all stand.

---

## 4. Vendor facts — local stack

Every claim below was read from the vendor's own documentation on 2026-10-05, with the page named. This section replaces §3.1–§3.4 of the spec. Where a vendor page is silent on something this design depends on, that is recorded as silence rather than filled in.

### 4.1 Ollama

Installed here: **0.12.5**. Models present: `qwen2.5:3b`, `qwen2.5:7b`, `qwen2:latest`, `llama3.2:latest`, `gpt-oss:20b`.

Sources: [api/chat](https://docs.ollama.com/api/chat.md), [capabilities/structured-outputs](https://docs.ollama.com/capabilities/structured-outputs.md), [capabilities/thinking](https://docs.ollama.com/capabilities/thinking.md), [context-length](https://docs.ollama.com/context-length.md), [gpu](https://docs.ollama.com/gpu.md), [api/openai-compatibility](https://docs.ollama.com/api/openai-compatibility.md). An OpenAPI spec is published at `docs.ollama.com/openapi.yaml`.

**Structured output.** `POST /api/chat`, `stream: false`, `format` taking either `"json"` or a **JSON Schema object**. The docs demonstrate `type`, `properties`, `required` and `items`; they do **not** state whether `enum`, `anyOf`, `additionalProperties`, `minimum`/`maximum` or `minItems` are honoured. Measured here: `enum`, `anyOf` nullables and `additionalProperties: false` are all accepted, and the `enum` was respected in output (`barniz`, `uv_localizado`). Numeric and length constraints were not exercised. Treat anything beyond `type`/`properties`/`required`/`items`/`enum`/`anyOf` as unverified.

**Two official recommendations — one of which Phase 0's first probe did not follow:**

- *"Lower the temperature (e.g. set it to `0`) for more deterministic completions."* — followed.
- *"It is ideal to also pass the JSON schema as a string in the prompt to ground the model's response."* — **not** followed in §5.1/§5.2. Re-measured in §5.5; it is not free on CPU.

**Context length.** The default is derived from available VRAM: **under 24 GB → 4k tokens**, 24–48 GB → 32k, 48 GB+ → 256k. Set per request with `options.num_ctx`, or server-wide with `OLLAMA_CONTEXT_LENGTH`. `ollama ps` shows the allocated context and the CPU/GPU split — it reported `CONTEXT 4096` here, matching the documented default for a 2 GB-VRAM machine. **The docs do not say what happens when a prompt exceeds the window** — no statement about truncation or which end is cut. H8 therefore stands as an undocumented risk to guard in code, not a documented behaviour to rely on.

**Response fields** (all confirmed in the reference): `message.content`, `done`, `done_reason`, `total_duration`, `load_duration`, `prompt_eval_count`, **`prompt_eval_cached_count`**, `prompt_eval_duration`, `eval_count`, `eval_duration`. The documented example shows `done_reason: "stop"`; the full set of values is not published. `length` was observed empirically (H11).

Two of these change the design:

- **`prompt_eval_cached_count` means prefix caching is real and measurable.** On CPU, prompt evaluation was the dominant cost (636–884 tokens per call). A worker that holds the model with `keep_alive` and sends a **byte-identical** static prefix every time can have that prefix cached. This is the cheapest available latency win, and it costs nothing but discipline: the static part of the prompt must never vary — which §4.5 of the spec already requires for `PROMPT_VERSION` hashing. Phase 2 should log `prompt_eval_cached_count` and prove the cache is actually hitting rather than assume it.
- **`think` must be explicitly disabled.** `think` accepts `true`, `false`, `null` or a named level, and `/api/show` reports per-model support. The docs do **not** address how thinking interacts with `format`. Given H11 — reasoning tokens consume the same `num_predict` budget as the answer — a thinking model left on its default would truncate its own JSON. Set `think: false` wherever `/api/show` says it is supported, and never adopt a thinking model without re-testing truncation.

**Available but not proposed for v1:** `logprobs` / `top_logprobs`. The spec's §4.6 derives confidence from validators and rejects model self-reported confidence — correctly, since a stated confidence is just more generation. Token logprobs are a different and more honest signal and could feed the Phase 2 `disagreement` flag. Out of scope here.

**A contradiction inside Ollama's own docs — now resolved.** The structured-outputs page says structured outputs work *"through the OpenAI-compatible API using the `response_format` parameter"*; the openai-compatibility page lists `response_format` but documents only JSON **mode**, with no `json_schema`. **Tested in §5.6: the structured-outputs page is right.** `json_schema` is enforced on `/v1/chat/completions`, `json_object` is not, and `/api/chat` with `format` behaves identically to `json_schema`. So the adapter can be **one provider-agnostic path** over the OpenAI-compatible shape, which also matches the STT port (§4.2). Documented here because the compatibility page would have led us to the wrong design.

**Ollama Cloud does not support structured outputs** (stated on the structured-outputs page). This feature cannot be shifted to Ollama's hosted offering as a fallback; the fallback is the regex (I1).

**Hardware.** NVIDIA requires compute capability 5.0+; AMD via ROCm/HIP; Apple via Metal. Relevantly: **a Vulkan backend provides GPU acceleration for Intel and AMD hardware on Windows and Linux when drivers are installed.** This machine's Intel UHD iGPU may therefore be partially usable, which is worth ten minutes of testing before anyone buys hardware (§6). The docs do **not** document what decides GPU versus CPU placement, nor give any performance or memory figures per model size — so every number in §5 and §6 is mine, not the vendor's.

**Cost.** No per-token price. The scarce resource is CPU wall-clock on a machine the plant owns.

### 4.2 Speech to text, local

Source: [github.com/ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp). Not yet benchmarked — no voice corpus exists (Q-2).

- **Input format:** 16-bit WAV. The documented conversion is `ffmpeg -i input.ogg -ar 16000 -ac 1 -c:a pcm_s16le output.wav`. **ffmpeg 9.0 is already on this machine** and WhatsApp sends `audio/ogg; codecs=opus`, so the conversion is one documented command and no new dependency.
- **Model footprint:** tiny 75 MiB / ~273 MB RAM · base 142 MiB / ~388 MB · **small 466 MiB / ~852 MB** · medium 1.5 GiB / ~2.1 GB · large 2.9 GiB / ~3.9 GB. A `small` or `medium` multilingual model is the sensible starting point for Chilean Spanish, and either fits comfortably alongside a 3B extraction model inside 15.7 GB.
- **It ships an HTTP server.** `whisper-server` provides an *"HTTP transcription server with OAI-like API"*, so the spec's §4.3 `SpeechToText` port survives unchanged — the adapter is the same `fetch` against `/v1/audio/transcriptions` either way, and the provider stays swappable.
- **No official CPU throughput figures** are published; the project points at a community benchmark issue. Voice latency is therefore unmeasured and must be measured in Phase 2, not assumed.

This remains the one place where going local is better on every axis the spec cares about: §4.1 I10 ("minimal data leaves") becomes *nothing leaves*, and most of §5's data-handling problem dissolves — no plant audio, transcript or phone number reaches a third party at all.

### 4.3 WhatsApp Cloud API

Sources: [inbound audio webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio/), [media reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media), [send-messages guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages), [webhooks getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started), [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/versions).

**Inbound audio.** Confirmed as §3.2 of the spec describes, plus one addition:

```json
{ "audio": {
    "mime_type": "audio/ogg; codecs=opus",
    "sha256": "wvqXMe6n7n1W0zphvLPoLj+s/NtKqmr3zZ7YzTP7xFI=",
    "id": "1908647269898587",
    "url": "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=133...",
    "voice": true } }
```

`voice` is *"true if the audio is a recording made with the WhatsApp client voice recording feature"*, false for a forwarded or uploaded file. The **`url` field is new** — the reference notes a rolling deployment as of 2025-11-12 — so the media id may not need resolving at all. It must still be treated as optional, since the rollout is not stated to be complete.

**Media download, and the fact that moves the design.** Media URLs **expire after five minutes**: *"after which you must query the ID again to get a new URL."* Downloading requires the access token — *"if you omit your token, the request will fail."* Audio formats include OGG at up to **16 MB**.

> **This refines D1.** A pull worker may not reach a row for minutes, hours, or a weekend. A five-minute URL cannot survive that. So **Vercel must download the audio inside `after()` and put it in Supabase Storage before the URL dies**, and the worker reads it from Storage. That is a clean split which also keeps the Meta access token on Vercel and off the plant machine: *Vercel owns all Meta I/O; the worker owns only inference.* The spec's §4.11 already places the download in the deferred task, so this confirms its shape — and makes it a hard constraint on anyone tempted to move the download into the worker.

**Delivery guarantees — official backing for I4 and I5.** Meta expects `200 OK`. On failure it *"will retry immediately, then try a few more times with decreasing frequency over the next 36 hours."* Duplicates are expected: *"Your server should handle deduplication in these cases."* And decisively for H4:

> *"You will not be able to query historical webhook event notification data, so be sure to capture and store any webhook payload content that you want to keep."*

That is the vendor stating the spec's I4 as a requirement. It also resizes H1: the window in which a redelivery can arrive is **36 hours**, not the 60 seconds the pre-wamid code assumed — which is exactly the argument the wamid migration's own header makes.

**The 24-hour customer service window — a new constraint on §4.10.** Free-form (non-template) messages may only be sent while the window is open. It opens when the user messages or calls, resets on each further message, and once closed *"you can only send pre-approved template messages."*

> **New hazard H13.** A pull worker decouples the reply from the message. If the plant machine is off over a weekend, a Monday drain would try to echo a Friday report from outside the window, and the free-form send will fail. The echo in §4.10 must therefore check the message's age and **skip the reply, recording why, when the window has closed** — rather than attempt a send that cannot succeed. This is a second, independent reason the worker should run whenever the plant does (Q-3).

**Graph versions.** v20.0: released 2024-05-21, expiry **2026-09-24** — **11 days in the past**. Available: v21.0 (to 2027-01-21), v22.0 (to 2027-05-20), v23.0 (to 2027-10-08), v24.0 (to 2028-02-18), v25.0 (to 2028-07-29), v26.0 (released 2026-07-29). H5 is live breakage risk; Q-5 picks the target.

**One more, low priority.** Webhook notifications are *"aggregated and sent in a batch with a maximum of 1000 updates"*, and batching *"cannot be guaranteed"*. The route caps the body at 256 KB and returns 413 above it. A genuinely large batch would exceed that, be rejected, and be retried for 36 hours before being dropped. For a plant with a handful of operators this is near-theoretical, and the cap defends a real event-loop concern, so I am **not** proposing a change — only recording that the cap is a bet on envelope size, and the number deserves revisiting if the group grows. Logged as **H12**.

### 4.4 Vercel — and a correction to my own earlier claim

Source: [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations) (page last updated 2026-08-24).

| | Hobby |
|---|---|
| Max duration (Fluid compute) | **300 s default *and* maximum** |
| Memory | 2 GB / 1 vCPU |
| Request/response body | 4.5 MB |
| Billing | active CPU time; *"waiting for I/O (e.g. calling AI models, database queries) does not count towards active CPU time"* |

**Correction to §4.3 of my first pass.** I implied the duration ceiling was independently decisive against calling a model from `after()`. Read precisely, it is not:

- `qwen2.5:7b` at **414 s measured** exceeds the 300 s hard ceiling. Decisive.
- `qwen2.5:3b` at **p50 25 s, max 121 s** fits inside 300 s with margin — and the waiting would not even bill as active CPU.

So **the decisive argument for D1 is reachability, not duration**: Vercel cannot reach `127.0.0.1:11434` on a machine behind the plant's NAT. Duration is a hard blocker only at 7B and above. Better to state that precisely than to lean on a limit that does not bind at 3B.

Noted and rejected: Vercel **Workflows** are offered for *"workloads that require unlimited execution time"*. They solve duration, not reachability, so they do not help here.

### 4.5 Supabase

Source: [storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits). The Free plan caps uploads at **50 MB** globally, with a per-bucket `fileSizeLimit` that cannot exceed the global cap. WhatsApp caps audio at 16 MB and the spec's §4.11 caps it far lower (~2 MB), so the audio bucket is unconstrained in practice. Total Free-plan storage is not stated on that page; the spec's 1 GB figure is carried forward as spec-sourced, and retention (`CAPTURE_AUDIO_RETENTION_DAYS`) bounds the total regardless.

---

## 5. Measured: can a local model read a parte?

Eight hand-written cases, built from the repo's own vocabulary tables (`START_KEYWORDS`, `END_KEYWORDS`, `PROCESS_KEYWORDS`) and the spec's §4.4 schema and §4.5 prompt, verbatim where possible. `temperature: 0`, `seed: 7`, `num_ctx: 4096`. No real plant message was used, and nothing was written to the database.

Hardware — and this is load-bearing: **Intel i7-1255U (10 cores / 12 threads), 15.7 GB RAM, Intel UHD integrated graphics. No discrete GPU. 100% CPU inference.**

### 5.1 Design A — the spec as written (model gets the OT list, outputs `ot_number`)

| | `qwen2.5:3b` | `qwen2.5:7b` |
|---|---|---|
| Valid JSON | 6/8 | 1/1 before I stopped the run |
| Latency, the founding example | 103 s | **414 s** |
| Latency p50 | ~35 s | not reached |
| Prompt tokens | ~880 | ~880 |

The founding example, `Fin OT 40879, 7600 pliegos, entro OT 40965`:

- **3B** — `ot_number: null` on *both* events despite `ot_evidence` correctly reading `"Fin OT 40879"`; invented `pliegos: 48000` for the START; invented `problems: ["merma"]`, a word not in the message.
- **7B** — `ot_number: "siete mil seiscientos"` and `ot_number: "catorce mil novecientos sesenta y cinco"`. It wrote the Spanish *words for the quantity* into the OT field, and mis-spelled the second OT's value while doing it. It also invented the same `pliegos: 48000`.
- **The regex read this message correctly** — both OTs, correct quantity, `confidence: 70`.

`48000` is not a coincidence: it is OT 40965's `quantity` from the active-OT list in the prompt. **The OT list is itself a hallucination source** — both model sizes reached into the context and promoted a planned quantity to a reported one. Under the spec's V4 (numbers grounded in source text) that extraction is rejected, so the floor holds; but it means the model is contributing abstentions, not readings.

Other Design-A failures: the prompt-injection case partially landed on the 3B (`merma: 999999`, taken from the injected clause) and then truncated into invalid JSON; the voice-style case read `sesenta y dos mil` (62 000) as `merma: 900` and invented a `problems` entry quoting an OT that appears nowhere in the message.

**On injection, one correction to the spec's reasoning.** V4 grounding does *not* stop this attack: `999999` is a literal substring of the message, so the number is "grounded" and passes. What stops it is V7 plausibility, the echo back to the operator, and the supervisor gate — i.e. I2, not I3. Worth making explicit in §4.6, because grounding reads like it covers injection and it does not.

### 5.2 Design B — narrowed (no OT list; no `ot_number` field)

Rationale: both models located the OT correctly in `ot_evidence` while failing to transcribe it. So remove both the contamination source and the field they get wrong, and let tested code do the digit extraction.

`qwen2.5:3b`, prompt tokens **884 → 636 (−28%)**, latency **p50 25.4 s**, valid JSON 7/8:

| Case | Result |
|---|---|
| `fin 40812 8000 pliegos fallados` | **correct** — `merma: 8000`, the hard waste-vocabulary case |
| `Fin OT 40965, 1.500 pliegos, 2,5 horas, barniz uv` | **correct** — 1500, 2.5, `["barniz","uv_localizado"]`; the `enum` held |
| greeting, not a report | **correct** — `is_production_report: false` |
| injection | **abstained entirely** — safe, though it also dropped the legitimate 1200 pliegos |
| `Listo la 40502, …` | wrong `action: start`; "Listo" is an END keyword |
| the founding example | **truncated at 1200 output tokens → invalid JSON** (H11) |
| `termine las cajas, 3000 buenos…` | `ot_evidence: "<canal>texto</canal>"` — it grabbed my own delimiter — plus an invented second event |
| voice-style | catastrophic — `value: 4520990` invented, five events from one report, eight processes including duplicates, invented problems (`"dechido"`, not a word) |

So Design B is better on exactly what it was meant to fix — grounding, OT location, prompt size, latency — and the 3B remains unfit: wrong actions, degenerate `enum` array loops, invented values, event multiplication.

### 5.3 The one piece that does work — executed

Feeding the model's `ot_evidence` through the repo's existing `extractOTNumber()`:

```
OK c1-end    "OT 40879"                -> 40879
OK c1-start  "entro OT 40965"          -> 40965
OK c2        "40502"                   -> 40502
OK c3        "fin 40812"               -> 40812
OK c5        "<canal>texto</canal>"    -> null
OK c7-voz    "cuarenta quinientos dos" -> null
OK c8        "Fin OT 40965"            -> 40965

7/7 recuperados por extractOTNumber()
```

7/7, including correctly returning `null` for both junk fragments. The model is good at *pointing*; it is bad at *transcribing*. Give it the pointing job only.

### 5.4 What this means for §6.3's gates

The §6.3 stop rule — *if the regex alone reaches 95% clean capture, the text path does not ship* — is the right instrument, and the Phase 0 signal says it will probably fire. These eight cases are not a golden set and prove nothing about rates; the spec is right that prompt iteration belongs on a dev split in Phase 2. But the direction is unambiguous: on the founding example the regex was right and both models were wrong, and the "at least +10 points of clean capture" gate is a long way from a 3B that mislabels END as START.

**I am not proposing to skip the evaluation.** I am proposing not to build the text cascade before the evaluation, which is what the spec already says, and to note that Phase 2's dev-split work should start from Design C (§5.5) rather than from §4.4 as written.

### 5.5 Design C — following Ollama's own recommendation, which my first probe did not

The structured-outputs page says: *"It is ideal to also pass the JSON schema as a string in the prompt to ground the model's response."* Designs A and B passed the schema only in `format`. Design C adds it to the prompt as documented, changing nothing else. `qwen2.5:3b`, three cases chosen because they were the instructive failures:

| Case | Design B | Design C |
|---|---|---|
| founding example | `done_reason: length` at 1200 tokens → **invalid JSON** | **valid**, 176 tokens, both events, both `ot_evidence` correct |
| `Listo la 40502, tire 5000 pliegos y 200 de merma` | quantities right, `action` wrong (`start`) | **regressed** — abstains outright on a clear message |
| voice-style, `sesenta y dos mil` | 5 events, invented `4520990` | 2 events, values **62000 / 900 / 6 all correct** — but `merma` and `pliegos` **swapped** |
| Prompt tokens | 636 | **1220** |
| Latency p50 | **25 s** | **92 s** |
| Valid JSON | 7/8 | 3/3 |

What this buys and costs, precisely:

- **It fixes the worst failure mode.** The degenerate runaway generation is gone — the founding example dropped from 1200+ truncated tokens to 176 clean ones. Raising `num_predict` from 1200 to 1600 had not fixed it (438 s, still truncated); grounding the prompt with the schema did. Since truncation (H11) was the single most common failure, this is the most valuable prompt change found in Phase 0, and **it came from the vendor documentation rather than from my own iteration** — which is the argument for this whole grounding pass.
- **It costs 3.7× latency on CPU.** 636 → 1220 prompt tokens, and CPU prompt evaluation is linear in tokens. On a GPU this would be invisible; here it is the difference between 25 s and 92 s. Lever 2 (prefix caching) is the obvious mitigation, since the schema text is part of the static prefix — untested.
- **It does not fix the semantic errors, and introduced one.** The swapped `merma`/`pliegos` binding is the most dangerous error class in this whole feature: the values are literal and grounded, so V4 passes, and only V8's soft arithmetic flag and the operator echo stand between it and a supervisor's eye. The false abstention on an easy message is a capture loss rather than a wrong value, so it is the safe direction to fail — but it is still a regression.

Net: Design C is the right starting point for Phase 2's dev split, and the 3B remains unfit. The failures have simply moved from *malformed* to *confidently mis-bound*, which is harder to catch automatically and is exactly why I2's human gate is non-negotiable.

### 5.6 Resolving the contradiction in Ollama's docs — executed

§4.1 records that the structured-outputs page and the openai-compatibility page disagree about whether `json_schema` works on the OpenAI-compatible endpoint. Tested with a schema the model could never produce unprompted — two required fields, `codigo_raro` as `enum: ["A","B"]` and `inventado_xyz` as an integer — against the message `"Hola, como estas?"`:

| Endpoint | Result |
|---|---|
| `/v1/chat/completions`, `response_format: { type: 'json_schema', … }` | **schema enforced** → `{"codigo_raro": "B", "inventado_xyz": 42}` |
| `/v1/chat/completions`, `response_format: { type: 'json_object' }` | not enforced → `{}` |
| `/api/chat`, `format: <schema>` | **schema enforced** → identical output |

**The structured-outputs page is correct and the openai-compatibility page is incomplete.** `json_schema` is honoured on the OpenAI-compatible endpoint, and `enum` is enforced on both paths.

This is a real design win: **the `StructuredExtractor` adapter can be a single provider-agnostic code path** speaking the OpenAI-compatible shape, pointed at `127.0.0.1:11434/v1` today and at any OpenAI-compatible endpoint — including a cloud fallback — by changing a base URL. It also means the same adapter covers the STT port's `/v1/audio/transcriptions` shape (§4.2), so the whole local stack is one HTTP convention rather than two.

One implementation detail, observed: the returned content carried trailing whitespace (`"…}\n\n \t\t"`). `JSON.parse` tolerates it, but trim before hashing or comparing.

---

## 6. Four cheaper levers before anyone buys hardware

The documentation sweep turned up three things to try that cost nothing, and it narrowed what §5's negative result actually licenses me to claim. Hardware is the last lever, not the first.

**Lever 1 — a model built for this job.** This is the correction that most changes §5. I benchmarked two *general-purpose chat* models from the **qwen2.5 generation**, which by October 2026 is roughly two years old. The Ollama library currently carries models that are either purpose-built for extraction or newer and small:

| Model | Size | Why it is a better candidate than what I tested |
|---|---|---|
| **NuExtract** | 3.8B, 2.2 GB, 4k ctx | Fine-tuned from phi-3-mini specifically for information extraction, and documented as *"purely extractive, so all text output by the model is present as is in the original text."* That is §4.1 I3 and validator V4 enforced by training rather than by a prompt rule the 3B ignored. Wants a template/example/text prompt shape, not a chat system prompt — different from §4.5. Caveats: phi-3-mini is English-centric, so Chilean plant slang is a real risk, and *purely extractive* means it will not normalise `1.500 → 1500` or classify `Listo` as an END. It fits **D2's division of labour exactly**: let it point, let tested code transcribe. |
| **Granite 4.1** | from 3B | Documented as supporting *"tool use and structured JSON output"*. |
| Phi4-Mini · Gemma3 · Qwen3 | 3.8B · from 270M · various | Current-generation small instruction models; untested here. |

So the honest scope of §5 is: **the two models I tested are unfit. "Local extraction cannot work" is not established**, and I should not be read as having established it. A purpose-built extractor at 3.8B is the single most likely thing to change the answer, and testing one is a ~2.2 GB download and an afternoon (**Q-10**).

**Lever 2 — prefix caching.** `prompt_eval_cached_count` (§4.1) shows prompt evaluation is cacheable, and prompt evaluation was the dominant CPU cost at 636–884 tokens per call. A stable, byte-identical static prefix plus `keep_alive` should cut most of it. Free, and it only requires the discipline §4.5 already imposes.

**Lever 3 — the iGPU via Vulkan.** Ollama's hardware page documents a Vulkan backend giving *"supplementary GPU acceleration on Windows and Linux for Intel and AMD hardware when drivers are installed."* This machine's Intel UHD is weak and shares system memory, so I would not expect a transformation — but it is a driver install and a re-measure, which is cheaper than a purchase.

**Lever 4 — hardware, if the first three fall short.**

| Path | Latency / message | Basis |
|---|---|---|
| This laptop, 3B, CPU | p50 25 s, max 121 s | measured; fits Vercel's 300 s; quality unfit |
| This laptop, 7B, CPU | 414 s | measured; **exceeds** Vercel's 300 s ceiling; quality unfit |
| A box with a 12 GB GPU, 7B–14B | ~2–5 s | **not measured**; extrapolated from the usual GPU/CPU token-rate gap. Ollama publishes no per-size performance figures (§4.1), so treat this as an estimate, not a vendor claim. |
| Claude Haiku 4.5, as the original spec | ~2–4 s | spec §3.1; ~USD 1/5 per M tokens in/out; no plant hardware |

A used RTX 3060 12 GB class machine would make local 7B–14B extraction a real option and run local STT comfortably. **Q-7** asks whether that is on the table.

Worth stating plainly: on quality and latency the original spec's cloud design is the better engineering choice, and the reasons to go local are privacy, cost and autonomy — not performance. For a plant's internal messages those are good reasons. But the honest consequence, on the evidence available today, is that **local inference buys voice first; whether it also buys better text parsing depends on Levers 1–3, which have not been tried.**

---

## 7. Deviations requested

Per §0: proposed here, before building. None is implemented.

### D1 — Pull-based local worker instead of `modelTask` in `after()` · **structural, blocks Phase 2**

Forced by §4.3's two facts. The webhook stops owning the model call:

```
Meta -> POST /api/whatsapp/webhook   (Vercel)
  1  size cap, HMAC, extractMetaInbound (+ audio, + media_only)
  2  insert_whatsapp_inbound_idempotent(...)        <- antes del 200 (I4, I5)
  3  texto: mantención -> parseWhatsAppEvents (sin cambios)
            needsModel? no  -> processEvent, como hoy   status = parsed_regex
                         sí  -> status = queued_model, y nada más
     audio: status = queued_model
  4  200 a Meta                                     <- el webhook termina acá

Planta (una máquina, detrás del NAT, sin puerto abierto):
  worker  -> claim: UPDATE ... WHERE status='queued_model' ... RETURNING
          -> ffmpeg + STT local (si es audio)
          -> parseWhatsAppEvents sobre el transcrito    <- la regex primero
          -> Ollama 127.0.0.1:11434 /api/chat           (sólo si hace falta)
          -> validadores -> decide -> RPC -> capture_extractions
          -> respuesta al operario por plantilla
```

Why this is the right shape and not a workaround:

- **It is the spec's own mechanism.** §4.2 already specifies `status = queued_model`, claiming with `UPDATE ... WHERE status='queued_model' ... RETURNING`, and three retry drains. The worker *is* the drain. Nothing new is invented; one of the three drains becomes the primary path.
- **Ollama never leaves localhost.** No tunnel, no inbound port into the plant network, no credential on an internet-facing listener. Compare the alternative (Cloudflare Tunnel / ngrok to Vercel), which puts a factory machine on the public internet to save a polling loop.
- **Latency stops mattering.** 25 s or 7 min, the webhook already answered 200 and the supervisor gate (I2) is minutes-to-hours away regardless. This is the one design where the measured CPU numbers are survivable.
- **I1's floor gets stronger, not weaker.** If the plant machine is off, asleep or offline, rows sit in `queued_model` and the regex result that was already written stands. "Provider down" becomes "worker not running", which is the same thing and needs no new handling.
- **Pure modules stay shared.** `capture-extraction.ts`, `capture-validators.ts`, `capture-router.ts`, `capture-correction.ts` stay in `src/lib` and the worker imports them (same repo, run with `tsx`, like `scripts/seed/`). Only the two I/O adapters move. §2.3's "nothing is computed twice" is preserved.

**The division of labour is forced, not chosen — and the vendor docs fix exactly where the line falls.** Meta's media URLs expire after five minutes and downloading needs the access token (§4.3). A worker that might not reach a row until Monday cannot hold a five-minute URL. So:

> **Vercel owns every call to Meta** — resolve the media id, download the audio into Supabase Storage inside `after()` while the URL is alive, and send the outbound reply. **The worker owns only inference** — read the audio from Storage, transcribe, extract, validate, write through the RPC.

That keeps the Meta access token on Vercel and off the plant machine, which is the same instinct as Q-4's restricted database role. It also means the worker needs **no** Meta credential at all. One consequence to design for: since the worker cannot send, the reply has to be either enqueued for Vercel to send or sent by the worker through an authenticated app route — and either way it must respect the 24-hour window (**H13**).

Costs, stated honestly: a long-running process to supervise on Windows (Task Scheduler or a service wrapper); a database credential living on a plant PC — which should be a **restricted role, not the service-role key**, and is worth its own decision (**Q-4**); and observability that is local rather than in Vercel's logs, which §3.4 says are short-lived on Hobby anyway, so `capture_extractions` was always going to be the real log.

### D2 — The regex owns the OT number; the model never sees the OT list

Proven in §5.1 and §5.3. Concretely, against §4.4: drop `ot_number` from `Event`, keep `ot_evidence`, and derive the digits with `extractOTNumber(ot_evidence)`. Drop `<ot_activas>` from the text prompt entirely — it costs ~250 prompt tokens, it is the measured source of invented quantities, and the regex does not need it.

V2 and V3 then run against the regex's OT, which is the field the regex is most reliable on even when it fails at everything else. §4.5's rule "always include any OT whose number appears in the message" survives as a *validator* input, not a prompt input.

Voice is the exception: a spoken OT (`"cuarenta quinientos dos"`) has no digits to extract, so candidate matching against the active list is genuinely needed there. Keep it as a separate, narrow step on the voice path, not a permanent widening of the text prompt.

### D3 — Ollama-specific validator and call requirements

Additions to §4.6 V1 and to the adapter:

- V1 asserts `done_reason === 'stop'` **and** a successful schema parse (H11).
- Every call sets `num_ctx` explicitly; the adapter asserts `prompt_eval_count < num_ctx` and treats a breach as a failed extraction, not a reading (H8).
- Every call sets **`think: false`** where `/api/show` reports thinking support. Reasoning tokens share the `num_predict` budget, so a thinking model truncates its own JSON — and Ollama's docs do not cover the interaction (§4.1).
- The static prefix is **byte-identical** across calls, and the adapter logs **`prompt_eval_cached_count`** so the prefix cache can be shown to be hitting rather than assumed (§4.1, Lever 2).
- Follow the vendor's own recommendation and **pass the schema as text in the prompt** as well as in `format` — but measure it, because §5.5 shows it is not free on CPU.
- `capture_extractions` stores the **digest** from `/api/tags`, not just the tag (H9). `provider = 'ollama'`, and `model` keeps the tag for readability.
- `num_predict` is set with headroom and a `length` stop is counted as a provider failure (→ `status: failed`, regex fallback, no question to the operator), because it is our budget that ran out, not the operator's message that was unclear.

### D4 — The spending guard becomes a concurrency guard

§4.8's "count today's rows in `capture_extractions`, over `CAPTURE_LLM_DAILY_CAP` behave as mode `off`" protects a bill that no longer exists (H7). Replace with: the worker processes **one** message at a time (`num_parallel = 1`), takes a bounded batch per tick, and if queue depth exceeds a threshold it logs once and keeps draining in order. Keep a daily cap as a runaway stop, not as a budget. The `app_settings` kill switch (§4.12) stays exactly as specified — it is more useful here, since it can stop a worker the owner is not sitting in front of.

### D5 — Configuration

Both adapters speak the **OpenAI-compatible shape** (§5.6), so one base URL per port is all that distinguishes local from cloud.

```bash
CAPTURE_LLM_MODE=off                  # off | shadow | cascade
# El adaptador habla /v1/chat/completions con response_format json_schema:
# probado contra Ollama (§5.6), y el mismo codigo sirve para cualquier
# endpoint compatible sin cambiar nada mas que esta URL.
CAPTURE_LLM_BASE_URL=http://127.0.0.1:11434/v1
CAPTURE_LLM_MODEL=qwen2.5:3b          # el digest queda en capture_extractions (H9)
CAPTURE_LLM_NUM_CTX=4096              # explicito a proposito: es el default documentado
                                      # bajo 24 GB de VRAM, y pasarse no esta documentado (H8)
CAPTURE_LLM_THINK=false               # los tokens de razonamiento gastan num_predict (H11)
CAPTURE_LLM_NUM_PREDICT=900           # medido: suficiente con el schema en el prompt (§5.5)
CAPTURE_LLM_TIMEOUT_MS=180000         # medido: p50 92 s y max 119 s para un 3B en CPU
CAPTURE_ROUTER_MIN_CONFIDENCE=70
CAPTURE_WORKER_BATCH=5
CAPTURE_VOICE_ENABLED=false
STT_BASE_URL=http://127.0.0.1:8080/v1 # whisper-server: "OAI-like API" (§4.2)
STT_MODEL=whisper-small
CAPTURE_AUDIO_RETENTION_DAYS=30
```

`CAPTURE_LLM_TIMEOUT_MS` is set from measurement, not taste: 180 s covers the observed 3B worst case of 119 s with margin. It would need raising for a 7B, which is a reason not to run one (§6).

No `ANTHROPIC_API_KEY`, no `OPENAI_API_KEY`, and **no new npm dependency at all** — both adapters are `fetch` against localhost, so §2.1's dependency rule is satisfied more cheaply than the original spec's `@anthropic-ai/sdk`. The §3.1 `zod/v4` subpath problem also disappears: the schema travels as a plain JSON Schema object, so the extraction schema can stay on the repo's zod v3 API with a hand-written schema constant, and §4.3's "keep the schema in its own module on zod/v4" is no longer needed.

---

## 8. Proposed re-ordering: voice first, and voice mostly without a model

This is the one place I want to go further than restating the spec, because Phase 0 turned up an argument the spec does not make.

The spec treats voice as Phase 5, after the text cascade, and assumes voice needs the model. Both look wrong now:

1. **On text, the regex is the incumbent and it is good.** The cascade has to beat a working parser by +10 points of clean capture (§6.3) using a model that, measured here, mislabels END as START. Hard bar, weak challenger.
2. **On voice, there is no incumbent.** Voice notes are discarded before parsing today — captured value is zero, and the spec's own §4.11 notes audio cannot even pass `InboundMessageSchema`. Anything above zero is a win, and the gate is "does the plant get reports it currently loses", not "beat the regex".
3. **A transcript is just text, so the regex can read it.** `"termine la OT 40879, 7600 pliegos"` spoken and transcribed is an ordinary message that `parseWhatsAppEvents` already handles. The pipeline should be **audio → local STT → the existing regex**, and fall to the model only when the regex fails — exactly the cascade §4.2 describes, with the model as the exception rather than the rule. For well-spoken reports, local voice capture needs no LLM at all.
4. **Local STT is a much better-posed task than local extraction.** Transcription is a mature, bounded problem with a fixed output space; open-vocabulary structured extraction with grounding guarantees is not. §5 says the two models tested cannot be trusted with the second job, and nothing in §5 bears on the first. **But be clear about the evidence: this is a reasoned expectation, not a measurement.** whisper.cpp publishes no official CPU throughput figures (§4.2) and there is no voice corpus yet (Q-2), so the first real work of a voice-first phase is to measure transcription quality and latency on Chilean plant audio. If that measurement disappoints, voice-first is wrong too and the honest answer becomes Phase 1 plus the cloud design.
5. **Going local makes the privacy story for voice clean.** An operator's recorded voice is the most personal thing in this pipeline. Local STT means it never leaves the plant — which also shrinks §5 and makes the §8 Q-3 disclosure an easy conversation instead of a hard one.

So the proposed order is: **Phase 1 as written** (it is all upside and needs no model) → **voice intake + local STT + existing regex, measured** → **only then** decide whether a local model earns a place, on either path, with the §6 harness and real data.

This is a proposal, not a decision. It changes phase order, which is the owner's call — **Q-1**.

---

## 9. Questions for the owner

Blocking Phase 2, not Phase 1. Phase 1 needs only Q-5 (and Q-6 is withdrawn — see §0).

| # | Question | Why it cannot be assumed |
|---|---|---|
| **Q-1** | Re-order to voice-first (§8), or keep the spec's order? | Changes what Phase 2 is. My recommendation: re-order. |
| **Q-2** | Does a WhatsApp production group export exist, and what is the go-live date for excluding pre-go-live rows? | §6.1 cannot build a golden set without it, and H4 means the database has no corpus either. This is the single thing most blocking the evaluation. |
| **Q-3** | Which machine runs the worker, and is it on whenever the plant is? Who tells the operators their voice notes are transcribed? | D1's operational assumption, and now also H13's: a worker that sleeps through a weekend wakes up outside WhatsApp's 24-hour reply window, so the operator gets no echo. Local STT makes the disclosure easier but not unnecessary. |
| **Q-4** | May the worker hold a **restricted** database role rather than the service-role key? | A plant PC holding the service-role key is a bigger risk than the feature. Needs a migration if yes. |
| **Q-5** | Which Graph version — v24.0 or v25.0? | H5 is expired *now*. Phase 1 can ship this immediately. |
| ~~Q-6~~ | ~~The 9 pre-existing ESLint errors~~ | **Withdrawn 2026-10-09** — fixed upstream in `1464eb4`; the gate is green. See §0. |
| **Q-7** | Is GPU hardware on the table (§6, Lever 4)? | Only ask this *after* Levers 1–3. Decides whether local 7B+ extraction is ever viable. |
| **Q-10** | May I pull and benchmark a purpose-built extraction model — **NuExtract** (3.8B, 2.2 GB) and/or **granite4.1:3b** — on the same eight cases? | §6 Lever 1. It is a ~2.2 GB download onto your machine, so I am asking rather than doing it. It is the cheapest thing that could overturn §5's negative result, and without it "local extraction does not work" rests on two models from the qwen2.5 generation. |
| **Q-8** | Should door A also run `resolveFlow` (the spec's own §8 open question)? | H2's fix has to pick one behaviour for both doors. |
| **Q-9** | The §6.1 labelling edge cases — bare number with no unit, "4.800 buenos de 5.000", resmas/cajas, "media hora", a correction inside one message, two people's reports in one message. | §6.1 says the plant rules on these before anyone labels. |

---

## 10. What Phase 1 should be

Unchanged from the spec's Phase 1, with H3′ and H10 folded in and the model work removed. Every item is justified by a hazard re-confirmed at `3a5da0c` (§0), and none of it depends on any decision above except Q-5.

1. **Characterisation tests for `processMessage`** on a fake Supabase client — START, END, CANCEL, unknown, no OT, compound, duplicate wamid. These are the definition of "as today" for I1, and the pipeline that writes money currently has zero tests.
2. **Fix H1.** The spec's recommended key derivation (`wamid`, `wamid#1`, `wamid#2`) keeps the RPC signature and avoids a second function signature, which §2.1 forbids. I agree with that choice over an `event_index` column — it needs no DDL on the RPC and a redelivery maps to the same keys. The test from (1) is what proves it.
3. **The inbox (H4 + H10):** `whatsapp_inbound_messages`, `insert_whatsapp_inbound_idempotent`, written **before** the 200 in both the webhook and the simulator; over-long bodies, unsupported types and captionless photos stored instead of rejected. This is the precondition for the golden set, so it should land early.
4. **`whatsapp-graph.ts`** and the three call sites (H5) — answer Q-5 and this is a half-hour fix for an already-expired dependency.
5. **Review (H2, H3, H3′):** one shared server-side review function behind both doors; costs applied exactly once across both guards; `corrected_data` restricted by Zod to `pliegos_produced`, `merma`, `buenos`, `hours_reported` with costs **recomputed server-side**; `corrected_costs` **no longer accepted from the client on either route**; hours visible and editable. New fields go in `CaptureReviewFields.tsx` — `WhatsAppDashboard.tsx` is at 907 lines against the master plan's 600-line cap, confirmed.
6. **Golden-set tooling and the `--system regex` harness**, with `check:golden-private` in CI. No model is involved, and the output is the baseline every later decision is measured against.

Phase 1 ends with: a redelivered compound message yielding one row per event, a corrected report feeding corrected costs once from either screen, no route accepting client-supplied money, and `npm run eval:capture -- --system regex --split dev` printing a real number.

---

## 11. Working-tree state

- This file is the only thing added. Nothing was committed, pushed, or applied to the database. No migration was written. No row was created, updated or deleted anywhere.
- `AGENTS.md` and `CLAUDE.md` are untracked in the working tree — `next dev` writes them (`node_modules/next/dist/server/lib/generate-agent-files.js`), and per their own header they should be committed with the next piece of work to keep the tree clean.
- Probe scripts live in the session scratchpad, not the repo, and are not production code. They are reproducible from §5: eight hand-written cases built from the repo's own keyword tables, `temperature: 0`, `seed: 7`, `num_ctx: 4096`. Design A sends the spec's §4.4 schema plus the OT list; Design B drops both the OT list and `ot_number`; Design C adds the schema as prompt text. No real plant message was used and no model was pulled.
- `scripts/smoke.mjs` and `npm run verify:csp` were not run — both need the dev server up, which is the owner's call.

---

## 12. Sources

Read 2026-10-05. Facts attributed to the spec rather than to a page are marked *spec-sourced* in the text.

**Ollama** — [api/chat](https://docs.ollama.com/api/chat.md) · [capabilities/structured-outputs](https://docs.ollama.com/capabilities/structured-outputs.md) · [capabilities/thinking](https://docs.ollama.com/capabilities/thinking.md) · [context-length](https://docs.ollama.com/context-length.md) · [gpu](https://docs.ollama.com/gpu.md) · [api/openai-compatibility](https://docs.ollama.com/api/openai-compatibility.md) · [library](https://ollama.com/library) · [library/nuextract](https://ollama.com/library/nuextract) · index at `docs.ollama.com/llms.txt`, OpenAPI at `docs.ollama.com/openapi.yaml`

**WhatsApp / Meta** — [inbound audio webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio/) · [media reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media) · [send-messages guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages) · [webhooks getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) · [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/versions)

**Platform** — [Vercel function limits](https://vercel.com/docs/functions/limitations) · [Supabase storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · Next.js 16 `after` and `maxDuration`, read from the bundled copies at `node_modules/next/dist/docs/01-app/03-api-reference/` as AGENTS.md requires

**Speech to text** — [whisper.cpp](https://github.com/ggml-org/whisper.cpp)

### Where the documentation changed the design

Worth recording, because these would all have been wrong if built from memory:

| Source said | Effect |
|---|---|
| *"It is ideal to also pass the JSON schema as a string in the prompt"* | Fixed the dominant failure mode (truncation) at 3.7× latency — §5.5. My first probe omitted it. |
| Media URLs *"expire after 5 minutes"* | Vercel must download audio in `after()`; the worker reads Storage and needs no Meta credential — D1. |
| Retries *"over the next 36 hours"*, *"handle deduplication"*, *"you will not be able to query historical webhook event notification data"* | Vendor-stated backing for I4/I5 and H4; resizes H1's exposure window from 60 s to 36 h. |
| Outside the 24-hour window *"you can only send pre-approved template messages"* | New H13 — a delayed worker cannot echo. |
| Hobby max duration is **300 s default and maximum** | Corrected my own claim: duration blocks 7B, not 3B. Reachability is the real argument for D1 — §4.4. |
| Default context is 4k under 24 GB VRAM; over-long prompts **undocumented** | H8 reframed from "truncates at the front" (an assumption) to "undocumented, so guard it". |
| `prompt_eval_cached_count` exists | Prefix caching is measurable — §6 Lever 2. |
| NuExtract is *"purely extractive"* | Narrowed §5's conclusion from "local extraction does not work" to "these two models do not" — §6 Lever 1, Q-10. |
| Structured outputs work via OpenAI-compatible `response_format` | Contradicted the compatibility page; tested in §5.6 → one provider-agnostic adapter. |
