# Masterclass

The science, the techniques and the tools behind this project — compiled so the
reasoning survives the code.

A print shop is a good teacher. It has physics you cannot argue with, money that moves
in the wrong direction when you get the units wrong, and people wearing gloves who will
not use your software if it asks them to type. Almost everything below was learned by
being wrong first.

`README.md` says what the system does. `NOTES.md` is the log of what broke and how it
was diagnosed. **This file is the middle layer: the durable knowledge, separated from
the incident that produced it.**

```
158 migrations · 153 API routes · 72 domain libraries · 76 pages · 912 tests
```

---

# Part I · The science of the shop

The domain is not "orders and statuses". It is sheets, passes, make-ready, spoilage and
machine hours, and every one of them has a unit you can get wrong.

## 1 · Everything converges on the sheet

The **pliego** — the press sheet — is the join between geometry, weight, cost and
traceability. Four questions that look unrelated resolve to it:

| Question | Resolves to |
|---|---|
| How many products fit? | Imposition: units per sheet |
| What does the paper weigh? | Sheet area × grammage × sheets |
| What does the run cost? | Sheets × cost per sheet |
| Which lot did this box come from? | The sheets consumed from that lot |

Get the sheet wrong and all four are wrong together, in the same direction, silently.
This is why `ot-calculations.ts` computes imposition **once** and both the cost engine
and the visual preview read the same result. They used to compute it separately and
disagree — the audit filed that as OF-14.

Imposition is not `floor(sheet_area / piece_area)`. It needs the **gripper margin** (the
strip the press grabs, unusable), **bleed**, and both rotations of the piece tried
against both orientations of the sheet. The naive division overstates yield by 10–20%,
which understates paper cost by the same amount.

## 2 · A press pass is not a colour

The single most expensive unit error this project had.

A 4-colour-front job on a **4-body press is one pass**, not four. The sheet goes through
once and four units lay down ink in sequence. Costing it per colour overestimated press
hours by up to **4×** (audit OF-15).

```
passes = ceil(colours_front / bodies) + ceil(colours_back / bodies)
```

A 4/4 job on a 4-body press is two passes — one per side. A 6-colour job on a 4-body
press is two passes for the front alone. `pressPasses()` in `ot-calculations.ts` owns
this, and `stage-report.ts` reuses it to know how much make-ready a fragment carries.

## 3 · Make-ready is a fixed cost, and it does not divide

Before a single saleable sheet comes off the press, the operator burns sheets getting
registration and colour right. Same for a die-cut setup. That cost is **per pass**, not
per unit — and it is the reason two intuitive calculations are both wrong:

**Wrong per-run:** a flat "5% + 50 sheets" waste allowance. It underestimates short runs
badly, where make-ready dominates, and overestimates long ones.

**Wrong per-fragment:** when half an order advances to the next process, splitting the
make-ready proportionally. `partial-advance.ts` exists for exactly this:

> If a 6,000-unit job carries 300 make-ready sheets and half is moved, the first
> fragment does not take 150. It takes all 300 plus its half of the run. The second
> fragment does not set the machine up again.

Splitting it proportionally leaves the first fragment short of paper with the job
already mounted on the press.

## 4 · Merma is judged against the run, never as a percentage

**Merma** — the paper that entered the machine and did not come out saleable — is the
largest controllable cost in offset. A ruined sheet was bought, printed, and occupied
the press: it is paid for three times and sold zero times.

Two rules, both in `merma.ts`:

**The rate divides by paper *entered*, not by good output.**

```
merma % = merma ÷ (buenos + merma)
```

Dividing by good sheets yields >100% when a job is lost entirely — which is precisely
the case you need to be able to express.

**The band depends on run length**, because make-ready is a fixed cost:

| Run | Normal | High |
|---|---|---|
| Short (≤ 2,000 sheets) | 10% | 18% |
| Medium (≤ 20,000) | 5% | 10% |
| Long (> 20,000) | 2.5% | 5% |

