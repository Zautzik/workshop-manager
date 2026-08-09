# Engineering log

What broke, how it was found, and what the fix taught.

These are kept because the fixes are less interesting than the diagnoses. Most of them
share a shape: the code did exactly what it said, the thing it said was wrong, and
nothing complained. Type checks passed. Tests passed. The screen rendered. The number
was wrong by a factor of 875.

---

## 1 · The costing engine preferred a corrupt price book, by explicit rule

The single most expensive bug in the repository, in the function the application exists
to run.

`costing-resolver.ts` resolves what a kilo of paper costs. It had two sources: the cost
catalogue (maintained by the office) and the purchase-weighted average of actual
inventory lots. The rule was one line of comment and one line of code:

> *Prefer the real purchase-weighted cost when a matching material has lots.*

Reasonable. Actual purchases beat a list price. Except the seeded lots carried
`$3.20/kg` for board that the catalogue listed at `$2,800/kg` — three orders of
magnitude apart, because the two had been generated at different times by different
hands. The rule was unconditional, so the engine chose `$3.20` **every time**, on the
largest line item in any print job.

**Paper understated by 875×.**

And in the other direction: lots coexisted in kilos, reams and units with no conversion.
A price per ream charged as a price per kilo overstated by about 11×.

### How it was found

Not by reading the code — the code reads fine. By asking a different question: *given
the rows actually in this database, which number does this function return?* Then
running it. The answer was `3.2`.

### The fix

Preference became conditional on plausibility. [`material-price-sanity.ts`](src/lib/material-price-sanity.ts)
holds a sanity band per unit — a substrate priced per kilo is between $100 and $200,000,
full stop — and `chooseMaterialPrice` picks the credible candidate, converting between
units when it has the geometry to do so.

Then the same band went into the database as a `CHECK` constraint, so the bad data
cannot come back in silence:

```sql
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_precio_con_escala
  CHECK (estimated_unit_cost IS NULL OR unit <> 'kg' OR estimated_unit_cost >= 100);
```

### What it taught

A preference rule with no plausibility check is a bug waiting for bad data, and bad data
always arrives. *"Prefer the real value"* is only correct if you also decide what
disqualifies a value from being real.

---

## 2 · Everything converges on the sheet

The bug above exposed a deeper hole: `inventory_items` had no sheet geometry. Paper
arrived in kilos, in reams, and as units, and all three entered the costing engine as
`substrate_per_kg` without translation.

The physical truth is that a print shop **buys** paper however the mill sells it and
**produces** in sheets. The press and the guillotine are paid by the hour and their
throughput is measured in sheets per hour. The sheet is where the two halves of cost
meet:

```
sheets × $/sheet                   → material
sheets ÷ sheets-per-hour × $/hour  → machine
```

So [`paper-units.ts`](src/lib/paper-units.ts) exists, and it is small on purpose:

```ts
sheetWeightKg = (widthCm/100 × heightCm/100 × gsm) / 1000
```

Everything else — cost per sheet from a per-ream price, press hours for a sheet count —
follows from that one line plus the geometry the migration added.

One detail worth keeping: `pressHoursForSheets` uses the machine's **optimal** speed,
not its nominal one. Nominal is the manufacturer's catalogue figure, which no press
sustains with real paper and real make-ready. Costing against nominal quietly promises
delivery dates the shop cannot hit.

---

## 3 · The logo was invisible on desktop, and it had nothing to do with the logo

The hex mark rendered on mobile. On desktop, nothing — but the element was in the DOM,
had non-zero dimensions, and the SVG was well-formed.

The component was instantiated four times across the shell. Its gradients used
**hardcoded IDs**:

```tsx
<linearGradient id="ga-bg">…</linearGradient>
<path fill="url(#ga-bg)" />
```

In an SVG, `url(#ga-bg)` resolves to the *first* matching ID in the document. The first
instance in DOM order lived inside a `md:hidden` subtree — `display: none`. On desktop
that subtree is not rendered, so the gradient it owned did not exist, and the three
visible instances painted with a reference to nothing.

### How it was confirmed

Not by reasoning about it — by rewriting the IDs live in the running page and watching
the mark appear. A hypothesis about invisible rendering is worth very little until you
have made the thing appear and disappear on demand.

### The fix

```ts
const uid = useId().replace(/[^a-zA-Z0-9-_]/g, '');
const bgId = `ga-bg-${uid}`;
```

### What it taught

Any SVG component that can be mounted twice needs per-instance IDs. It is not a
theoretical concern; it fails specifically when one instance is hidden, which is exactly
what responsive layouts do all day.

