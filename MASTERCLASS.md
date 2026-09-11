# Masterclass

The science, the techniques, and the tools behind this project — compiled so the
reasoning outlives the incident that taught it.

A print shop makes an unforgiving teacher. It has physics you cannot argue with, money
that quietly runs in the wrong direction the moment you get a unit wrong, and people in
ink-stained gloves who will simply not use software that asks them to type. Nearly
everything below was learned the hard way: ship the wrong number, watch what it costs,
then go find out why.

`README.md` says what the system does. `NOTES.md` is the incident log — what broke, and
how it was diagnosed. **This file is the layer in between: the lesson, kept long after
the incident that taught it has been forgotten.**

```
158 migrations · 153 API routes · 72 domain libraries · 76 pages · 912 tests
```

---

# Part I · The science of the shop

Forget "orders and statuses" — that's the UI, not the domain. The real domain is sheets,
passes, make-ready, spoilage and machine-hours, and every one of them is carrying a unit
just waiting to be gotten wrong.

## 1 · Everything converges on the sheet

The **pliego** — the press sheet — is where geometry, weight, cost and traceability quietly
turn out to be the same problem wearing four different hats:

| Question | Resolves to |
|---|---|
| How many products fit? | Imposition: units per sheet |
| What does the paper weigh? | Sheet area × grammage × sheets |
| What does the run cost? | Sheets × cost per sheet |
| Which lot did this box come from? | The sheets consumed from that lot |

Get the sheet wrong and all four answers go wrong together, in the same direction,
without so much as a warning light. That is exactly what was happening before
`ot-calculations.ts` was made to compute imposition **once**, with the cost engine and
the visual preview both reading that same single result. They used to compute it
separately. They disagreed. The audit wrote the disagreement up as OF-14.

Imposition itself is more than `floor(sheet_area / piece_area)` — a division that clean
never survives contact with a real press. It has to account for the **gripper margin**
(the strip the press physically grabs and can never print on), **bleed**, and both
rotations of the piece against both orientations of the sheet. Skip any of that and the
naive division overstates yield by 10–20%, which understates paper cost by exactly the
same amount — a quiet, symmetrical way of being wrong.

## 2 · A press pass is not a colour

The single most expensive unit error this project ever shipped.

A 4-colour-front job on a **4-body press is one pass**, not four. The sheet goes through
the press exactly once, and four units lay down ink in sequence during that single trip.
Cost it per colour instead of per pass, and press hours get overestimated by up to
**4×** (audit OF-15) — a rounding habit the size of an entire extra shift, invoiced to
every job that used it.

```
passes = ceil(colours_front / bodies) + ceil(colours_back / bodies)
```

A 4/4 job on a 4-body press is two passes — one per side. A 6-colour job on that same
4-body press is *also* two passes for the front alone, because the sixth colour has to
wait for the sheet to come back around. `pressPasses()` in `ot-calculations.ts` is the
one place that gets to know this, and `stage-report.ts` borrows its answer to work out
how much make-ready a fragment of the job is carrying.

## 3 · Make-ready is a fixed cost, and it does not divide

Before a single saleable sheet leaves the press, the operator has already burned a stack
of sheets just getting registration and colour right. A die-cut setup costs the same way.
That cost is **per pass**, not per unit — which is precisely why two calculations that
each sound reasonable are both wrong:

**Wrong per-run:** a flat "5% + 50 sheets" waste allowance. It starves short runs, where
make-ready is most of the cost, and pads long ones where it barely registers.

**Wrong per-fragment:** when half an order moves on to the next process, splitting the
make-ready proportionally sounds fair and isn't. `partial-advance.ts` exists for exactly
this case:

> If a 6,000-unit job carries 300 make-ready sheets and half of it advances, the first
> fragment does not take 150. It takes all 300, plus its half of the run. The second
> fragment does not set the machine up a second time — it already happened once.

