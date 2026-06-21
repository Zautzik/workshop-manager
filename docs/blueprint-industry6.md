# Build Blueprint — Industry 6.0 Workshop Organism

> The master plan consolidating the organism frame + the human-augmentation north
> star + the confirmed role pipeline into a sequenced build. Companion to
> `docs/organism-vital-signs.md` (diagnosis) and `docs/analitica-design.md`.

## North star
Integrate people into the process and **amplify their potential** — never automate
them away. The interface *is* the human's natural act; the loop *returns* value to
them. The **human is the heart**; the app is the circulatory + nervous system.

## The role pipeline = stages of one circulation
```
 OPERATOR ───▶ SUPERVISOR ───▶ (system digests) ───▶ HR ───▶ ACCOUNTING
 no login      validates raw      transforms to       reads      exhales clean,
 badge-in      captures before    costed "blood"      rhythm     tax-ready (Chile)
 (heart)       feeding (gate)     (Spleen/agni)       reports    to SII/Previred (Lung)
     ▲                                                                      │
     └──────────────  value returns to the worker (recognition)  ◀─────────┘
```

## Keystone — the Identity & Presence layer (build first)
One organ does three jobs; everything downstream depends on it.

- **Identity resolver (pluggable):** `resolve(signal) → employee`.
  - v1 adapter: **QR badge** scanned at a shared **station kiosk**.
  - future adapter: **face recognition** (company's existing system) — same interface.
  - context: station/workstation, shift.
- **`attendance_events`** (new table): `employee_id, station_id, type(clock_in|clock_out), method(qr|face|manual), at, metadata`. → the missing heartbeat (HRV).
- **Attribution:** the active badge-in tags every field capture that shift
  (`whatsapp_production_logs.operator_phone`/QR → `employees`), closing the
  labor→employee clot (root lesion in the diagnosis).
- **No password for operators**; badge-in only. Pure Industry 6.0 frictionless ID.

**This single layer fixes the clot, creates attendance, and enables attribution —
the precondition for HR + Accounting reporting.**

## Capture surfaces (intake — the natural act, not a form)
Built in the image of the existing `feed_whatsapp_to_real_costs` vessel:
- 📷 WhatsApp/station **photo of a QR** → inventory/SKU movement (no typing).
- 🎙️ **voice note** → OT transition (`ot_status_history`).
- 📸 **photo of finished work** → production log + quality evidence.
- 🪪 **badge-in/out** → attendance + capture attribution.
All land in a **pending** state → supervisor gate → fed to the organism.

## Supervisor gate (the validating membrane)
Already seeded: `whatsapp_production_logs.review_status` (pending→approved) →
`feed_whatsapp_to_real_costs` on approval. Make it the explicit trust boundary;
unknown/unregistered identities → quarantine, never auto-fed.

## HR reports (read the rhythmic system)
Refreshable, detailed: **salary payments, attendance (from `attendance_events`),
contract details**. Accurate only once the Identity layer closes the clot.

## Accounting — Chile, full statutory (the Lung's exhale)
Phased toward full compliance:
1. **Clean exportable reports** (CLP-correct salary/attendance/contract; CSV/PDF).
2. **Deductions engine:** AFP, salud (Fonasa/Isapre), impuesto único 2ª categoría,
   gratificación legal, seguro de cesantía, asignación familiar; topes en UF,
   IMM, brackets en UTM.
3. **LRE (Libro de Remuneraciones Electrónico) + Previred export.**
Needs UF/UTM/IMM indicators — user-supplied (no outbound network); store in a
`chile_indicators`-style config.

## Home redesign (the living body — the differentiator on screen 1)
- **Vital strip** incl. a **human-contribution pulse** ("capturas desde el campo
  hoy") — alive *because people fed it*.
- **Organ-pulse honeycomb** grouped by the threefold: **Ritmo** (Personas),
  **Movimiento** (Operaciones + Equipos), **Mente** (Analítica), **Sostén**
  (Sistema, ex-Administración). Each hex shows a live vital + flow-status dot.
- **Quicklinks** (the will) — already built.

## Build sequence (dependency-ordered)
1. **Identity & Presence layer** + `attendance_events` + station kiosk badge-in.
   *(Keystone: fixes clot, creates attendance, enables attribution.)*
2. **Vital-signs endpoint + Living Home** (incl. human-contribution pulse).
3. **HR reports** (salary/attendance/contracts) — now that circulation is clean.
4. **Capture surfaces** beyond WhatsApp (QR-photo → inventory, voice → transition).
5. **Chile payroll** phased (clean reports → deductions → LRE/Previred).
6. **Reflexes** (brain → body, incl. return-to-worker recognition).

## Open inputs needed from you
- UF/UTM/IMM (and AFP/Isapre rate tables) for the Chile engine.
- Face-recognition system API details (for the future identity adapter).
- The station device model (tablet at each station? one shared kiosk?).
