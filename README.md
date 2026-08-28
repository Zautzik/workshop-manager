# GonsAdmin

Production management for an offset printing press — quoting, scheduling, shop-floor
capture, and real cost per job.

Not a generic ERP with a printing skin. The domain is in the code: imposition across
sheet formats, make-ready versus run time, waste judged against run length, paper
bought by the kilo and consumed by the sheet, and margin per press-hour — because in a
print shop the press is the bottleneck and the job worth running is not the one with
the biggest margin.

**Stack** · Next.js 16 (App Router) · TypeScript · PostgreSQL/Supabase · React Query ·
Tailwind + Radix · Zod · Recharts · Vitest

```
158 migrations   153 API routes   72 domain libraries   912 tests
```

---

## The problem it solves

A print shop knows what it billed. It rarely knows what a job **cost**, because the
cost is scattered: paper on a supplier invoice, hours in someone's head, waste in a
bin, machine time nowhere at all. The gap between the quote and the truth is where the
margin goes.

The application is built around one chain — internally called the *golden thread* —
and every feature either extends it or reads from it:

```
client → quote → work order → purchase order → paper lot
       → machine schedule → labour shift (tied to the order)
       → shop-floor report → stock consumption → real cost → dispatch → invoice
```

Each link only exists because the previous one does. That constraint is what makes the
cost reconstructible: you can open any order and walk back to the WhatsApp message the
operator typed and the supplier invoice the paper came on.

---

## What's actually inside

The interesting code is not the CRUD. It's in `src/lib/`, where every piece of business
logic lives as a pure, tested module — never inside a component.

| Module | What it decides |
|---|---|
| [`ot-calculations.ts`](src/lib/ot-calculations.ts) | Imposition across sheet formats with gripper and bleed; pass-through-press timing (a 4/0 job on a four-colour press is **one** pass, not four); per-finish time models; process-aware waste |
| [`paper-units.ts`](src/lib/paper-units.ts) | Everything converges on the sheet. Paper is bought by the kilo or by the ream and consumed as sheets; sheet weight is area × gsm ÷ 1000 |
| [`costing-resolver.ts`](src/lib/costing-resolver.ts) | Which price the engine believes — purchase-weighted actual, or catalogue — and when to distrust the "real" one |
| [`material-price-sanity.ts`](src/lib/material-price-sanity.ts) | Sanity bands per unit. A substrate priced per kilo never costs cents |
| [`print-economics.ts`](src/lib/print-economics.ts) | Cost per thousand; make-ready versus run split; **margin per press-hour**, and the ranking that follows from it |
| [`merma.ts`](src/lib/merma.ts) | Waste as a share of paper **entered**, judged against run length — 8% on 500 sheets is normal, 8% on 100,000 is a broken machine |
| [`margin-confidence.ts`](src/lib/margin-confidence.ts) | Zero cost is not 100% margin. It is an unfinished account, and the screen says so |
| [`whatsapp-parser.ts`](src/lib/whatsapp-parser.ts) | Free-form Spanish from the shop floor into structured production data |
| [`assignment-rules.ts`](src/lib/assignment-rules.ts) | A shift on a production machine must name the order it served |
| [`machine-competency.ts`](src/lib/machine-competency.ts) | Whether a given person may run a given machine, from a skill tree |

### One decision worth reading

`marginPerPressHour` is the smallest function with the largest consequence:

```
$400,000 margin over 8 press-hours  =  $50,000/hour
$200,000 margin over 2 press-hours  = $100,000/hour   ← run this one
```

Scheduling by absolute margin fills the press with big slow jobs and crowds out the
ones that pay better for the scarce resource. A test pins exactly that case: the
highest-margin job sorts **last**.

---

## Architecture notes

**Business logic never lives in a component.** If a number appears on screen, a pure
function in `src/lib` produced it and a test fixes its behaviour. Components fetch,
arrange, and render.

**Nothing is computed twice.** The demo seed calls the same engine the quoting wizard
calls; the shop-floor messages it generates are parsed by the real parser. Two
implementations of one calculation always drift, and the drift is always discovered by
a user.

**Empty states explain themselves.** Every analytics endpoint returns a `diagnostics`
block saying *why* there is nothing to show — "2 of 2 orders have no real cost loaded"
— instead of an empty array that the screen renders as a shrug.