Split the make-ready proportionally instead, and the first fragment leaves the press
short of paper with the job already mounted and running.

## 4 · Merma is judged against the run, never as a bare percentage

**Merma** — the paper that went into the machine and did not come out saleable — is the
single largest controllable cost in offset. A ruined sheet was bought, printed, and held
the press hostage for the duration: paid for three times over and sold exactly zero.

Two rules, both living in `merma.ts`:

**The rate divides by paper *entered*, never by good output.**

```
merma % = merma ÷ (buenos + merma)
```

Divide by good sheets instead and a job that was lost *entirely* reports over 100% —
which sounds like nonsense until you realise that's exactly the case the number needs to
be able to say out loud.

**The tolerance band moves with run length**, because make-ready is a fixed cost hiding
inside a percentage:

| Run | Normal | High |
|---|---|---|
| Short (≤ 2,000 sheets) | 10% | 18% |
| Medium (≤ 20,000) | 5% | 10% |
| Long (> 20,000) | 2.5% | 5% |

8% spoilage on 500 sheets is forty sheets of ordinary setup waste — nothing to see here.
8% on 100,000 sheets is a machine with a real problem. One global threshold would flag
every short run in the shop and miss every genuine fault hiding in the long ones.
Aggregating always weights by paper, never by averaging the rates themselves — averaging
would let a 500-sheet job and a 100,000-sheet job outvote each other equally, which is
not how a print shop's economics actually work.

## 5 · Cost per thousand, and margin per press hour

Two numbers actually run a print shop, and "total cost" is neither of them.

**Cost per thousand** is the unit the industry quotes in, for good reason: total cost
can't be compared across a 5,000-unit run and a 150,000-unit run — the bigger one is
always more expensive, and that fact alone tells you nothing useful.

**Margin per press hour** is the number that decides what actually runs on Monday
morning, and — tellingly — the one nobody was computing:

```
$400,000 over 8 hours  =  $50,000/hour
$200,000 over 2 hours  = $100,000/hour   ← take this one
```

When the press is the bottleneck — and in a print shop it always is — the job worth
taking is not the one with the fattest margin, it's the one that pays best per hour of
the one resource you can't get more of. Schedule by absolute margin instead, and the
press fills up with big, slow, comfortable-looking jobs while the ones that actually pay
get quietly crowded out. `print-economics.ts` owns both numbers, on purpose, side by
side.

## 6 · A machine hour has a derivable price

The plant was carrying two different answers to "what does an hour on this machine
cost?" and had simply never put them next to each other. `machines` already knew
`energy_cost_per_hr`, `maintenance_cost_monthly`, and `depreciation_monthly`; the costing
catalog, meanwhile, was quoting an hourly rate somebody had typed in once, some time ago,
for reasons nobody could now reconstruct.

`machine-economics.ts` derives the rate honestly from the iron's own numbers and reports
the drift against whatever the catalog says — so the gap becomes something you can see,
instead of something quietly eating margin in the dark:

```
hourly = energy + (maintenance_monthly + depreciation_monthly) / monthly_hours
```

`DEFAULT_MONTHLY_PRODUCTIVE_HOURS = 195` — one shift, five days, 4.33 weeks — was chosen
**deliberately low**. Spread a fixed cost over fewer hours and the hour looks more
expensive, not less; and in a print shop, under-quoting is the mistake that actually
draws blood, so the default leans toward the safer kind of wrong.

This was also the multiplicand with nothing to multiply — until stage closures started
recording real hours worked (`stage-report.ts`), and the formula finally had something
true to chew on.

## 7 · Labour is clock events, not a number someone types

`labor-attribution.ts` is the last weld in a chain that runs **person → wage → machine →
OT**. Every rail it needs already existed in the schema; nothing was wiring them
together:

```
attendance_events   clock_in/out per employee per station (QR kiosk)
worker_assignments  employee → machine → shift → date → ot_id
compensation_rates  hourly_rate + overtime multiplier, effective-dated
ot_real_costs       the destination
```