---

## 4 · A chevron at x=1428 caused 12 pixels of horizontal overflow

The page scrolled sideways by a hair. The culprit was a sidebar collapse control:

```tsx
<aside className="…">              {/* position: static */}
  <button className="absolute top-5 -right-3">
```

`position: absolute` resolves against the nearest **positioned** ancestor. The `aside`
was `static`, so the offset parent walked all the way up to `<body>`, and `-right-3`
positioned the button three pixels past the right edge of the *document*, not of the
sidebar.

It had presumably looked correct at some viewport where the numbers coincided.

The control was deleted rather than fixed — it duplicated the hamburger, which is the
next entry.

---

## 5 · Two headers, zero landmarks, and more than one door for the same job

The application shell rendered two `<header>` elements and, because neither carried a
landmark role in a way assistive technology could use, a screen-reader landmark count of
**zero**. The header also occupied layout space at the top of every page, which the
owner described accurately as "a big unused gap".

Merging them into one `<header>` that floats over the content —
`pointer-events-none absolute inset-x-0 top-0 z-30`, with pointer events restored on the
controls themselves — fixed the gap, the landmark count, and the duplicate navigation
in one change.

This turned out to be an instance of the repository's most persistent pattern.

### The pattern: more than one door for the same job

| Two doors | Consequence | Resolved |
|---|---|---|
| `workstations` and `machines` | The same physical press existed twice; assignments split between them | Merged into `machines` |
| `workers` and `employees` | Two identities per person; labour cost resolved against whichever the query joined | Merged into `employees` |
| Three paper price books | The 875× bug above | One catalogue + sanity band |
| Two "Avance" columns | Two answers to *how far along is this?* | One |
| `KANBAN_GROUPS` and a copy of it | Phases drifted between screens | `PRODUCTION_PHASES`, one source |
| Two headers | Zero landmarks | One |

Every one of these was introduced by someone reasonable solving a real problem without
checking whether the problem already had a solution. None of them announced itself. They
were found by asking, repeatedly: *is there another place in this codebase that already
answers this question?*

---

## 6 · The regex that searched for the letter `d`

Shop-floor reports arrive as free-form Spanish over WhatsApp:

> `listo ot 40502, 45000 buenos, 900 de merma, 7.5 horas offset`

The parser builds patterns dynamically because the vocabulary for wasted paper is long
(*fallados, malogrados, perdidos, desechados, arruinados, desperdicio, desecho*). It was
written with a template literal:

```ts
const re = new RegExp(`([\d.]+)\s*(?:${PERDIDO})`, 'g');
```

Inside a JavaScript template literal, `\d` is not a regex token — it is an escape
sequence that the string parser resolves to the character `d`. The regex compiled
successfully and searched for a **character class containing the letter d and a period.**

It matched things. Occasionally the right things. It never threw.

```ts
// The fix: escaped strings, not template literals.
const PERDIDO = '(?:fallad|malogr|perdid|desechad|arruinad)[oa]s?|desperdicio|desecho';
const re = new RegExp('([\\d.]+)\\s*(?:de\\s+)?(?:' + PERDIDO + ')', 'g');
```

### And then the backtracking one

With the escaping fixed, "8000 pliegos fallados" was counted as **both** production and
waste. The production pattern excluded waste with a negative lookahead:

```
([\d.]+)\s*pliegos?(?!\s+(?:fallad…))
```

`pliegos?` is greedy but will backtrack. Given `pliegos fallados`, it matched `pliego`,
leaving `s fallados` — and `s` is not a space, so the lookahead found no waste qualifier
and happily allowed the match. Eight thousand ruined sheets entered the production count
*and* the waste count.

A single word boundary fixes it:

```
([\d.]+)\s*pliegos?\b(?!\s+(?:fallad…))
```

### What it taught

Both failures are silent by construction: a regex that compiles will run, and a regex
that backtracks will find *something*. The only defence is a test that asserts the
extracted **numbers**, not that parsing "worked". The parser now has both, and the demo
seed generates its messages as text and runs them through this same parser — so if it
regresses, fake data breaks in exactly the way real data would.

---

## 7 · What the database taught

Postgres was a better teacher than the ORM.

**`CREATE OR REPLACE VIEW` can only append columns.** It cannot insert one in the middle
or reorder. A migration adding sheet geometry to `material_cost_v` had to place the new
columns at the end, in an order chosen by the constraint rather than by readability.

**A `GENERATED ALWAYS` column inverts your arithmetic.** `ot_cost_lines.total` is
`ROUND(quantity * unit_cost)`, stored. You cannot write a total. So the seed derives
`unit_cost = total / quantity` — the reverse of the natural direction — because the
column that the reporting view sums is the computed one.