8% on 500 sheets is forty sheets of setup — normal. 8% on 100,000 sheets is a machine
with a problem. A single global threshold would flag every short run and miss every real
fault. Aggregation weights by paper, never by averaging rates: averaging gives a 500-sheet
job and a 100,000-sheet job equal say.

## 5 · Cost per thousand, and margin per press hour

Two numbers run a print shop, and neither is "total cost".

**Cost per thousand** is the unit the industry quotes in. Total cost cannot be compared
across a 5,000 and a 150,000 run — the second is always larger and that tells you
nothing.

**Margin per press hour** is the one that decides Monday's schedule, and the one nobody
computes:

```
$400,000 over 8 hours  =  $50,000/hour
$200,000 over 2 hours  = $100,000/hour   ← take this one
```

When the press is the bottleneck — and in a print shop it is — the job worth taking is
not the one with the highest margin but the one that pays best per hour of the scarce
resource. Scheduling by absolute margin fills the press with big slow work and crowds
out the jobs that pay better. `print-economics.ts` owns both.

## 6 · A machine hour has a derivable price

The plant carried two answers and never compared them: `machines` knows
`energy_cost_per_hr`, `maintenance_cost_monthly`, `depreciation_monthly`; the costing
catalog carried an hourly rate somebody typed once.

`machine-economics.ts` derives the rate from the iron's own numbers and reports the drift
against the catalog, so the difference becomes visible instead of silent:

```
hourly = energy + (maintenance_monthly + depreciation_monthly) / monthly_hours
```

`DEFAULT_MONTHLY_PRODUCTIVE_HOURS = 195` — one shift, five days, 4.33 weeks — chosen
**deliberately low**. Spreading fixed cost over fewer hours makes the hour look more
expensive, and under-quoting is the failure that actually hurts a print shop.

This is the multiplicand that had nothing to multiply until stage closures started
recording real hours (`stage-report.ts`).

## 7 · Labour is clock events, not a number someone types

`labor-attribution.ts` is the last weld in the chain **person → wage → machine → OT**.
Every rail already existed:

```
attendance_events   clock_in/out per employee per station (QR kiosk)
worker_assignments  employee → machine → shift → date → ot_id
compensation_rates  hourly_rate + overtime multiplier, effective-dated
ot_real_costs       the destination
```

The module is the pure function in the middle, so the plant's real edge cases —
an operator who forgets to clock out, a double punch, a night shift crossing midnight,
one station running several OTs in a day — get decided in testable code rather than
inside a route.

Rates are **effective-dated**: payroll for March must use March's rate, not today's. A
join on "the current rate" silently rewrites history every time someone gets a raise.

## 8 · Paper is bought by weight and consumed by the sheet

`paper-units.ts` exists because the invoice and the machine speak different units.
Suppliers quote by the kilogram or the ream; the press eats sheets. Converting requires
the sheet's geometry and the grammage:

```
kg = (width_m × height_m) × gsm/1000 × sheets
```

The conversion has to be exact and shared, because it is the hinge between the purchase
order and the production estimate. `50.000` in a Chilean invoice is fifty thousand, not
fifty — a migration is named after that bug
(`20260817140000_50_000_no_son_cincuenta_mil`).

## 9 · Traceability is a physical chain, not a log

Food-packaging certification (FSSC 22000) does not ask for an audit log. It asks a
question: *given this box on a supermarket shelf, show me the paper it came from, the
purchase order that bought it, the certificate that was valid on the day it was used,
and the photograph of what shipped.*

That forces a chain of **physical** links, each of which must be recorded at the moment
it happens:

```
lote → OC → proveedor → certificado
  ↓
consumo (fecha, OT, cantidad, quién)
  ↓
OT → guía de despacho → factura
```

`consumir_lote()` is the single door in that chain. It checks retention, balance,
competing reservations and certificate validity **in one transaction**, because a path
that can write a consumption without those checks makes the whole chain unprovable. Two
things follow:

- **Every capture channel routes through it** — the scan station, and now a photo sent
  from a phone. The photo replaces the keyboard, not a single rule.
- **A deviation is data, not a bypass.** Using a lot with an expired certificate is
  sometimes the right call; it requires a written authorisation which is stored on the
  transaction (`authorized_deviation`, `deviation_reason`). A rule with no legitimate
  exception gets routed around.

Reserving is separate from consuming. A reservation does not touch the physical balance
— it constrains what can be *promised*, and it expires on its own, so a job that falls
through releases its paper without anyone remembering to.

## 10 · The guillotine cuts by the lift — and is still costed wrong

Kept here because it is unfinished and instructive. A guillotine does not cut sheet by
sheet; it cuts a **lift** of roughly 500 sheets per stroke. Costing it continuously
priced a 25,770-sheet cut at 8.9 hours against 1–2 on the machine.

The rate now carries lifts-per-hour *expressed* in sheets/hour so the shape of
`FINISH_RATES` survives — but `machines.optimal_speed_sheets_hr` has the same defect
underneath and needs a sheets-per-lift column to be fixed honestly. **A workaround that
preserves the wrong unit is a debt, and it belongs in writing.**

---

# Part II · Techniques

## 1 · A gate names what is missing

Every workflow gate in `ot-state-machine.ts` refuses with the specific thing that is
absent, never with a category:

```
✗  "Ficha incompleta"
✓  "Faltan 3 datos para poder mandar la prueba: montaje confirmado,
    arte adjunto, operaciones revisadas."

✗  "No se puede despachar"
✓  "No se puede despachar con la pasada por Troquelado sin cerrar.
    Falta decir cuántas horas tomó — se puede desde el tablero, o el
    operario lo manda por WhatsApp."
```

A message that names the gap can be acted on; a category forces the reader to go
looking. The second one also names *where* to fix it, which is the difference between a
rule and a trap.

## 2 · Absent data does not block; wrong data does

The hardest design call in the system, and it generalises far past this project.

A gate that stops work until a field is filled does not produce the field. It produces
work that happens outside the system — the shop keeps running, only the record stops.
So:

> **Moving a card is never blocked. Finishing an order is.**

Any door may advance an OT with nothing but a destination. What it does not carry is left
**open** and visible (an amber ring on the card). The gate that already demanded real
costs before dispatch gained one more condition: no open passes.

The same validator is hard where it counts. `480` in an hours field is a typo for
minutes, and it is rejected — not because hours are mandatory, but because a wrong number
enters the order's cost and the machine's historical average *looking true*. A blank is
visible and fixable; a wrong value has to be discovered first.

**Hard on the impossible, soft on the absent.**

And when a gate does fire, there must be a door: `PasadasPendientes` exists because
telling someone "close the die-cutting pass" without giving them anywhere to do it is a
trap wearing a rule's clothes.

## 3 · Derive; do not store the same truth twice

At one point this system had **seven** stored answers to "where is this OT?":
`status`, five `flag_*` columns, `proceso_actual`, the machine schedule, the WhatsApp
start/end session, `worker_assignments`, and stage passes. None derived from another, so
they drifted — and when they disagreed, nothing detected it.

The rule: if B is computable from A, compute it. `ot_stage_reports` has no `estado`
column because "open" *is* `hours IS NULL`; a second place to say it is a second place
to contradict it.

The corollary is knowing when **not** to derive. Hours are stored separately from money
because hours × rate is money and the rate changes; storing the fact apart from its
valuation lets cost be recomputed without rewriting shop history.

## 4 · Ask the catalog, not the grep

`DROP COLUMN` does not validate plpgsql bodies. Postgres resolves a function's
references when it **runs**, not when it is created, so a dropped column leaves broken
functions that pass every deploy, every type check and every test, and fail the first
time a person uses them.

