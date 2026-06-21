# The Workshop as a Living Organism — Vital-Signs Diagnosis

> A deep diagnostic of the app's **circulation** (inter-module data flow), read through
> five complementary lenses — Anthroposophy, Traditional Chinese Medicine, Ayurveda,
> biohacking, and efficient software architecture. Diagnosis only; no code changed.
> Grounded in the actual vessels traced in the codebase (joins, RPCs, realtime, FKs).

---

## North star — Industry 6.0 (the heart is human)

The organism exists to serve **one differentiator**: integrate people into the
process and **amplify their potential through technology — never automate them
away**. Two laws govern every build decision:

1. **The interface is the human's existing behavior.** No forms, no typing SKUs.
   A WhatsApp message, a photo of a QR, a voice note — natural acts the worker
   does anyway — *are* the input. Capture the exhaust of natural work.
2. **The loop returns value to that same human.** Insights and reflexes flow
   *back* to amplify the worker (recognition, less drudgery, guidance), not only
   up to management.

In this frame the **human is the heart** — the source of life-force. The app is
the circulatory + nervous system. The prototype of the whole philosophy already
exists: `whatsapp_production_logs` + `feed_whatsapp_to_real_costs` turns a natural
message into costed blood with zero data entry. Everything is built in its image.

---

## 0. Why five lenses

Each tradition diagnoses *flow and balance*, not parts in isolation — exactly the
right frame for an app whose health lives in the **connections** between modules,
not the modules themselves. Used together they trang­ulate: when independent
systems point at the *same* lesion, confidence is high. (Spoiler: they do.)

| Lens | What it sees | Maps to (engineering) |
|---|---|---|
| **Anthroposophy** | Threefold organism: nerve-sense / rhythmic / metabolic-limb | Analítica / Personas+flow / Equipos+production |
| **TCM** | Qi flowing through meridians; blockage = stagnation = pain | data flow through joins; broken join = downstream errors |
| **Ayurveda** | Agni (digestion) turning input into tissue; *ama* = toxin | transformation RPCs; undigested/unmapped rows = toxin |
| **Biohacking** | Measure everything, tight feedback loops, low latency | telemetry, reflex loops, query latency |
| **Architecture** | Single source of truth, low coupling, no anti-patterns | nav config, the dual-key debt, event sourcing |

---

## 1. The anatomy (organs → modules → real tables)

| Organism | Module | Core tables | Active processes (RPCs) |
|---|---|---|---|
| Heart + arms | **Personas** | `shifts`, `worker_assignments`, `compensation_rates`, `employee_incentives`, skills | `accrue_leave_balances`, `get_employee_cost_timeline` |
| Muscle / metabolism | **Operaciones** | `ots`, `ot_status_history`, `ot_real_costs`, `ot_financials` | `split_ot`, `generate_ot_number`, `estimate_ot_hours`, `feed_whatsapp_to_real_costs` |
| Bones + legs | **Equipos** | `machines`, `machine_costs`, `equipment_investments`, maintenance orders | — |
| Brain | **Analítica** | (reads all of the above) | the cost/margin/cycle aggregations |
| Blood | *the flow* | `worker_assignments`, `ot_status_history`, `ot_real_costs` | — |

---

## 1.5 Extended anatomy — the zang-fu organs

The heart/arms/bones/brain map is the gross anatomy. The *visceral* organs — the
ones that ingest, transform, detoxify, store, and breathe — exist too:

| Organ (TCM fn) | App system | Where it lives | Health |
|---|---|---|---|
| **Stomach** — intake, "rotting & ripening" | **Ingestion**: raw capture before transformation | `whatsapp_production_logs` (raw_message), webhook receivers `/api/whatsapp/*`, OT/quote forms; the `review_status` pending→approved ripening | 🟡 works, manual |
| **Spleen** — transforms food → Qi/blood (agni) | **Transformation engine** | `feed_whatsapp_to_real_costs`, payroll calc, `estimate_ot_hours`, margin calc | 🔴 deficient on labor path / 🟢 on WhatsApp path |
| **Liver** — smooth flow of Qi; planning & decision; stores blood; detox | **Governance + planning** | `validateTransition` state machine, Zod schemas, cost-overrun rules; Gantt / plan-semanal / calendar; React Query cache (stored blood) | 🟢 state machine / 🟡 planning disconnected from real load |
| **Kidney** — Jing (essence/constitution); filtration; fluid & pressure; roots the bones | **Foundation + security filtration** | DB schema / migrations / `types.ts` (the genome); RLS + auth + rate-limit in `proxy.ts` (filtration & blood pressure); archival/excretion | 🟡 essence was depleted (schema drift, reconciled) / ⚫ no excretion (no data lifecycle) |
| **Lung** — takes in Qi; Wei Qi (defense); the exterior boundary; rhythm | **Integration boundary + perimeter** | API layer, webhooks (inhale), exports/snapshots/reports (exhale), `integration_connectors`, CSP/HMAC/headers (Wei Qi) | 🟢 strong perimeter & I/O |

**Paired (fu) organs, briefly:** *Gallbladder* (decisiveness) = approval flows
(`ot_approvals`, the `visto_bueno` stage); *Small Intestine* (separates pure from
impure) = the assignment resolver sorting good rows from *ama*; *Large Intestine*
(elimination) = the missing log-rotation/archival; *Bladder* (storage/release of
fluids) = the rate-limiter's token buckets.

**Reading it:** the **Lung** (perimeter) and **Liver** (state machine) are our
strongest viscera — both hardened recently. The **Spleen** is the sick organ
(agni failing on labor). The **Kidney's** excretory function is **absent** — we
ingest and transform but never *eliminate*, so *ama* accumulates with nowhere to
go. An organism that eats but cannot excrete becomes toxic regardless of agni.

---

## 2. The vessels (meridians) and their patency

Traced from embedded selects, RPCs, realtime channels and notifications.

| Vessel (data flow) | From → To | Status | Note |
|---|---|---|---|
| WhatsApp field capture → real costs | Operaciones(field) → cost/margin | 🟢 patent | `feed_whatsapp_to_real_costs` RPC. *An action leaves a clean residue.* |
| OT transitions → lifecycle history | Operaciones → Analítica | 🟢 patent | `ot_status_history` → Ciclo de OT (built this session) |
| Cost overrun → notification | Analítica → user | 🟢 patent | `useCostOverrunAlerts` — the **only** reflex arc |
| OT ↔ machine | Operaciones ↔ Equipos | 🟡 weak | `assigned_machine_id` exists, but machine *load/runtime* never flows back |
| **Labor assignment → employee → cost** | **Personas → Analítica** | 🔴 **occluded** | `worker_assignments.employee_id \| worker_id` dual key drifts → payroll/rendimiento abort |
| Maintenance state → scheduling | Equipos → Operaciones | ⚫ absent | a machine due for service can still be assigned work |
| Presence/attendance → payroll | Personas(real) → Analítica | ⚫ absent | **no attendance/time-clock table** — the heartbeat is scheduled, never measured |
| Skills → assignment | Personas → Operaciones | ⚫ absent | skills stored, never used to suggest who works what |
| Brain → body reflexes (bottleneck, low-margin) | Analítica → Operaciones | ⚫ mostly absent | insight computed, rarely acted upon |

Nervous system (realtime `postgres_changes`): only **notifications** and
**production logs** are wired. The organism feels two things; it is largely numb
to the rest.

---

## 3. Diagnosis through each lens

### 3.1 Anthroposophy — the threefold organism is imbalanced
Steiner's threefold human: **nerve-sense** (cool, conscious — the head),
**rhythmic** (heart–lung — breath and circulation), **metabolic-limb** (warm,
willful — movement). Health is *balance*; illness is one system encroaching on
another.

- We have been feeding the **nerve-sense system (Analítica)** lavishly — more
  dashboards, more cognition.