**RLS filters rows. It cannot hide a column.** Making employee contact details private
looked like a policy problem and was a `GRANT` problem: `REVOKE` on the table, then
column-level `GRANT` on the non-sensitive columns. A row policy that appears to protect
a column is worse than no protection, because it looks handled.

**A trigger can count something other than what you assume.** Before writing 1,700
labour shifts, reading `validate_worker_assignment_compliance` revealed that it sums the
duration of the **shift** — eight hours from the `shifts` table — not `hours_worked`. So
a person accepts exactly **one assignment per day**, regardless of how briefly they
actually worked. Writing the rows first and reading the trigger after would have meant a
half-seeded database and a Postgres error with no obvious cause.

That constraint became a tested scheduler rather than a comment:

```
✓ nadie tiene dos turnos el mismo día
✓ nadie pasa de cinco turnos en una semana
✓ todo turno tiene persona con nombre
```

**Dropping a column does not break the build.** Retiring `worker_legacy_id` left the
name in five files — inside PostgREST `select()` strings, which are ordinary strings.
`tsc` stayed green. The failures would have been runtime 400s in production. Found by
asking *what breaks when this lands?* rather than *does it compile?*

Similarly, retiring `workstations` nearly missed a foreign key on
`attendance_events.station_id` — not named `workstation_id`, so a name-based search
skipped it. The `DROP` caught it, which is an argument for letting the database enforce
rather than trusting a grep.

---

## 8 · Numbers that were wrong in the flattering direction

A category of bug worth naming separately, because nobody reports it.

**A margin of 100%.** The profitability screen showed 100% margin on orders with no
recorded cost. Technically `(revenue − 0) / revenue = 1`. Practically, a perfect margin
is not a triumph, it is an unfinished account.
[`margin-confidence.ts`](src/lib/margin-confidence.ts) now grades every margin —
`medido`, `sin_costo`, `estimado`, `sin_datos` — and the screen says *"there is no real
cost for this order: the margin is unknown, not 100%."*

**Waste measured against the wrong denominator.** Waste rate divided by *good* sheets
exceeds 100% when a job is lost entirely — which is precisely the case you need to
represent. It is measured against sheets **entered**: `merma ÷ (buenos + merma)`.

**Waste judged without context.** A flat threshold calls 8% bad. But make-ready consumes
sheets before the first good copy comes off in register, and that fixed cost weighs
enormously more on a short run. 8% of 500 sheets is forty sheets of setup — normal. 8%
of 100,000 is a machine with a problem. [`merma.ts`](src/lib/merma.ts) judges against
run length.

**Labour that cost nothing.** `worker_assignments.ot_id` was nullable and the UI left it
null. Every shift not tied to an order contributed zero to that order's cost, so margins
came out high and clean. The data looked complete. It was
[now enforced server-side](src/lib/assignment-rules.ts): if the machine produces, the
shift names the order. Delivery vehicles are exempt on purpose — a truck carries several
orders and forcing it to pick one would invent an attribution.

---

## 9 · Ink cost as much as paper, and nobody had run the numbers

While building the demo seed, a representative job was pushed through the quoting engine
before writing anything — a 200,000-unit folding carton, 300gsm board, 4/0:

```
Sustrato/Papel   $15,033,704
Tintas           $11,273,367   ← 75% of the paper
```

In a print shop ink is on the order of 5% of sales and paper 35%. No quotation with that
ratio survives being looked at by a printer.

The constant said `0.003 kg` of ink per 70×100 sheet per colour — **4.3 g/m² per
colour**, a full solid lay-down across the entire sheet. The working band for offset at
medium coverage is 1 to 1.5 g/m².

The same probe found die-cutting costed at 1,200 sheets/hour while the shop's own
die-cutter row declares `optimal_speed_sheets_hr = 3500` — the same machine costed at a
third of the speed its own record claims. Fifty-seven invented hours on a 100,000-sheet
run.

The tests that now hold these fix **proportions, not numbers**, because the proportions
are what can be defended:

```ts
it('la tinta queda en la banda de 1 a 1,5 g/m² por color', …)
it('la tinta no compite con el papel en el costo del trabajo', …)   // ratio < 0.25
```

### What it taught

Neither error was findable by reading the constant. `0.003` looks like a plausible
number. They were findable only by running a realistic job through the engine and asking
whether the **shape** of the answer matched the trade — which is a different activity
from testing, and one that no amount of unit tests substitutes for.