A TypeScript grep cannot see this. The database can:

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND pg_get_functiondef(p.oid) ILIKE '%dropped_column%';
```

The same blindness applies in the other direction: a dead column inside a PostgREST
`.select('a, b, c')` string is **just text**. `tsc` stays green; production returns 400.

## 5 · A tripwire beats a fix, and a ritual is not a control

Fixing thirty instances of two patterns leaves the patterns. This repository's response
to an audit was three tripwires rather than thirty edits:

- an **ESLint rule** for `const { data } = await supabase…` with `error` unread;
- a global **`QueryCache` `onError`** floor under components that never check `isError`;
- **`npm run check:migrations`**, listing every function more than one migration defines.

And then the lesson that cost a fourth incident: the `pg_proc` query above had been
written down, saved, and quoted inside a migration — and the same defect happened again,
because **a check that depends on remembering is not a control**. It is
`npm run check:functions` now.

> A lesson is not learned until something other than a person is responsible for
> remembering it.

## 6 · A control that cries wolf gets switched off

`check:functions` reports only references it can resolve to a **concrete table**: a
`%ROWTYPE` variable's fields, `NEW`/`OLD` in a trigger, an `INSERT` column list, an
`UPDATE … SET` target, an aliased `FROM`. Anything it cannot tie to a table, it stays
quiet about.

The easy version — flag any word that is not a known column — finds every real case and
roughly two hundred false ones. Its first run still lied twelve times, and the fix was
not to tune a threshold but to model reality better: one trigger function can hang off
two tables and branch on `TG_TABLE_NAME`, so a field is only wrong if it exists in
*neither*.

**Precision over recall, for anything meant to be trusted.** A check that narrows the
hole and never lies survives; one that closes it and cries wolf gets disabled and then
the hole is fully open again.

The same logic applies to a finding you cannot fix today. One genuinely broken function
remained, and repairing it required a business answer rather than a rename — which would
have left the check permanently red, and permanently red is a synonym for deleted. Its
references are **named individually** in an allowlist: printed on every run, excluded
from the exit code, and anything not on the list turns the check red. An allowlist that
must spell out what it forgives is documentation; a global threshold that hides the same
thing is amnesia.

## 7 · Replace by inserting first, then deleting

The obvious order for "replace this step's rows" is delete-then-insert. It loses the old
rows whenever the insert fails.

```
insert new rows  →  delete the previously-captured ids
```

A failed insert now leaves the old data intact. The worst case of a failed cleanup is
**visible duplicates, not loss** — and duplicates can be reconciled, while loss cannot.
Choose the failure mode you can recover from.

## 8 · Guard writes with the state you validated against

Between reading a row and writing it, someone else can move it. Scope the update by the
value you checked:

```ts
.eq('id', id)
.eq('status', fromStatus)   // ← the guard
```

Zero rows matched means someone else got there first: report a 409, do not clobber. The
same trick closes a race on completing a pass — `.is('hours', null)` on the `UPDATE`, not
only on the read, so a supervisor at the board and an operator's WhatsApp message cannot
overwrite each other.

## 9 · Optimistic UI needs a snapshot, not a guess

The kanban moves cards at 0 ms perceived latency, which requires being able to *undo*:

```
1. snapshot the query cache
2. write the optimistic state
3. call the server
4. on failure, restore the snapshot verbatim and say why
```

Step 1 is the one people skip. Reconstructing the previous state from the new one is
guessing; keeping the actual previous value is not.

## 10 · Paginate, or lie

PostgREST returns at most **1,000 rows and does not say so**. No error, no flag — an
array of a thousand items looks exactly like a complete one. A query that works in
development works for the first month and starts lying once the shop has history.

It cost this project a profitability screen that summed 1,000 of 4,256 cost lines:

```
COSTO REAL  $809,388,087        actual: ~$3,283,000,000
MARGEN      82%                 actual: 22%
```

`fetch-all.ts` paginates to exhaustion and — critically — returns `truncated` when it
hits its ceiling. That flag is the difference between "your shop earned 22%" and "this
is part of the answer and I don't know which part."

## 11 · Errors in the flattering direction are the dangerous ones

Note the sign in the example above: dropping cost lines makes margin go **up**. Nobody
files a bug about a number that is pleasant.

A 100% margin is not a triumph, it is an unfinished account. Screens should say *"59 OTs
have no recorded cost"* rather than average them in as free. Build the habit of asking of
every metric: **which way does this fail, and would anyone notice?**

## 12 · One event, many doors

An OT can be moved from the kanban, the planning screens, the scan station, or a WhatsApp
message. Four doors is correct — the plant will not stop and use one. What is wrong is
four doors writing to four different places.

```
puerta  →  capture_events  →  applier  →  system of record
```

The corollaries matter more than the diagram:

- **No door may demand data another door owns.** The kanban blocking on a pallet scan was
  wrong precisely because `/operaciones/escanear` exists for that, at the machine, with
  gloves on.
- **Every door leaves the same trace**, including the failures. A photo that could not be
  applied is exactly the one a supervisor needs to see; if only successes were recorded,
  the problem would stay in the sender's phone.
- **Reuse the validated path.** A WhatsApp message moves an OT through the same
  `validateTransition` as a supervisor's drag. A path that writes `status` directly makes
  every rule conditional on which door you came through.

## 13 · Confidence is a routing decision

The message parser has scored its own confidence 0–100 since it was written, and nothing
read it. That score is exactly the input for deciding **apply automatically or queue for
review**, and it lets a single pipeline serve both.

The threshold is set by asymmetry, not by taste. Moving an OT is reversible with a
rollback; closing a pass with the wrong hours contaminates the job's cost and the
machine's historical average. So the whole proposal is gated together, at 70.

## 14 · Resolve ambiguity from what is already written, and ask when you cannot

The warehouse photo tells you *which pallet*, not *for which order*. Asking by text puts
you back where you started. But the system usually already knows — so climb a ladder,
most explicit first:

```
1. the OT written into the label
2. a live reservation on the lot
3. a purchasing requirement pointing at the lot
4. the only OT waiting in storage
```

The moment a rung returns two answers, **ask** — listing candidates so the reply is five
digits. Guessing would be worse than asking: consuming against the wrong OT makes the
traceability confidently point at the wrong lot, and confident wrong is the only kind a
recall cannot survive.

## 15 · Pure core, I/O at the edge

Every rule that matters lives in a pure module with no database access:
`merma`, `partial-advance`, `stage-report`, `whatsapp-flow`, `machine-economics`,
`labor-attribution`, `print-economics`. Routes gather data and call them.

Three payoffs: the rule is testable without fixtures; the **same** rule runs in the
browser form and the server gate, so they cannot disagree; and the edge cases get decided
in one readable place instead of inside a query.

The tell that a module is in the wrong place: `stage-report.ts` takes a label function as
a parameter rather than importing `status-labels`, because it is shared with the server
and a dependency on the presentation layer would tie it to one side.

## 16 · Measure before choosing a limit

A QR decoder needs a size cap. The guessed value (64 MB) rejected real photos while
reporting *"the code isn't visible"* — a wrong answer to the wrong question. Measured:

```
2000 px → 128 MB      3000 px → 192 MB      4000 px → 384 MB
```

384 MB transient in a serverless function is how the process dies. So the limit became 9
megapixels, checked by **reading the image header before allocating anything**, and the
rejection says something the person can act on: *"send it as a photo, not as a file —
WhatsApp will shrink it."*

Three separate lessons: measure rather than guess; check cheaply before committing
resources; and make the error message map to a choice the user actually has.

## 17 · Comments carry the *why*, and name the scar

The convention throughout: a comment does not restate the code, it records the decision
and what happens if it is reversed.

```ts
// `?? undefined` y no `?? []`: una lista vacía significaría «no falta nada»
// y dejaría pasar cualquier OT. Sin dato, la compuerta no corre.
```

Every migration opens with the problem it solves, in the shop's language. This is not
decoration — it is what stops the next person from "simplifying" a guard back into the
bug it was written for.

## 18 · A seed that cannot lie

Demo data is a test of the schema, not a fixture. Seeding four months, ~260 orders and
1,700 shifts found eight real constraints — because writing rows the honest way makes the
database object.

The best of them: reading `validate_worker_assignment_compliance` *before* writing
revealed it sums the **shift's** duration, not `hours_worked`, so a person accepts
exactly one assignment per day. Writing first and reading after would have meant a
half-seeded database and a Postgres error with no obvious cause.

---

# Part III · The tools, and what each one actually taught

## Postgres

The most opinionated teacher in the stack.

| Behaviour | Consequence |
|---|---|
| `CREATE OR REPLACE VIEW` can only **append** columns | New columns land at the end, in an order chosen by the constraint, not by readability |
| `GENERATED ALWAYS` columns invert your arithmetic | `ot_cost_lines.total` is computed, so the seed derives `unit_cost = total / quantity` |
| RLS filters **rows**; it cannot hide a **column** | Private contact details are a `REVOKE` + column `GRANT` problem, not a policy problem |
| plpgsql bodies are text, resolved at run time | `DROP COLUMN` leaves broken functions that nothing detects (§Part II.4) |
| A trigger can count something other than you assume | Read the trigger before writing rows through it |
| `%ROWTYPE` copies the shape at **execution** | Convenient, and the reason a stale field reference survives a deploy |

Also used deliberately: `SECURITY DEFINER` with `EXECUTE` revoked from `anon`/
`authenticated` for anything the service role alone should run; `SELECT … FOR UPDATE` to
serialise split-label generation; partial indexes (`WHERE hours IS NULL`) for the small
hot set a gate queries; `CHECK` constraints mirroring the TypeScript validator so a rule
cannot be written around by another path; enums for statuses so a typo is a database
error rather than a silent no-match.

**Immutability by omission**: `ot_status_history` and `ot_stage_reports` have RLS
`SELECT` policies and no `UPDATE`/`DELETE` policies at all. Evidence you can quietly edit
is not evidence.

## Supabase

PostgREST, storage and auth. The two things worth internalising: the **1,000-row cap**
(§Part II.10), and that `select()` strings are opaque to the type system — the generated
`types.ts` is regenerated after every migration precisely so that drift becomes a
compile error wherever it *can* be one.

## Next.js 16 · React 18 · TypeScript

App Router, server routes under `src/app/api`. Type checking catches shape errors and is
blind to everything expressed as a string — which is most of the interesting failures.
`output: 'standalone'` once broke the Vercel build while the site kept serving the last
good deploy, hiding every push since; CI green on a build configuration production does
not use is worse than no CI.

## TanStack Query

Server cache with explicit keys. Used for optimistic transitions with snapshot rollback
(§Part II.9) and a global `QueryCache.onError` floor under components that never branch
on `isError`.

## Zod

Validation at the boundary, and a distinction worth stating: **Zod checks shape; the
domain module checks meaning.** The hours field caps at 999,999 in Zod purely to protect
the column, while `validateStageReport` owns the real 400-hour limit — because a Zod
rejection says *"Number must be less than or equal to 400"* in English and does not tell
anyone that they typed minutes.

## Vitest

912 tests across 50 files, almost all against pure domain modules. They are fast because
nothing mocks a database — the modules that matter do not touch one.

Test names carry the reasoning, in the shop's language:

```
✓ el arreglo de un tiraje corto no dispara nada
✓ una etapa con dos pasadas abiertas se nombra una vez
✓ nadie tiene dos turnos el mismo día
```

For the QR decoder — the one module whose correctness cannot be reasoned about, only
measured — tests generate real images (`qrcode` → PNG → JPEG at quality 45, a small label
inside a 3000 px photo) and decode them. **A decoder with no round-trip test is a decoder
nobody has run.**

## WhatsApp Cloud API (Meta, direct)

The zero-cost path, chosen after Twilio rejected the account. Things it teaches:

- **Always answer 200.** A non-2xx makes Meta retry the whole envelope, re-running
  messages that already succeeded.
- Media arrives as an **id**, exchanged for a short-lived URL that needs the same bearer
  token.
- A captionless photo has no text body — and the intake dropped it for exactly that
  reason, discarding the most natural gesture the warehouse has.

## Image and QR decoding

`jsqr` + `jpeg-js` + `pngjs`, pure JavaScript, no native build. `sharp` sits in
`node_modules` because Next drags it in — using an undeclared transitive dependency means
the day Next stops shipping it, production breaks and no test notices.

One counter-intuitive detail: downscaling uses **nearest-neighbour**, not averaging.
Averaging produces a prettier image and a worse code — it blurs precisely the
black/white module edge the reader is looking for.

## The scripts

```
npm run check:migrations   functions defined by more than one migration
npm run check:functions    functions naming columns that no longer exist
npm run verify:csp         CSP wiring
npm run test:smoke         the app actually boots and serves
npm run seed:demo          rehearsal by default; --write to apply
```

`seed:demo` printing its plan and writing nothing unless asked is the same instinct as
`fetch-all`'s `truncated` flag: **make the dangerous thing require a sentence.**

---

# Part IV · The failure taxonomy

Every one of these happened here. Grouped by what would have caught it, because that is
the useful axis.

| Failure | Caught by | Missed by |
|---|---|---|
| Dead column in a plpgsql body | `check:functions`, the person who used it | tsc, tests, deploy |
| Dead column in a `.select()` string | Runtime 400 in production | tsc |
| PostgREST 1,000-row truncation | Reading a number and disbelieving it | Every automated check |
| Unread `error` on a Supabase call | ESLint rule (~50 sites, held at `warn`) | tsc, tests |
| Unit error (colour vs pass, sheet vs lift) | Domain arithmetic against a real invoice | Everything else |
| Calculated gate nobody consulted | Asking why a rule never fires | Tests of the gate itself |
| Two screens computing the same thing | Noticing they disagree | Tests of either one |
| Build failing while the site works | Reading the deploy log | The working site |
| A number wrong in the flattering direction | Suspicion | Human review |

The uncomfortable summary from the 2026-07 audit still stands:

> Every bug in that pass was invisible to every automated check the project had, and
> visible within seconds to anyone who opened the screen and asked what the numbers
> meant.

Checks are worth keeping and more were added. But the thing that found them was a person
reading a screen and refusing to accept that the shop had no work today.

---

# Part V · The working rules

Condensed, in the order they tend to matter.

1. **Ask what breaks when this lands**, not whether it compiles.
2. **Name what is missing.** A gate that says "incomplete" makes someone go looking.
3. **Block on impossible, never on absent.** Then collect the debt where the person who
   owes it still exists.
4. **Give every gate a door.** A rule with nowhere to comply is a trap.
5. **Derive the second copy.** Two stored truths become two different truths.
6. **Ask the catalog.** A grep cannot see inside a function body or a query string.
7. **Turn every ritual into a script.** Knowledge in a document does not run on deploy.
8. **Precision over recall in controls.** One that cries wolf gets switched off.
9. **Choose the failure you can recover from.** Duplicates over loss, every time.
10. **Guard the write with the state you validated.**
11. **Paginate, and say when you truncated.**
12. **Ask which way it fails.** The flattering direction is the one nobody reports.
13. **Many doors, one event.** No door may demand what another door owns.
14. **Resolve from what is written; ask when it is ambiguous.** Never guess an identity.
15. **Keep the rules pure.** One definition, shared by the form and the gate.
16. **Measure before you pick a limit**, and make the error name the user's next move.
17. **Write the why, and name the scar** — so the guard is not simplified back into the
    bug.
18. **Meet people where they work.** Gloves, a phone, a machine running. If it needs
    typing, it will not happen.

---

*Companion documents: `README.md` for what the system does, `NOTES.md` for the incident
log this was distilled from.*