- The **rhythmic system (Personas' shift heartbeat → circulation)** is
  **sclerotic**: its main vessel to the rest of the body is occluded.
- A head over-developed on a body whose circulation is failing is, in
  anthroposophic terms, precisely a *sclerotic* condition — thinking divorced
  from life-forces. **Prescription: stop nourishing the head; restore the rhythm.**

Fourfold mapping (useful for the vital-signs view): **physical** = DB schema ·
**etheric** (life/flow) = the data vessels · **astral** (sentience/signals) =
events + realtime · **I/ego** (decisions) = feedback loops. Our *astral* and
*ego* bodies are thin — few events, fewer decisions made automatically.

### 3.2 TCM — Spleen-Qi deficiency; blood not transformed
In TCM the **Spleen/Stomach** transform food into Qi and **blood**; when the
Spleen is deficient, blood isn't produced and the whole body is undernourished.
The transformation of *labor (worker_assignments) into costed, analyzable blood*
is exactly that Spleen function — and it is failing at the dual-key join.

- **Stagnation = pain:** a blocked meridian causes pain downstream. The blocked
  labor meridian throws literal errors ("N assignments could not be mapped").
- **Generating cycle** (Wood→Fire→Earth→Metal→Water): a healthy pipeline is a
  generating cycle (capture → transform → cost → insight → decision). Ours breaks
  at Earth (transformation), so Metal/Water (insight/decision) run dry.
- **Organ clock / circadian Qi:** the two-phase shift rhythm *is* the organ
  clock. We schedule it but never read its real pulse (no attendance).

### 3.3 Ayurveda — weak agni, accumulating *ama*
**Agni** (digestive fire) converts input into tissue; weak agni produces **ama**
(undigested toxin) that clogs **srotas** (channels) and causes disease.

- **Agni = the transformation RPCs** (`feed_whatsapp_to_real_costs`, the payroll
  calc). The WhatsApp agni is strong (clean digestion). The **payroll agni is
  weak** — it cannot digest assignments whose employee link is missing.
- **Ama = the unmapped assignments** literally piling up undigested. This is not a
  metaphor stretch — undigested data accumulating in a channel and poisoning
  downstream reports is *ama* exactly.
- **Dosha balance:** *Vata* (movement = data flow/events) is erratic and thin;
  *Pitta* (transformation = compute) is locally strong but starved of input;
  *Kapha* (structure = schema) is over-solid and rigid (the dual-key legacy
  column is Kapha excess — old structure that won't dissolve). **Reduce Kapha
  (retire the legacy key), kindle agni (fix the transform), restore Vata (events).**

### 3.4 Biohacking — no baselines, no telemetry, one feedback loop
The biohacker's creed: *you can't improve what you don't measure*, and health =
**tight feedback loops + low latency + good recovery**.

- **Telemetry:** we measure almost no *internal* vitals continuously. DB latency
  is pinged (`diagnostics`), but circulation integrity, agni success rate, and
  heartbeat variability are unmeasured.
- **HRV analog:** heart-rate *variability* signals autonomic health. Our analog
  is **planned-vs-actual shift hours** and punctuality — and we capture *neither*
  (no attendance). We are blind to the most predictive vital.
- **Feedback loops:** exactly **one** (cost-overrun → notification). A
  high-performing system has many short loops.
- **Recovery:** error handling mostly *aborts* (payroll throws) rather than
  *degrades gracefully* — poor recovery. (The new `LaborCostSummary` degrades
  instead of throwing — a model to generalize.)

### 3.5 Architecture — the dual-key anti-pattern is the root debt
Stripped of metaphor, the engineering reality:

- **Root cause:** `worker_assignments` carries both `employee_id` and a legacy
  `worker_id`, and the same dual identity recurs in `employees.worker_legacy_id`.
  Every labor calculation re-implements a fragile `resolveAssignmentEmployeeId`
  fallback. **One identity, two columns, no enforced bridge = guaranteed drift.**
- **N+1 / heavy client transforms:** payroll & margin pull *all* employees,
  assignments, rates, incentives to the client and join in JS. Works at demo
  scale; it is not circulation, it is the brain doing the heart's pumping.
- **Emerging good pattern:** `ot_status_history` is event sourcing done right —
  append-only, queryable, the basis of Ciclo de OT. **Generalize it**: labor and
  presence should emit events too.
- **Single source of truth** exists for navigation (`navigation.ts`) — good
  precedent. There is no equivalent for *identity* (the employee↔worker bridge).

---

## 4. Convergent diagnosis (the power move)

All five lenses, reasoning independently, point at **one lesion**:

> **The transformation of labor into costed, analyzable blood is broken at the
> `worker_assignments` employee/worker dual key.**

- Anthroposophy: rhythmic-system sclerosis (circulation fails).
- TCM: Spleen-Qi deficiency (blood not transformed).
- Ayurveda: weak agni → *ama* accumulation (undigested assignments).
- Biohacking: the highest-value vital (heartbeat throughput) is both broken *and*
  unmeasured.
- Architecture: a dual-key identity anti-pattern with no enforced bridge.

Convergence this clean = treat this first, with high confidence.

Secondary, consistent findings: the **bones don't report load** (machine
runtime never circulates), the **organism is largely numb** (few events/reflexes),
and the **heartbeat is never measured** (no attendance/HRV).

---

## 5. The Vital-Signs Panel (what the view should show)

A single screen — extend the existing `admin/diagnostics` organ — presenting the
body's vitals, not business KPIs. Each metric is computable from real tables.

**🫀 Pulse & rhythm (Personas)**
- assignments/day, shift coverage %, **planned vs actual hours (HRV)** — *needs attendance*
- circadian view: load by shift phase (the two-phase heartbeat)

**🩸 Circulation integrity (the bloodwork — the clot markers)**
- **% of `worker_assignments` that resolve to an `employee_id`** ← the artery patency test (currently *not* measured)
- OTs with no `ot_real_costs`; `ot_financials` coverage %
- broken `worker_legacy_id` links (already checked)

**🔥 Agni / metabolism (Operaciones)**
- WhatsApp logs digested vs pending; real-cost feed success rate
- OT lead time & bottleneck (from `ot_status_history` — already built)

**🦴 Skeletal load (Equipos)**
- machine utilization derived from history × `assigned_machine_id` (not snapshot)
- maintenance overdue count; machines `offline`/stale status

**🧠 Neural latency & reflexes (Analítica)**
- DB ping (have it); slowest aggregations
- active feedback-loop count; notifications emitted/24h

**☠️ Ama (toxins to clear)**
- unmapped assignments, orphan workstations, machine↔worker name collisions,
  stale machine status, OTs stuck > N days in a stage

A composite **"health score"** (0–100) from these = the organism's at-a-glance
wellness, trended over time.

---

## 6. Treatment plan (sequenced by circulation, not by organ)

0. **Unclot the artery.** Forge one enforced employee↔worker bridge; backfill
   `worker_assignments.employee_id`; make all writes set it. Revives Nómina +
   Rendimiento. *(TCM: tonify Spleen · Ayurveda: kindle agni + clear ama ·
   Anthroposophy: restore rhythm · Architecture: kill the dual key.)*
1. **Build the Vital-Signs Panel** (§5) so the organism can sense its own
   circulation — including the artery-patency test that's missing today.
2. **Let the bones report load** — real machine utilization/OEE from history.
3. **Grow reflexes** — clone the overrun-alert pattern (bottleneck, low margin,
   maintenance-due → scheduling).
4. **Measure the heartbeat** — lightweight presence/attendance → real hours, HRV.
5. **Generalize event sourcing** — labor & presence emit events like
   `ot_status_history` does; thicken the astral body (the nervous system).

---

## 7. One-line prognosis
The body is being given a bigger brain while its main artery is occluded and its
pulse goes unmeasured. **Restore circulation, then teach the organism to feel
itself** — after that, every new organ we build actually gets nourished.