The module itself is a pure function sitting in the middle, so the plant's actual edge
cases — an operator who forgets to clock out, a double punch, a night shift that crosses
midnight, one station juggling several OTs in a single day — get settled once, in
testable code, instead of being improvised fresh inside a route every time one shows up.

Rates are **effective-dated** on purpose: payroll for March has to use March's rate, not
today's. A join that just grabs "the current rate" quietly rewrites history the moment
anyone gets a raise.

## 8 · Paper is bought by weight and consumed by the sheet

`paper-units.ts` exists because the invoice and the machine are speaking two different
languages. Suppliers quote by the kilogram or the ream; the press only ever eats sheets.
Translating between them needs the sheet's geometry and its grammage:

```
kg = (width_m × height_m) × gsm/1000 × sheets
```

That conversion has to be exact and shared everywhere, because it's the hinge the
purchase order and the production estimate swing on. `50.000` in a Chilean invoice reads
as fifty thousand, not fifty-point-zero — and one migration is named directly after the
bug that assumed otherwise
(`20260817140000_50_000_no_son_cincuenta_mil`).

## 9 · Traceability is a physical chain, not a log

Food-packaging certification (FSSC 22000) doesn't ask for an audit log. It asks a
question, and expects an answer on the spot: *given this box on a supermarket shelf, show
me the paper it came from, the purchase order that bought it, the certificate that was
valid on the day it was used, and the photograph of what actually shipped.*

Answering that on demand forces a chain of **physical** links, each one recorded at the
exact moment it happens, not reconstructed afterward:

```
lote → OC → proveedor → certificado
  ↓
consumo (fecha, OT, cantidad, quién)
  ↓
OT → guía de despacho → factura
```

`consumir_lote()` is the single door in that entire chain. It checks retention, balance,
competing reservations and certificate validity **in one transaction**, because a second
path that can write a consumption without those same checks makes the whole chain
unprovable — one honest door and one side door is the same as no door. Two things follow
from that:

- **Every capture channel routes through it** — the scan station, and now a photo sent
  from a phone. The photo replaces the keyboard; it does not get to skip a single rule.
- **A deviation is data, not a bypass.** Using a lot whose certificate has expired is
  sometimes the right call to make — it just requires a written authorisation, stored
  directly on the transaction (`authorized_deviation`, `deviation_reason`). A rule with
  no legitimate exception is a rule people learn to quietly route around instead.

Reserving is kept separate from consuming. A reservation never touches the physical
balance — it only constrains what can honestly be *promised* — and it expires on its own,
so a job that falls through releases its paper without anyone having to remember to let
it go.

## 10 · The guillotine cuts by the lift — and is still costed wrong

Kept here on purpose, because it is unfinished and instructive in equal measure. A
guillotine does not cut sheet by sheet; it cuts a **lift** of roughly 500 sheets in one
stroke. Cost it as a continuous process instead, and a 25,770-sheet cut prices out at 8.9
hours against the 1–2 it actually takes on the floor.

The rate now carries lifts-per-hour *expressed* in sheets/hour, so the shape of
`FINISH_RATES` survives intact — but `machines.optimal_speed_sheets_hr` still carries the
same defect underneath, and needs a sheets-per-lift column before it can be called fixed
honestly rather than papered over. **A workaround that preserves the wrong unit is still
a debt — it just belongs in writing, so nobody mistakes it for paid off.**

---

# Part II · Techniques

## 1 · A gate names what is missing

Every workflow gate in `ot-state-machine.ts` refuses with the specific thing that's
absent — never with a vague category standing in for it:

```
✗  "Ficha incompleta"
✓  "Faltan 3 datos para poder mandar la prueba: montaje confirmado,
    arte adjunto, operaciones revisadas."

✗  "No se puede despachar"
✓  "No se puede despachar con la pasada por Troquelado sin cerrar.
    Falta decir cuántas horas tomó — se puede desde el tablero, o el
    operario lo manda por WhatsApp."
```

