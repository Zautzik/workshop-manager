'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import type { CotizacionFormState } from './CotizacionSpecSection';

export function CotizacionPricingSection({
  form,
  setForm,
  calc,
  grupos,
  banda,
  saving,
  onSave,
  onCompletarTodo,
  num,
}: {
  form: CotizacionFormState;
  setForm: (value: CotizacionFormState) => void;
  calc: {
    lines: { description: string; quantity: number; unit_cost: number }[];
    subtotal: number;
    total: number;
    floor: number;
    unit: number;
    marginPct: number;
    belowFloor: boolean;
    calcs: { calc_sheets: number; calc_substrate_kg: number; calc_plates: number; calc_print_hours: number };
    impo: { format_label?: string | null; cut_from?: string | null; poses_per_sheet: number };
    sanityWarning: string | null;
  };
  grupos: { key: string; label: string; monto: number; pct: number; color: string }[];
  banda: {
    firm: boolean;
    note?: string | null;
    low: number;
    high: number;
    drivers: { field: string; up: number; why: string }[];
  };
  saving: boolean;
  onSave: () => void;
  onCompletarTodo: () => void;
  num: (v: string) => number;
}) {
  return (
    <div className="space-y-2.5 md:sticky md:top-0 md:self-start">
      {/* No bloquea "Crear OT": avisa. Un tiraje gigante pero real
          puede existir; lo que no puede pasar en silencio es uno
          que nadie miró dos veces. */}
      {calc.sanityWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{calc.sanityWarning}</span>
        </div>
      )}
      {/* ── El papel, en dos renglones ─────────────────────────
          Eran seis filas de etiqueta y valor. El vendedor no lee una
          tabla mientras habla por teléfono: mira si el número le
          cuadra. Los mismos datos, en la forma en que se leen. */}
      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <p className="text-sm">
          <span className="text-lg font-bold tabular-nums text-primary">
            {calc.calcs.calc_sheets.toLocaleString('es-CL')}
          </span>{' '}
          <span className="text-muted-foreground">pliegos de</span>{' '}
          <span className="font-semibold text-foreground">{calc.impo.format_label ?? '—'}</span>
          {calc.impo.cut_from && (
            <span className="text-muted-foreground"> (cortados de {calc.impo.cut_from})</span>
          )}
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {calc.impo.poses_per_sheet} poses · {calc.calcs.calc_substrate_kg.toFixed(1)} kg ·{' '}
          {calc.calcs.calc_plates} planchas · {calc.calcs.calc_print_hours.toFixed(1)} h de prensa
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Con merma y alistamiento, del mismo motor que usa producción.
        </p>
      </div>

      {/* ── El costo, como forma antes que como lista ─────────────
          Diez renglones de cifras obligan a sumarlos con la vista para
          saber lo único que importa a esta altura: en qué se va la
          plata. Una barra de parte-sobre-el-todo lo dice de un vistazo
          y ocupa un octavo del alto. El detalle sigue estando, un clic
          más abajo, para cuando el cliente pregunta. */}
      <div className="rounded-md border border-border p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Costo</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatCLP(calc.subtotal)}</span>
        </div>

        <div className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
          {grupos.map((g) => (
            <div
              key={g.key}
              title={`${g.label}: ${formatCLP(g.monto)} (${g.pct}%)`}
              style={{ width: `${g.pct}%`, background: g.color }}
              className="h-full transition-all first:rounded-l-full last:rounded-r-full"
            />
          ))}
        </div>

        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {grupos.map((g) => (
            <li key={g.key} className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
              <span className="text-muted-foreground">{g.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{g.pct}%</span>
            </li>
          ))}
        </ul>

        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            Ver las {calc.lines.length} líneas
          </summary>
          <div className="mt-1.5 space-y-0.5">
            {calc.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{l.description}</span>
                <span className="tabular-nums">{formatCLP(l.quantity * l.unit_cost)}</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* ── El precio, el markup y la banda, juntos ───────────────
          Es el bloque con el que se negocia: mover el markup, ver el
          precio, mirar el piso. Separados obligaban a recorrer con la
          vista para completar un solo pensamiento. */}
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs uppercase text-muted-foreground">Precio</span>
          <span className="text-2xl font-bold tabular-nums text-primary">{formatCLP(calc.total)}</span>
        </div>

        <input
          type="range" min={5} max={120} value={form.markup}
          aria-label={`Markup ${form.markup}%`}
          onChange={(e) => setForm({ ...form, markup: num(e.target.value) })}
          className="mt-2 w-full accent-primary"
        />
        <div className="flex flex-wrap justify-between gap-x-3 text-[11px] tabular-nums text-muted-foreground">
          <span>markup {form.markup}%</span>
          <span>{formatCLP(calc.unit)} c/u</span>
          <span>margen {calc.marginPct}%</span>
          <span className={calc.belowFloor ? 'font-semibold text-red-500' : ''}>
            piso {formatCLP(calc.floor)}
          </span>
        </div>

        {calc.belowFloor && (
          <p className="mt-1.5 text-xs font-medium text-red-500">
            Bajo el piso de costo — subí el markup.
          </p>
        )}

        {!banda.firm && banda.note && (
          <details className="mt-2 border-t border-primary/20 pt-2">
            <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-400">
              Es una estimación: {formatCLP(banda.low)} – {formatCLP(banda.high)}
            </summary>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{banda.note}</p>
            <ul className="mt-1.5 space-y-1">
              {banda.drivers.map((d) => (
                <li key={d.field} className="flex items-baseline gap-2 text-[11px] leading-snug text-muted-foreground">
                  <span className="shrink-0 font-mono tabular-nums text-amber-700 dark:text-amber-400">
                    +{Math.round(d.up * 100)}%
                  </span>
                  <span>{d.why}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {banda.firm && (
          <p className="mt-2 border-t border-primary/20 pt-2 text-xs text-emerald-700 dark:text-emerald-400">
            Precio firme: no falta ningún dato que pueda moverlo.
          </p>
        )}
      </div>

      <Button className="w-full" onClick={onSave} disabled={saving || calc.belowFloor}>{saving ? 'Creando la OT…' : 'Crear OT'}</Button>

      {/* La salida para cuando la cotización no alcanza.
          A veces el cliente ya decidió y lo que hace falta no es un
          precio sino la orden entera: montaje, máquina, detalle de
          producción. Sin esta puerta había que cerrar, abrir el
          asistente y volver a escribir los quince campos recién
          llenados — y el que teclea dos veces, la segunda pone otra
          cosa. */}
      <Button
        variant="outline"
        className="w-full"
        onClick={onCompletarTodo}
        disabled={!form.client_id}
        title={!form.client_id ? 'Elegí un cliente primero' : undefined}
      >
        <ArrowRight className="mr-1.5 h-4 w-4" />
        Completar todos los datos
      </Button>
      <p className="-mt-1 text-[11px] leading-snug text-muted-foreground">
        Abre el asistente con lo que ya escribiste y pide lo que falta para
        tener la OT: montaje, máquina, detalle de producción y arte.
      </p>
    </div>
  );
}
