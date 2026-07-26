'use client';

/**
 * §6.6 — Calibration gate.
 *
 * The costing engine (v2) models the plant honestly, but every constant in
 * CALIBRATION is an assumption until a real job proves it. This screen is the
 * proving bench: the supervisor enters three historical jobs he already knows
 * the truth about — pliegos consumed, hours on press, hours in finishing — and
 * sees, side by side, what the engine would have predicted and by how much it
 * missed.
 *
 * Why a screen and not a spreadsheet: the feedback loop is the point. Change a
 * constant in CALIBRATION, reload, and see all three jobs move at once. A
 * spreadsheet gives you one answer; this gives you the shape of the error.
 *
 * Nothing here writes to the database. It is a measuring instrument.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { computeOTCalculations, CALIBRATION } from '@/lib/ot-calculations';
import type { OTFormData } from '@/types/ot';
import { Target, Plus, Trash2, TrendingUp, TrendingDown, Check } from 'lucide-react';

/** Tolerance the calibration gate is measured against. */
const TOLERANCE_PCT = 10;

interface HistoricalJob {
  id: string;
  label: string;
  /** What was ordered. */
  quantity: number;
  width_cm: number;
  height_cm: number;
  grammage_gsm: number;
  color_front: string;
  color_back: string;
  pressBodies: number;
  troquelado: boolean;
  /** What actually happened — from the job jacket, not the system. */
  realSheets: number;
  realPrintHours: number;
  realFinishHours: number;
}

const blankJob = (n: number): HistoricalJob => ({
  id: `job-${Date.now()}-${n}`,
  label: '',
  quantity: 10000,
  width_cm: 10,
  height_cm: 15,
  grammage_gsm: 250,
  color_front: 'cmyk',
  color_back: 'sin_impresion',
  pressBodies: 4,
  troquelado: false,
  realSheets: 0,
  realPrintHours: 0,
  realFinishHours: 0,
});

/** Three jobs, seeded with the shapes the plan asks for (etiqueta, caja, volante). */
const seedJobs = (): HistoricalJob[] => [
  { ...blankJob(1), label: 'Etiqueta', quantity: 150000, width_cm: 9, height_cm: 12, grammage_gsm: 90, color_front: 'cmyk', color_back: 'sin_impresion' },
  { ...blankJob(2), label: 'Caja', quantity: 20000, width_cm: 22, height_cm: 30, grammage_gsm: 300, color_front: 'cmyk', color_back: 'sin_impresion', troquelado: true },
  { ...blankJob(3), label: 'Volante', quantity: 50000, width_cm: 21, height_cm: 29.7, grammage_gsm: 130, color_front: 'cmyk', color_back: 'cmyk' },
];

const COLOR_OPTIONS = [
  { value: 'cmyk', label: '4 colores (CMYK)' },
  { value: 'cmyk_pantone', label: 'CMYK + Pantone' },
  { value: '1_color', label: '1 color' },
  { value: '2_color', label: '2 colores' },
  { value: '3_color', label: '3 colores' },
  { value: 'sin_impresion', label: 'Sin impresión' },
];

function toFormData(job: HistoricalJob): OTFormData {
  return {
    quantity: job.quantity,
    width_cm: job.width_cm,
    height_cm: job.height_cm,
    grammage_gsm: job.grammage_gsm,
    color_front: job.color_front as OTFormData['color_front'],
    color_back: job.color_back as OTFormData['color_back'],
    substrate_type: 'couche' as OTFormData['substrate_type'],
    finishes: {
      finish_troquelado: job.troquelado,
    } as OTFormData['finishes'],
  } as OTFormData;
}

const deviation = (estimated: number, real: number): number | null => {
  if (!real || real <= 0) return null;
  return ((estimated - real) / real) * 100;
};

function DeviationBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const within = Math.abs(pct) <= TOLERANCE_PCT;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Check;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
        within
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      }`}
      title={within ? `Dentro de ±${TOLERANCE_PCT}%` : `Fuera de ±${TOLERANCE_PCT}%`}
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function NumField({
  label, value, onChange, step = '1', hint,
}: { label: string; value: number; onChange: (n: number) => void; step?: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 text-sm"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CalibracionMotor() {
  const [jobs, setJobs] = useState<HistoricalJob[]>(seedJobs);

  const update = (id: string, patch: Partial<HistoricalJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const rows = useMemo(
    () =>
      jobs.map((job) => {
        const calc = computeOTCalculations(toFormData(job), { pressBodies: job.pressBodies });
        return {
          job,
          calc,
          devSheets: deviation(calc.calc_sheets, job.realSheets),
          devPrint: deviation(calc.calc_print_hours, job.realPrintHours),
          devFinish: deviation(calc.calc_finish_hours, job.realFinishHours),
        };
      }),
    [jobs]
  );

  const measured = rows.flatMap((r) => [r.devSheets, r.devPrint, r.devFinish]).filter((d): d is number => d !== null);
  const withinTolerance = measured.filter((d) => Math.abs(d) <= TOLERANCE_PCT).length;
  const gatePassed = measured.length > 0 && withinTolerance === measured.length;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Target className="h-5 w-5" />
            Calibración del motor de costeo (§6.6)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Carga tres trabajos históricos de los que ya sabes la verdad — pliegos que se
            consumieron, horas de prensa, horas de terminación — y compara contra lo que el motor
            habría estimado. Ajusta <span className="font-mono text-xs">CALIBRATION</span> en{' '}
            <span className="font-mono text-xs">src/lib/ot-calculations.ts</span> hasta que todo
            quede dentro de ±{TOLERANCE_PCT}%. Nada de esto se guarda: es un instrumento de medición.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div
              className={`rounded-md border px-3 py-2 ${
                gatePassed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border'
              }`}
            >
              <div className="text-lg font-bold tabular-nums text-foreground">
                {withinTolerance}/{measured.length || 0}
              </div>
              <div className="text-xs text-muted-foreground">medidas dentro de ±{TOLERANCE_PCT}%</div>
            </div>
            {measured.length === 0 ? (
              <Badge variant="outline" className="border-border text-muted-foreground">
                Ingresa los valores reales para medir
              </Badge>
            ) : gatePassed ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                Compuerta §6.6 superada — los presupuestos dejan de ser borradores
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                Fuera de tolerancia — ajusta CALIBRATION y recarga
              </Badge>
            )}
            <div className="text-xs text-muted-foreground">
              Formatos: {CALIBRATION.SHEET_FORMATS.map((f) => f.label).join(' · ')} · pinza{' '}
              {CALIBRATION.GRIPPER_CM} cm · merma base {(CALIBRATION.BASE_WASTE_PCT * 100).toFixed(0)}% ·
              alistamiento {CALIBRATION.MAKEREADY_SHEETS_PER_PASS} pliegos/pasada
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.map(({ job, calc, devSheets, devPrint, devFinish }) => (
        <Card key={job.id} className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Input
                value={job.label}
                onChange={(e) => update(job.id, { label: e.target.value })}
                placeholder="Nombre del trabajo (ej: Etiqueta Cabernet 750ml)"
                className="h-8 max-w-sm text-sm font-medium"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                title="Quitar este trabajo"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* What was ordered */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lo que se pidió
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <NumField label="Cantidad" value={job.quantity} onChange={(n) => update(job.id, { quantity: n })} />
                <NumField label="Ancho (cm)" value={job.width_cm} step="0.1" onChange={(n) => update(job.id, { width_cm: n })} />
                <NumField label="Alto (cm)" value={job.height_cm} step="0.1" onChange={(n) => update(job.id, { height_cm: n })} />
                <NumField label="Gramaje" value={job.grammage_gsm} onChange={(n) => update(job.id, { grammage_gsm: n })} />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tiro</Label>
                  <Select value={job.color_front} onValueChange={(v) => update(job.id, { color_front: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Retiro</Label>
                  <Select value={job.color_back} onValueChange={(v) => update(job.id, { color_back: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <NumField label="Cuerpos prensa" value={job.pressBodies} onChange={(n) => update(job.id, { pressBodies: n })} />
              </div>
              <label className="mt-2 flex w-fit items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={job.troquelado}
                  onChange={(e) => update(job.id, { troquelado: e.target.checked })}
                />
                Troquelado
              </label>
            </div>

            {/* Reality vs engine */}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Medida</th>
                    <th className="px-3 py-2 font-semibold text-right">Real (job jacket)</th>
                    <th className="px-3 py-2 font-semibold text-right">Motor v2</th>
                    <th className="px-3 py-2 font-semibold text-right">Desvío</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-foreground">Pliegos</td>
                    <td className="px-3 py-2 text-right">
                      <Input type="number" value={job.realSheets} onChange={(e) => update(job.id, { realSheets: Number(e.target.value) })} className="ml-auto h-8 w-32 text-right text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                      {calc.calc_sheets.toLocaleString('es-CL')}
                    </td>
                    <td className="px-3 py-2 text-right"><DeviationBadge pct={devSheets} /></td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-foreground">Horas de prensa</td>
                    <td className="px-3 py-2 text-right">
                      <Input type="number" step="0.1" value={job.realPrintHours} onChange={(e) => update(job.id, { realPrintHours: Number(e.target.value) })} className="ml-auto h-8 w-32 text-right text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                      {calc.calc_print_hours.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right"><DeviationBadge pct={devPrint} /></td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-foreground">Horas de terminación</td>
                    <td className="px-3 py-2 text-right">
                      <Input type="number" step="0.1" value={job.realFinishHours} onChange={(e) => update(job.id, { realFinishHours: Number(e.target.value) })} className="ml-auto h-8 w-32 text-right text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                      {calc.calc_finish_hours.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right"><DeviationBadge pct={devFinish} /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-xs text-muted-foreground">
              También estimado: {calc.calc_substrate_kg.toFixed(1)} kg de sustrato ·{' '}
              {calc.calc_ink_kg.toFixed(2)} kg de tinta · {calc.calc_plates} planchas
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outline"
        onClick={() => setJobs((prev) => [...prev, blankJob(prev.length + 1)])}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Agregar otro trabajo
      </Button>
    </div>
  );
}

export default CalibracionMotor;