**Refusal over invention.** When the data cannot support a claim, the function returns
`null` and the UI says what is missing. A cost per thousand with no sheet count is not
zero; a margin with no cost is not 100%.

**A failed query is not an empty table.** PostgREST resolves with `{data: null, error}`
rather than rejecting, so an unread `error` renders a broken screen as a calm empty
state. Screens distinguish the two, and anything gating a physical action — may this
person run this press? — **fails closed**: *unknown* is never treated as *permitted*.
An ESLint rule flags the pattern; see [NOTES.md](NOTES.md) §12.

**Row-level security for rows, GRANTs for columns.** RLS filters rows and cannot hide a
column — personal contact details are protected with column-level grants, not a policy
that looks like it works.

---

## Running it

```bash
npm install
cp .env.example .env.local        # Supabase URL + keys
npx supabase db push              # 158 migrations
npm run dev
```

First admin account (no password in source control):

```bash
SEED_ADMIN_PASSWORD="<strong-password>" npx tsx scripts/seed-admin.ts
```

### Demo data

```bash
npm run seed:demo                 # rehearsal — prints the plan, writes nothing
npm run seed:demo -- --write      # applies it
```

Builds a complete shop: four months, ~260 orders, ~$300M CLP/month of gross margin,
1,700 labour shifts, 450 parsed shop-floor reports, purchase orders traceable to
certified paper lots. It computes every figure with the application's own engine, then
reads `ot_cost_summary` back out of the database to verify the result against the
target. See [`scripts/seed/model.ts`](scripts/seed/model.ts).

### Checks

```bash
npm run typecheck        # tsc --noEmit
npm test                 # 912 tests, 53 files
npm run lint
npm run verify:csp       # asserts no CDN escapes the Content-Security-Policy
npm run check:migrations # lists every function more than one migration defines
npm run check:functions  # lists every function naming a column that no longer exists
```

`check:functions` asks the database, not the source. `DROP COLUMN` does not validate
plpgsql bodies — Postgres resolves a function's references when it *runs* — so a dropped
column leaves functions that pass every deploy, type check and test, and fail the first
time a person uses one. It happened four times before it became a script; see
[NOTES.md](NOTES.md) §13.

---

## Repository map

```
src/
  app/              routes + 151 API handlers
  components/       UI, grouped by module
  lib/              ← the domain. pure, tested, no React
  lib/__tests__/    one test file per module
  integrations/     Supabase clients (browser anon vs. service role)
supabase/
  migrations/       158, ordered, each explaining its own reasoning
scripts/
  seed/             the demo shop: a pure model + a writer
docs/               design records and audits
NOTES.md            ← engineering log: the bugs worth reading about
MASTERCLASS.md      ← the domain science, techniques and tools, distilled
```

---

## A note on language

Interface copy and newer code comments are in **Spanish**, deliberately. The users are
Chilean printers and the domain vocabulary is theirs — *pliego*, *merma*, *arreglo*,
*tiraje*, *visto bueno*. Translating those into English would have meant maintaining a
glossary between the code and the people it describes, and inviting the kind of drift
where `workstation` and `machine` end up as two tables for one thing. (They did, once.
See [NOTES.md](NOTES.md).)

---

## [MASTERCLASS.md](MASTERCLASS.md)

The durable layer between the two: what a print shop taught about sheets, press passes,
make-ready and spoilage bands; the engineering techniques that came out of getting them
wrong — gates that name what is missing, blocking on impossible data but never on absent
data, deriving instead of storing a second truth, asking the catalog instead of the grep;
and what each tool in the stack actually taught. Ends with a failure taxonomy and
eighteen working rules.

---

## [NOTES.md](NOTES.md)

The engineering log — what broke, how it was found, and what the fix taught. Written to
be read: a costing engine that preferred a corrupt price book by explicit rule, a logo
invisible on desktop for reasons that had nothing to do with the logo, a regex that
silently searched for the letter `d`, and two months of green CI over a production
build that had been failing the whole time.

---

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE). This is not open source
software; no permission is granted to use, copy, modify, or distribute it without
written authorization from the copyright holder.