A message that names the gap can be acted on immediately; a category just sends the
reader off to go looking for it themselves. The second version also names *where* to fix
it — which is the actual difference between a rule and a trap wearing a rule's clothes.

## 2 · Absent data does not block; wrong data does

The hardest design call in the whole system, and one that generalises well past this
project.

A gate that stops all work until a field gets filled in does not, in fact, produce the
field. It produces work that now happens *outside* the system instead — the shop keeps
running regardless, only the record grinds to a halt. So the rule became:

> **Moving a card is never blocked. Finishing an order is.**

Any door may advance an OT carrying nothing but a destination. Whatever it doesn't carry
stays **open** and visible — an amber ring on the card, impossible to miss. The gate that
already demanded real costs before dispatch simply gained one more condition to check: no
open passes left behind.

The same validator turns hard exactly where it should. `480` typed into an hours field is
almost certainly a typo for minutes, and it gets rejected outright — not because hours are
mandatory, but because a wrong number quietly enters the order's cost and the machine's
historical average *looking completely true*. A blank is visible and easy to fix; a wrong
value first has to be caught in the act.

**Hard on the impossible, soft on the absent.**

And whenever a gate does fire, there has to be a door on the other side of it:
`PasadasPendientes` exists because telling someone "go close the die-cutting pass"
without showing them anywhere to actually do that is a trap dressed up as a rule.

## 3 · Derive; do not store the same truth twice

At one point this system had **seven** separately stored answers to the single question
"where is this OT right now?": `status`, five different `flag_*` columns,
`proceso_actual`, the machine schedule, the WhatsApp start/end session, `worker_assignments`,
and stage passes. None of them derived from any other, so naturally they drifted apart —
and when they disagreed with each other, nothing was watching closely enough to notice.

The rule that followed: if B can be computed from A, compute it, full stop.
`ot_stage_reports` has no `estado` column at all, because "open" *is* simply
`hours IS NULL` — a second place to say the same thing is just a second place for it to
quietly start lying.

The corollary matters just as much: knowing when **not** to derive. Hours are stored
separately from money, because hours × rate *is* money and the rate changes over time —
keeping the raw fact apart from its valuation is what lets cost be recomputed later
without having to rewrite the shop's actual history.

## 4 · Ask the catalog, not the grep

`DROP COLUMN` does not validate plpgsql function bodies. Postgres only resolves a
function's references when it **runs**, not when it's created — so a dropped column
quietly leaves broken functions behind that sail through every deploy, every type check
and every test, right up until the first time a real person actually calls them.

