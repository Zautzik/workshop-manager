# docs/ — what's actually current

26 files accumulated here between June and September 2026, including two
disconnected "master plan" lineages that never reference each other. This is
the index that was missing: what to read first, and what's historical record
rather than a live backlog.

Seven other files (`EFFECTIVE_DATE_*`, `SKILL_TREE_*`, `HR_*`,
`SAFE_DEPRECATION_GUIDE.md`) were removed on 2026-09-15 — unrelated HR/SaaS
boilerplate with no connection to this print shop, confirmed template residue.

## Read these first — build-ready specs

| Doc | Status |
|---|---|
| [`spec-oc-y-facturas.md`](spec-oc-y-facturas.md) | Mostly shipped. §6 steps 1–3 (OC screen, receiving+cert, invoicing+match) live since Aug 16; step 3 of §3 (supplier gating at issuance) closed Sep 15. §7's business questions to the shop (reception tolerance, issuance limits, open orders) are still genuinely open — see the doc's own status line. |
| [`spec-cost-ledger-and-vb.md`](spec-cost-ledger-and-vb.md) | The unified `ot_cost_lines` ledger (estimate/committed/actual) — shipped, this is its as-built spec. |
| [`spec-cotizacion-a-ot.md`](spec-cotizacion-a-ot.md) | Quote → work order flow. |
| [`spec-pre-prensa-y-visto-bueno.md`](spec-pre-prensa-y-visto-bueno.md) | Pre-press + sign-off (Visto Bueno) stage. |

## Historical — audit / go-live lineage (June–July 2026)

Chronological, each superseding the audit findings of the last. Read
`master-plan-2026-07-25.md` for where this lineage landed; the earlier docs
are the record of how it got there, not a current backlog.

`audit-2026-06.md` → `mvp-punchlist.md` → `status-and-plan-2026-06-29.md` →
`demo-readiness-plan-2026-07-05.md` → `go-live-checklist-2026-07-10.md` →
`handoff-2026-07-11.md` → **`master-plan-2026-07-25.md`**

None of this lineage knows about the purchasing, cost-ledger, or estimator
work from August–September — it predates all of it.

## Historical — "Industry 6.0 Organism" vision lineage

A separate framing of the same plant, four docs that cross-reference each
other as companions: `organism-vital-signs.md` (diagnosis) →
`blueprint-industry6.md` (vision) → `analitica-design.md` (BI/dashboard
design) → **`master-implementation-plan.md`** (execution plan synthesizing
the other three).

## One-off

`demo-script-2026-07.md`, `PR-description.md`, `nubox-facturacion-questions.md`
(Nubox e-invoicing intake questionnaire), `ux-ia-audit-plan.md` (a third,
standalone audit not part of either lineage above).

## The current three-lane picture

For how the purchase-order match and the job-cost ledger actually relate today,
see the diagram in the main [README](../README.md#the-problem-it-solves) —
kept there because it's read more often than anything in this folder.
