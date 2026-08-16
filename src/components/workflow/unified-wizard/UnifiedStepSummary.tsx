'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  User,
  Ruler,
  Factory,
  Puzzle,
  Cog,
  DollarSign,
  CalendarDays,
  Layers,
  AlertTriangle,
} from 'lucide-react';

const IVA_RATE = 0.19;
import { cn } from '@/lib/utils';
import { WORK_CATEGORIES } from '@/types/work-category';
import { PRODUCT_TYPES, SUBSTRATE_TYPES, COLOR_MODES, PRIORITY_LEVELS, FINISH_OPTIONS } from '@/types/ot';
import { MACHINE_TYPES, PAYMENT_CATEGORIES } from '@/types/ot-production';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

function SummarySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 border-border space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === '' || value === 0) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right font-medium">{value}</span>
    </div>
  );
}

export function UnifiedStepSummary({ form }: Props) {
  const cat = WORK_CATEGORIES.find((c) => c.key === form.work_category);
  const productType = PRODUCT_TYPES.find((pt) => pt.value === form.product_type);
  const substrate = SUBSTRATE_TYPES.find((st) => st.value === form.substrate_type);
  const colorF = COLOR_MODES.find((c) => c.value === form.color_front);
  const colorB = COLOR_MODES.find((c) => c.value === form.color_back);
  const priority = PRIORITY_LEVELS.find((p) => p.value === form.priority_level);
  const machine = MACHINE_TYPES.find((m) => m.value === form.machine.machine_type);
  const payment = PAYMENT_CATEGORIES.find((p) => p.value === form.admin.categoria_pago);

  const activeFinishes = FINISH_OPTIONS.filter((f) => form.finishes[f.key]);

  // Completeness checklist: non-blocking warnings for fields that are legal to
  // omit but usually shouldn't be (an OT with no deadline/substrate/machine is
  // a half-order). The header/operations price mismatch is a data-integrity
  // check — the two must agree or the cost engine lies later (2026-07 audit).
  const opsSubtotal = form.operations.reduce((s, op) => s + (op.total_cost ?? 0), 0);
  const priceMismatch = form.pricing.subtotal > 0
    && Math.abs(opsSubtotal - form.pricing.subtotal) > Math.max(1, form.pricing.subtotal * 0.01);
  const warnings: string[] = [];
  if (!form.deadline) warnings.push('Sin fecha de entrega');
  if (!form.substrate_type) warnings.push('Sin sustrato definido');
  if (!form.machine.machine_id) warnings.push('Sin máquina asignada');
  if (form.operations.length === 0) warnings.push('Sin operaciones (la cotización quedará en $0)');
  if (priceMismatch) warnings.push('El subtotal no coincide con la suma de operaciones');

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          Resumen de la OT
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revise los datos antes de crear la orden. Entrará en estado
          <Badge variant="outline" className="ml-1 text-amber-500 border-amber-500/40">
            Visto Bueno
          </Badge>{' '}
          (pendiente de aprobación).
        </p>
      </div>

      {warnings.length > 0 && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm mb-2">
            <AlertTriangle className="h-4 w-4" />
            Puede crear la OT igual, pero revise:
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {warnings.map((w) => (
              <li key={w} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Category */}
      {cat && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">{cat.icon}</span>
          <Badge className="text-sm" style={{ backgroundColor: cat.color, color: 'white' }}>
            {cat.label}
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Information */}
        <SummarySection
          icon={<User className="h-4 w-4 text-primary" />}
          title="Información"
        >
          <Row label="Cliente" value={form.client_name} />
          <Row label="Trabajo" value={form.trabajo} />
          <Row label="Producto" value={form.product_name} />
          <Row label="Cantidad" value={form.quantity.toLocaleString()} />
          <Row
            label="Fecha Entrega"
            value={
              form.deadline
                ? new Date(form.deadline).toLocaleDateString('es-CL')
                : null
            }
          />
          <Row label="Prioridad" value={
            priority ? (
              <span className={priority.color}>{priority.label}</span>
            ) : null
          } />
          <Row label="OT Anterior" value={form.ot_anterior} />
        </SummarySection>

        {/* Specifications */}
        <SummarySection
          icon={<Ruler className="h-4 w-4 text-primary" />}
          title="Especificaciones"
        >
          <Row label="Tipo" value={productType?.label} />
          <Row
            label="Dimensiones"
            value={
              form.width_cm > 0 && form.height_cm > 0
                ? `${form.width_cm} × ${form.height_cm} cm`
                : null
            }
          />
          <Row label="Sustrato" value={substrate?.label} />
          <Row label="Gramaje" value={form.grammage_gsm ? `${form.grammage_gsm} g/m²` : null} />
          <Row label="Colores" value={
            colorF && colorB
              ? `${colorF.label} / ${colorB.label}`
              : null
          } />
          {form.pantone_colors.length > 0 && (
            <Row
              label="Pantone"
              value={
                <div className="flex flex-wrap gap-1 justify-end">
                  {form.pantone_colors.map((c) => (
                    <Badge key={c} variant="secondary" className="text-[10px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              }
            />
          )}
          {activeFinishes.length > 0 && (
            <Row
              label="Terminaciones"
              value={
                <div className="flex flex-wrap gap-1 justify-end">
                  {activeFinishes.map((f) => (
                    <Badge key={f.key} variant="secondary" className="text-[10px]">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              }
            />
          )}
        </SummarySection>

        {/* Production */}
        <SummarySection
          icon={<Factory className="h-4 w-4 text-primary" />}
          title="Producción"
        >
          <Row label="Descripción" value={form.production_detail.production_description} />
          <Row label="Formato" value={form.production_detail.formato} />
          <Row label="Acabado" value={form.production_detail.acabado} />
          <Row label="Tapas" value={form.tapas.length > 0 ? `${form.tapas.length} variantes` : null} />
          <Row label="Ítems" value={form.items.length > 0 ? `${form.items.length} ítems` : null} />
          <Row label="Pliegos" value={form.pliegos.length > 0 ? `${form.pliegos.length} pliegos` : null} />
        </SummarySection>

        {/* Montaje */}
        <SummarySection
          icon={<Puzzle className="h-4 w-4 text-primary" />}
          title="Montaje"
        >
          <Row label="Grilla" value={form.montaje.montaje_grid} />
          <Row label="Poses" value={form.montaje_shapes.length > 0 ? form.montaje_shapes.length : form.montaje.montaje_paginas} />
          <Row label="Pliego" value={`${form.press_sheet_width} × ${form.press_sheet_height} mm`} />
          <Row label="Pinza" value={`${form.montaje.pinza_cm} cm`} />
          <Row label="Corte Hoja" value={form.montaje.corte_hoja} />
          {form.montaje_shapes.some((s) => s.shapeType === 'die_cut' || s.shapeType === 'custom') && (
            <Row
              label="Troqueles"
              value={
                <Badge variant="outline" className="text-[10px] border-pink-500/40 text-pink-500">
                  ✂ {form.montaje_shapes.filter((s) => s.shapeType === 'die_cut' || s.shapeType === 'custom').length} troqueles especiales
                </Badge>
              }
            />
          )}
        </SummarySection>

        {/* Machine */}
        <SummarySection
          icon={<Cog className="h-4 w-4 text-primary" />}
          title="Máquina"
        >
          <Row label="Máquina" value={machine?.label} />
          <Row label="Config. Color" value={form.machine.color_config} />
          <Row label="Tiraje" value={form.machine.tiraje > 0 ? form.machine.tiraje.toLocaleString() : null} />
          <Row label="CTP" value={form.machine.ctp_needed ? `Sí (${form.machine.ctp_count ?? '?'} placas)` : 'No'} />
          <Row label="V°B° PDF" value={form.machine.vb_pdf ? '✅ Aprobado' : '❌ Pendiente'} />
        </SummarySection>

        {/* Admin */}
        <SummarySection
          icon={<CalendarDays className="h-4 w-4 text-primary" />}
          title="Administración"
        >
          <Row label="Solicitante" value={form.admin.solicitante} />
          <Row label="Vendedor" value={form.admin.vendedor} />
          <Row label="Pago" value={payment?.label} />
          <Row label="RUT" value={form.admin.rut} />
          <Row label="Presupuesto" value={form.admin.presupuesto_numero} />
          <Row label="OC" value={form.admin.orden_compra} />
        </SummarySection>
      </div>

      {/* ── Pricing Summary ────────────────────────────────────── */}
      <Card className="p-5 border-2 border-primary/30 bg-primary/5 space-y-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Cotización
        </h3>

        <div className="space-y-2">
          <Row label="Operaciones" value={`${form.operations.length} ítems`} />
          <Row label="Subtotal" value={`$${form.pricing.subtotal.toLocaleString()}`} />
          <Row
            label={`Margen (${form.pricing.margin_pct}%)`}
            value={`+$${form.pricing.margin_amount.toLocaleString()}`}
          />
          <Row
            label={`Incremento (${form.pricing.increment_pct}%)`}
            value={`+$${form.pricing.increment_amount.toLocaleString()}`}
          />
          <Row
            label={`Comisión (${form.pricing.commission_pct}%)`}
            value={`+$${form.pricing.commission_amount.toLocaleString()}`}
          />
        </div>

        <Separator />

        {/* Neto → IVA → Total: total_price is the NET quote; show the 19% IVA
            line so nobody confuses net with gross when talking to the client. */}
        <Row label="Neto" value={`$${Math.round(form.pricing.total_price).toLocaleString('es-CL')}`} />
        <Row label="IVA (19%)" value={`+$${Math.round(form.pricing.total_price * IVA_RATE).toLocaleString('es-CL')}`} />

        <div className="flex items-center justify-between pt-1">
          <span className="text-xl font-bold">Total con IVA</span>
          <span className="text-3xl font-bold text-primary">
            ${Math.round(form.pricing.total_price * (1 + IVA_RATE)).toLocaleString('es-CL')}
          </span>
        </div>

        <div className="text-right text-sm text-muted-foreground">
          Precio unitario neto: $
          {form.pricing.unit_price.toLocaleString('es-CL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          })}{' '}
          × {form.quantity.toLocaleString('es-CL')} = ${Math.round(form.pricing.total_price).toLocaleString('es-CL')} neto
        </div>
      </Card>

      {/* Status note */}
      <div className="text-center text-sm text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
        ⚠️ Al crear la OT, entrará en estado <strong>&quot;Visto Bueno&quot;</strong> (pendiente de aprobación).
        Una vez aprobada, avanzará a &quot;Compras&quot; en el flujo de trabajo.
      </div>
    </div>
  );
}