---

## 10 · A seed that cannot lie

The existing demo data was internally inconsistent: the same material at two scales,
shop-floor reports citing orders that had been deleted, 56 labour shifts attached to no
order at all. Rebuilding it raised a design question worth more than the seed itself.

**A seed that re-implements the business arithmetic will drift from the application, and
the drift will be discovered by whoever is being demoed to.**

So [`scripts/seed/model.ts`](scripts/seed/model.ts) is pure — no database, no clock, no
`Math.random` — and it calls the *same* functions the quoting wizard calls. Sheets,
hours and estimated cost come from `computeOTCalculations` → `generateDefaultOperations`
→ `computeOTPricing`. There is no second arithmetic to diverge.

Real cost is not drawn at random either. The **reason** is drawn — waste above plan,
a re-run for colour registration, paper that rose between quote and purchase order, a
night shift to hit the date — and sheets, hours and money follow from it. Labour is the
sum of individual shifts at each person's actual rate, so the profitability screen and
the labour screen agree because they read the same people working the same hours.

The shop-floor messages are generated as **text** and parsed by the production parser.
A test closes the loop without going through the generator at all:

```ts
it('sumando los partes se reconstruye la merma del trabajo', () => {
  const leidos = j.captures.filter(c => c.kind === 'end')
                           .map(c => parseWhatsAppMessage(c.text).production_data!);
  const v = evaluateMerma({ merma: sum(leidos, 'merma'), buenos: sum(leidos, 'buenos') });
  expect(v.entered).toBe(j.sheetsEntered);
  expect(v.rate!).toBeCloseTo(j.sheetsWasted / j.sheetsEntered, 6);
});
```

### The message the parser could not read

The first draft wrote `45.000 pliegos buenos, 900 de merma`. The parser has a fallback
pattern `buenos?\s*([\d.]+)` — the number *after* the word — so it read **900** as the
good count. The generator now writes `45.000 buenos, 900 de merma`, which the parser
reads correctly, and a comment in the source explains why the wording is not free.

Writing data that a real parser has to accept is a much harder constraint than writing
JSON, and it found a genuine parser weakness in the process.

### And a constraint the seed discovered about the business

Targeting $300M CLP/month of gross margin, the plan demanded roughly 6,000 finishing
hours per month. The shop's six finishing machines at two shifts provide 2,112.

The honest response was not to pretend capacity. It was to model what a real converter
does — subcontract the overflow at a premium — so 144 of 245 jobs go outside at a 35%
markup, roughly $414M. That is now a question the database can answer instead of a
suspicion the plant manager carries around: **the bottleneck in this shop is finishing,
not the press.**

---

## 11 · Recurring, and worth stating plainly

**"The data exists, nobody consults it."** Found so many times it became a search
strategy. `rollupByClient` computed profitability per client. `/api/ots/cost-summary`
served it as `by_client`. **Zero components read it.** The question a profitability
module exists to answer was answered and stored. Machine competency requirements: the
entire skills spine was built and `machine_skill_requirements` held zero rows, so
`can_operate` always returned yes.

**Caching that bypasses its own invalidation.** `unstable_cache` keyed to a tag, with
`revalidateTag` on write — except a second write path did not go through the route that
revalidates. The cache was correct and the invalidation was unreachable.

**Verify causally, not plausibly.** Every diagnosis here that held up was confirmed by
making the symptom appear and disappear — rewriting SVG IDs in the live page, running
the resolver against the real rows, pushing a realistic job through the engine. Every
one that had to be retracted was a plausible story asserted without that step. Three
"bugs" reported in this repository turned out to be `grep`'s own escaping showing up in
the output.

---

## What is still wrong

Kept here rather than in a private list, because a log that only contains solved
problems is marketing.

- **The calibration gate has never been run.** The engine's own header asks for three
  historical jobs chosen by the plant supervisor, pushed through the wizard, with the
  constants tuned until estimates land within ±10%. The ink and die-cutting corrections
  above were argued from physics and from the machine's own record. That is better than
  what was there. It is not the same as agreeing with an invoice.
- **Purchase order lines have no UI.** The seed writes 261 of them; a buyer cannot write
  the 262nd. Until that exists, real material cost stops resolving the moment someone
  actually buys paper.
- **Eighteen of forty-eight libraries have no tests**, and they are the wrong eighteen:
  `auth`, `api-middleware`, `identity`, `whatsapp-ingest`. The domain is tested; the
  perimeter is not.
- **`LanguageContext` survives in seven components** of an application that has decided
  to speak Spanish — another instance of §5 that has not been closed yet.