A TypeScript grep is structurally blind to this. The database, asked nicely, is not:

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND pg_get_functiondef(p.oid) ILIKE '%dropped_column%';
```

The same blind spot shows up in the opposite direction, too: a dead column sitting inside
a PostgREST `.select('a, b, c')` string is, as far as the compiler is concerned, **just
text**. `tsc` stays cheerfully green while production quietly returns 400.

## 5 · A tripwire beats a fix, and a ritual is not a control

Fixing thirty instances of the same two patterns leaves the patterns fully intact,
waiting for instance thirty-one. This repository's actual response to an audit was three
tripwires instead of thirty individual edits:

- an **ESLint rule** catching `const { data } = await supabase…` with `error` left
  unread;
- a global **`QueryCache` `onError`** floor underneath components that never bother
  checking `isError`;
- **`npm run check:migrations`**, which lists every function defined more than once
  across migrations.

And then came the lesson that took a fourth incident to actually land: the `pg_proc`
query above had already been written down once, saved, and even quoted verbatim inside a
migration comment — and the exact same defect happened again anyway, because **a check
that depends on someone remembering to run it is not a control**. It's a script now:
`npm run check:functions`.

> A lesson is not learned until something other than a person is responsible for
> remembering it.

## 6 · A control that cries wolf gets switched off

`check:functions` only reports references it can resolve to a **concrete table**: a
`%ROWTYPE` variable's fields, `NEW`/`OLD` inside a trigger, an `INSERT` column list, an
`UPDATE … SET` target, an aliased `FROM`. Anything it cannot tie back to an actual table,
it stays quiet about — on purpose.

The easy version of this check — flag any word that isn't a known column — catches every
real case and also roughly two hundred fictional ones. Even the careful version lied
twelve times on its first run, and the fix wasn't to tune a threshold, it was to model
reality more honestly: one trigger function can hang off two different tables and branch
on `TG_TABLE_NAME`, so a field only counts as wrong if it exists in *neither* of them.

**Precision over recall, for anything meant to actually be trusted.** A check that
narrows the hole and never lies survives. One that closes the hole but cries wolf gets
disabled within a month, and then the hole is wide open again — just with a false sense
of safety bolted on top.

The same logic applies to a finding you genuinely cannot fix today. One function stayed
truly broken, because repairing it needed a business decision rather than a rename — and
leaving it flagged would have left the check permanently red, and permanently red is just
a slower way of saying deleted. Its references are instead **named individually** in an
allowlist: printed on every single run, excluded from the exit code, and anything not
already on that list still turns the check red. An allowlist that has to spell out
exactly what it forgives is documentation. A global threshold that quietly hides the same
thing is amnesia with extra steps.

## 7 · Replace by inserting first, then deleting

The obvious order for "replace this step's rows" is delete-then-insert. It also happily
loses the old rows forever the moment the insert fails halfway through.

```
insert new rows  →  delete the previously-captured ids
```

Flip the order, and a failed insert now leaves the old data completely intact. The worst
case of a failed cleanup becomes **visible duplicates, never silent loss** — and
duplicates can always be reconciled later, while loss simply cannot. Choose the failure
mode you can actually recover from.

## 8 · Guard writes with the state you validated against

Between the moment you read a row and the moment you write it back, someone else can
walk in and move it. Scope the update by the exact value you already checked:

```ts
.eq('id', id)
.eq('status', fromStatus)   // ← the guard
```

Zero rows matched means someone else got there first — report a 409 and back off, don't
clobber their work. The same trick closes a race on completing a pass —
`.is('hours', null)` on the `UPDATE` itself, not only on the earlier read — so a
supervisor standing at the board and an operator texting from the floor can't silently
overwrite each other's version of events.

## 9 · Optimistic UI needs a snapshot, not a guess

The kanban moves cards at 0 ms of perceived latency, and that trick only works if it can
*undo* itself cleanly when the server disagrees:

```
1. snapshot the query cache
2. write the optimistic state
3. call the server
4. on failure, restore the snapshot verbatim and say why
```

Step 1 is the one people skip, every time. Reconstructing the previous state by working
backward from the new one is guessing dressed up as engineering; keeping the actual
previous value around is just remembering.

## 10 · Paginate, or lie

PostgREST returns at most **1,000 rows, and does not tell you that it did**. No error, no
flag, nothing — an array of exactly a thousand items looks identical to a complete one in
every way that matters, right up until it very much isn't. A query that works perfectly
in development keeps working for the first month in production, then starts quietly
lying the moment the shop actually accumulates some history.

It cost this project a profitability screen that confidently summed 1,000 of 4,256 real
cost lines and reported it as the whole picture:

```
COSTO REAL  $809,388,087        actual: ~$3,283,000,000
MARGEN      82%                 actual: 22%
```

`fetch-all.ts` now paginates to exhaustion and — this is the part that actually matters —
returns `truncated` the moment it hits its own ceiling. That one flag is the entire
difference between "your shop earned 22%" and "this is part of the answer, and I genuinely
don't know which part."

## 11 · Errors in the flattering direction are the dangerous ones

Look again at the sign of that example: dropping cost lines makes margin go **up**.
Nobody, anywhere, ever files a bug report about a number that made their day better.

A 100% margin is not a triumph to celebrate — it's an unfinished account waiting to be
noticed. Screens should say *"59 OTs have no recorded cost"* out loud, rather than quietly
averaging them in as if they were free. Build the habit of asking of every single metric:
**which way does this fail, and would anyone actually notice if it did?**

## 12 · One event, many doors

An OT can be moved from the kanban, the planning screens, the scan station, or a
WhatsApp message. Four doors is exactly correct — the plant is not going to stop and
gather around one screen just because the software would prefer it. What's wrong is four
doors each quietly writing to four different places.

```
puerta  →  capture_events  →  applier  →  system of record
```

The corollaries end up mattering more than the diagram itself:

- **No door may demand data that another door owns.** The kanban blocking on a pallet
  scan was wrong for exactly this reason — `/operaciones/escanear` already exists for
  that, at the machine, with gloves on and no patience for a modal.
- **Every door leaves the same trace, including its failures.** A photo that couldn't be
  applied is precisely the one a supervisor most needs to see; record only the successes,
  and the problem just quietly stays trapped in the sender's phone forever.
- **Reuse the validated path, don't parallel it.** A WhatsApp message moves an OT through
  the exact same `validateTransition` a supervisor's drag-and-drop does. A path that
  writes `status` directly makes every rule in the system conditional on which door
  happened to be used.

## 13 · Confidence is a routing decision

The message parser has been scoring its own confidence from 0–100 since the day it was
written, and for a long time nothing actually read that number. It turns out to be
exactly the input needed to decide **apply automatically, or queue for human review** —
and reading it lets one single pipeline serve both cases without forking in two.

The threshold itself comes from asymmetry, not from taste. Moving an OT is cheaply
reversible with a rollback; closing a pass with the wrong hours contaminates both the
job's cost *and* the machine's historical average going forward. So the whole proposal
gets gated together, at 70 — because the expensive mistake sets the bar for the cheap one
too.

## 14 · Resolve ambiguity from what is already written, and ask when you cannot

A warehouse photo tells you *which pallet* — it does not tell you *for which order*.
Asking by text just puts a human back where the system started. But most of the time the
system already knows the answer somewhere, so it climbs a ladder, most explicit rung
first:

```
1. the OT written into the label
2. a live reservation on the lot
3. a purchasing requirement pointing at the lot
4. the only OT waiting in storage
```

The instant a rung returns two possible answers, the system **asks** — listing the
candidates so the reply back is just five digits, not a paragraph. Guessing would be
strictly worse than asking: consuming against the wrong OT makes the traceability chain
confidently point at the wrong lot, and a confident wrong answer is the one kind a real
recall cannot survive.

## 15 · Pure core, I/O at the edge

Every rule that actually matters lives in a pure module with zero database access:
`merma`, `partial-advance`, `stage-report`, `whatsapp-flow`, `machine-economics`,
`labor-attribution`, `print-economics`. Routes exist only to gather data and call them.

Three payoffs fall out of that split for free: the rule is testable without a single
fixture; the **same** rule runs inside the browser form and the server-side gate, so the
two of them are structurally incapable of disagreeing; and the genuinely gnarly edge
cases get decided once, in one readable place, instead of getting reinvented inside
whichever query happened to need them this week.

The tell that a module has drifted into the wrong place: `stage-report.ts` takes a label
function *as a parameter* rather than importing `status-labels` directly, because it's
shared with the server, and a hard dependency on the presentation layer would tie a pure
rule to one particular side of the fence.

## 16 · Measure before choosing a limit

A QR decoder needs a size cap somewhere. The first guess (64 MB) rejected perfectly real
phone photos while confidently reporting *"the code isn't visible"* — a wrong answer to
an entirely different question than the one being asked. So it got measured instead of
guessed:

```
2000 px → 128 MB      3000 px → 192 MB      4000 px → 384 MB
```

384 MB transient inside a serverless function is exactly how that process dies mid-request.
So the real limit became 9 megapixels, enforced by **reading the image header before
allocating a single byte**, and the rejection message says something a person can
actually act on: *"send it as a photo, not as a file — WhatsApp will shrink it for you."*

Three separate lessons stacked in one fix: measure rather than guess; check cheaply
*before* committing real resources; and make the error message map onto a choice the user
genuinely has.

## 17 · Comments carry the *why*, and name the scar

The convention throughout the codebase: a comment never restates what the code already
says — it records the decision, and what happens the day someone reverses it.

```ts
// `?? undefined` y no `?? []`: una lista vacía significaría «no falta nada»
// y dejaría pasar cualquier OT. Sin dato, la compuerta no corre.
```

Every migration opens with the problem it solves, written in the shop's own language.
That is not decoration for its own sake — it's the thing that stops the next person from
"simplifying" a guard straight back into the exact bug it was written to prevent.

## 18 · A seed that cannot lie

Demo data is a test of the schema, not a convenient fixture to hand-wave past. Seeding
four months, roughly 260 orders, and 1,700 shifts turned up eight real constraints —
purely because writing rows the honest way makes the database object loudly when
something doesn't actually add up.

The best of the eight: reading `validate_worker_assignment_compliance` *before* writing a
single row revealed that it sums the **shift's** duration, not `hours_worked` — meaning a
person can only ever accept exactly one assignment per day. Write first and read the
function afterward, and the same discovery arrives as a half-seeded database and a
cryptic Postgres error with no obvious cause attached to it.

---

# Part III · The tools, and what each one actually taught

## Postgres

The most opinionated teacher in the whole stack.

| Behaviour | Consequence |
|---|---|
| `CREATE OR REPLACE VIEW` can only **append** columns | New columns land at the end, in an order chosen by the constraint, not by readability |
| `GENERATED ALWAYS` columns invert your arithmetic | `ot_cost_lines.total` is computed, so the seed derives `unit_cost = total / quantity` |
| RLS filters **rows**; it cannot hide a **column** | Private contact details are a `REVOKE` + column `GRANT` problem, not a policy problem |
| plpgsql bodies are text, resolved at run time | `DROP COLUMN` leaves broken functions that nothing detects (§Part II.4) |
| A trigger can count something other than you assume | Read the trigger before writing rows through it |
| `%ROWTYPE` copies the shape at **execution** | Convenient, and the reason a stale field reference survives a deploy |

Also used deliberately: `SECURITY DEFINER` with `EXECUTE` revoked from `anon`/
`authenticated` for anything only the service role should ever run; `SELECT … FOR UPDATE`
to serialise split-label generation so two requests can't both think they went first;
partial indexes (`WHERE hours IS NULL`) for the small hot set a gate actually queries;
`CHECK` constraints mirroring the TypeScript validator so a rule can't simply be written
around through another path; enums for statuses, so a typo turns into a loud database
error instead of a silent no-match nobody notices.

**Immutability by omission**: `ot_status_history` and `ot_stage_reports` carry RLS
`SELECT` policies and *no* `UPDATE`/`DELETE` policies at all. Evidence that can be
quietly edited later isn't really evidence — it's a diary with an eraser built in.

## Supabase

PostgREST, storage and auth, bundled together. Two things worth carrying around for
life: the **1,000-row cap** (§Part II.10), and the fact that `select()` strings are
completely opaque to the type system — the generated `types.ts` gets regenerated after
every single migration for exactly this reason, so that drift becomes a compile error
everywhere it's actually possible to catch it as one.

## Next.js 16 · React 18 · TypeScript

App Router, server routes under `src/app/api`. Type checking is excellent at catching
shape errors and completely blind to anything expressed as a plain string — which turns
out to be most of the genuinely interesting failures. `output: 'standalone'` once broke
the Vercel build outright while the site kept right on serving the last good deploy,
quietly hiding every single push made since; a green CI on a build configuration
production doesn't even use is worse than having no CI at all, because it actively lies
about being one.

## TanStack Query

Server cache with explicit keys. Used here for optimistic transitions with snapshot
rollback (§Part II.9), plus a global `QueryCache.onError` floor underneath components
that never got around to branching on `isError` themselves.

## Zod

Validation at the boundary — and a distinction worth stating plainly: **Zod checks
shape; the domain module checks meaning.** The hours field caps at 999,999 in Zod purely
to protect the column from absurdity, while `validateStageReport` owns the real 400-hour
limit that actually matters — because a Zod rejection says *"Number must be less than or
equal to 400"* in flat, generic English, and never once tells anyone that what they
actually typed was minutes.

## Vitest

912 tests spread across 50 files, almost all of them aimed squarely at pure domain
modules. They run fast for a simple reason: nothing mocks a database, because the modules
that matter most never touch one in the first place.

Test names carry the reasoning itself, written in the shop's own language:

```
✓ el arreglo de un tiraje corto no dispara nada
✓ una etapa con dos pasadas abiertas se nombra una vez
✓ nadie tiene dos turnos el mismo día
```

For the QR decoder — the one module whose correctness can't be reasoned about from first
principles, only measured — the tests generate real images (`qrcode` → PNG → JPEG at
quality 45, a small label buried inside a 3000 px photo) and then actually decode them.
**A decoder with no round-trip test is a decoder nobody has actually run.**

## WhatsApp Cloud API (Meta, direct)

The zero-cost path, chosen only after Twilio rejected the account outright. What it
teaches, in order of how expensive the lesson was:

- **Always answer 200.** A non-2xx response makes Meta retry the entire envelope,
  cheerfully re-running messages that had already succeeded the first time.
- Media arrives as an **id**, which then has to be exchanged for a short-lived URL using
  the same bearer token all over again.
- A captionless photo has no text body at all — and the intake used to drop it for
  exactly that reason, discarding the single most natural gesture anyone in the
  warehouse actually makes.

## Image and QR decoding

`jsqr` + `jpeg-js` + `pngjs`, pure JavaScript, no native build to fight with. `sharp`
still sits in `node_modules` because Next drags it in on its own — depending on an
undeclared transitive package like that means the day Next stops shipping it, production
breaks with no warning and no test anywhere notices.

One genuinely counter-intuitive detail: downscaling uses **nearest-neighbour**, not
averaging. Averaging makes a visibly prettier image and a measurably worse code — it
blurs precisely the black/white module edge the reader is straining to find.

## The scripts

```
npm run check:migrations   functions defined by more than one migration
npm run check:functions    functions naming columns that no longer exist
npm run verify:csp         CSP wiring
npm run test:smoke         the app actually boots and serves
npm run seed:demo          rehearsal by default; --write to apply
```

`seed:demo` printing its plan and writing absolutely nothing unless explicitly told to is
the same instinct as `fetch-all`'s `truncated` flag: **make the dangerous thing require a
full sentence, not a single keystroke.**

---

# Part IV · The failure taxonomy

Every one of these actually happened, here, on this project. Grouped by what would have
caught it, because that turns out to be the only axis worth sorting by.

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

The uncomfortable summary from the 2026-07 audit still stands, word for word:

> Every bug in that pass was invisible to every automated check the project had, and
> visible within seconds to anyone who opened the screen and asked what the numbers
> meant.

The checks below were worth keeping, and more got added since. But the thing that
actually found every one of these was a person reading a screen, and simply refusing to
believe that the shop genuinely had no work today.

---

# Part V · The working rules

Condensed, roughly in the order they tend to bite.

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
