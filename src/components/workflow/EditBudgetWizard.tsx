'use client';

/**
 * EditBudgetWizard — Modify an existing OT's budget before client confirmation.
 *
 * Reuses the same step components from the unified wizard but:
 *  - Loads from DB (OT row) + localStorage (production extras)
 *  - Skips the category step (already set)
 *  - Submits via PATCH instead of POST
 *  - Shows a "changes saved" diff summary
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCLP } from '@/lib/format';
import {
  ArrowLeft,
  ArrowRight,
  X,
  Save,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EMPTY_UNIFIED_FORM, type UnifiedOTForm } from '@/types/ot-unified';
import type { WorkCategoryKey } from '@/types/work-category';
import {
  computeOTCalculations,
  computeImposition,
  generateDefaultOperations,
  computeOTPricing,
} from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import type { OTFormData } from '@/types/ot';

/* ── Step Components (reuse from unified wizard) ──────────────── */
import { UnifiedStepInfo } from './unified-wizard/UnifiedStepInfo';
import { UnifiedStepSpecs } from './unified-wizard/UnifiedStepSpecs';
import { UnifiedStepProduction } from './unified-wizard/UnifiedStepProduction';
import { UnifiedStepMontaje } from './unified-wizard/UnifiedStepMontaje';
import { UnifiedStepMachine } from './unified-wizard/UnifiedStepMachine';
import { UnifiedStepOperations } from './unified-wizard/UnifiedStepOperations';
import { UnifiedStepSummary } from './unified-wizard/UnifiedStepSummary';

/* ── Edit-specific steps ──────────────────────────────────────── */
const EDIT_STEPS = [
  { key: 'info',       label: 'Información',      icon: '👤' },
  { key: 'specs',      label: 'Especificaciones',  icon: '📐' },
  { key: 'production', label: 'Producción',        icon: '🏭' },
  { key: 'montaje',    label: 'Montaje',           icon: '🧩' },
  { key: 'machine',    label: 'Máquina',           icon: '⚙️' },
  { key: 'operations', label: 'Costos',            icon: '💰' },
  { key: 'summary',    label: 'Resumen',           icon: '✅' },
] as const;

interface Props {
  /** The existing OT record from DB */
  ot: any;
  onClose: () => void;
  onSuccess: () => void;
}

/** Build a UnifiedOTForm from an existing DB OT record + localStorage production data */
function hydrateFromOT(ot: any): UnifiedOTForm {
  // Load production-specific data from localStorage
  let production: any = {};
  try {
    const raw = localStorage.getItem(`ot-production-${ot.id}`);
    if (raw) production = JSON.parse(raw);
  } catch { /* ignore */ }

  return {
    ...EMPTY_UNIFIED_FORM,

    /* ─ Category ─ */
    work_category: (production.work_category as WorkCategoryKey) || null,

    /* ─ Info ─ */
    client_name: ot.client_name || '',
    client_id: ot.client_id || '',
    product_name: ot.product_name || '',
    trabajo: production.production_detail?.production_description || ot.product_name || '',
    quantity: ot.quantity || 1000,
    deadline: ot.deadline ? new Date(ot.deadline).toISOString().slice(0, 10) : '',
    fecha_ot: ot.created_at ? new Date(ot.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    priority_level: ot.priority_level || 'normal',
    description: ot.description || '',
    template_id: ot.template_id || '',
    ot_anterior: '',

    /* ─ Specs ─ */
    product_type: ot.product_type || '',
    width_cm: ot.width_cm || 0,
    height_cm: ot.height_cm || 0,
    substrate_type: ot.substrate_type || '',
    grammage_gsm: ot.grammage_gsm || 150,
    substrate_brand: ot.substrate_brand || '',
    substrate_supplier: ot.substrate_supplier || '',
    color_front: ot.color_front || 'cmyk',
    color_back: ot.color_back || 'sin_impresion',
    pantone_colors: ot.pantone_colors || [],
    finishes: {
      finish_troquelado: ot.finish_troquelado ?? false,
      finish_plegado: ot.finish_plegado ?? false,
      finish_pegado: ot.finish_pegado ?? false,
      finish_laminado: ot.finish_laminado ?? false,
      finish_barniz: ot.finish_barniz ?? false,
      finish_relieve: ot.finish_relieve ?? false,
      finish_perforado: ot.finish_perforado ?? false,
      finish_hot_stamping: ot.finish_hot_stamping ?? false,
      finish_uv_localizado: ot.finish_uv_localizado ?? false,
      finish_numeracion: ot.finish_numeracion ?? false,
    },
    attachments: [],

    /* ─ Production detail (from localStorage) ─ */
    production_detail: production.production_detail || EMPTY_UNIFIED_FORM.production_detail,
    tapas: production.tapas || [],
    items: production.items || [],
    pliegos: production.pliegos || [],

    /* ─ Montaje ─ */
    montaje: production.montaje || EMPTY_UNIFIED_FORM.montaje,
    montaje_shapes: production.montaje_shapes || [],
    press_sheet_width: 700,
    press_sheet_height: 1000,

    /* ─ Machine / Finishing / Admin ─ */
    machine: production.machine || EMPTY_UNIFIED_FORM.machine,
    finishing: production.finishing || EMPTY_UNIFIED_FORM.finishing,
    admin: production.admin || EMPTY_UNIFIED_FORM.admin,

    /* ─ Calculations / Pricing ─ */
    calculations: {
      calc_sheets: ot.calc_sheets || 0,
      calc_substrate_kg: ot.calc_substrate_kg || 0,
      calc_ink_kg: ot.calc_ink_kg || 0,
      calc_plates: ot.calc_plates || 0,
      calc_print_hours: ot.calc_print_hours || 0,
      calc_finish_hours: ot.calc_finish_hours || 0,
    },
    imposition: null,
    operations: [], // will be loaded separately
    pricing: {
      subtotal: ot.subtotal || 0,
      margin_pct: ot.margin_pct ?? 10,
      margin_amount: ot.margin_amount || 0,
      increment_pct: ot.increment_pct ?? 10,
      increment_amount: ot.increment_amount || 0,
      commission_pct: ot.commission_pct ?? 1,
      commission_amount: ot.commission_amount || 0,
      total_price: ot.total_price || 0,
      unit_price: ot.unit_price || 0,
    },
    extra_quantities: [],
  };
}

export function EditBudgetWizard({ ot, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<UnifiedOTForm>(() => hydrateFromOT(ot));
  const [originalPrice, setOriginalPrice] = useState(ot.total_price || 0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingOps, setLoadingOps] = useState(true);
  // Real rates for the estimate: shared DB catalog + purchase-weighted material cost.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();
  const { toast } = useToast();

  /* ── Load existing operations from ot_operations via the OT data ─ */
  useEffect(() => {
    async function loadOps() {
      try {
        // The OT from useOTs() doesn't include operations — fetch them
        const res = await fetch(`/api/ots/${ot.id}/operations`);
        if (res.ok) {
          const ops = await res.json();
          if (Array.isArray(ops) && ops.length > 0) {
            setForm((prev) => ({ ...prev, operations: ops }));
          }
        }
      } catch { /* ignore, will regenerate */ }
      setLoadingOps(false);
    }
    loadOps();
  }, [ot.id]);

  /* ── Update helper ──────────────────────────────────────────── */
  const updateForm = useCallback((patch: Partial<UnifiedOTForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  /* ── Auto-calculate when specs change ──────────────────────── */
  useEffect(() => {
    if (form.width_cm > 0 && form.height_cm > 0 && form.quantity > 0) {
      const calcInput: OTFormData = {
        client_name: form.client_name,
        client_id: form.client_id,
        product_name: form.product_name,
        quantity: form.quantity,
        deadline: form.deadline,
        priority_level: form.priority_level,
        description: form.description,
        template_id: form.template_id,
        product_type: form.product_type as any || '',
        width_cm: form.width_cm,
        height_cm: form.height_cm,
        substrate_type: form.substrate_type,
        grammage_gsm: form.grammage_gsm,
        substrate_brand: form.substrate_brand,
        substrate_supplier: form.substrate_supplier,
        color_front: form.color_front,
        color_back: form.color_back,
        pantone_colors: form.pantone_colors,
        finishes: form.finishes,
        attachments: [],
        calculations: form.calculations,
        imposition: form.imposition,
        operations: form.operations,
        pricing: form.pricing,
        extra_quantities: form.extra_quantities,
      };

      const calcs = computeOTCalculations(calcInput);
      const impo = computeImposition(form.width_cm, form.height_cm, form.quantity);
      const costOverrides = resolveCostOverrides(catalog, {
        color_front: form.color_front, color_back: form.color_back,
        substrate_type: form.substrate_type, grammage_gsm: form.grammage_gsm,
      }, materialCost);
      const ops =
        form.operations.length === 0
          ? generateDefaultOperations(calcInput, calcs, costOverrides)
          : form.operations;
      const pricing = computeOTPricing(
        ops,
        form.quantity,
        form.pricing.margin_pct,
        form.pricing.increment_pct,
        form.pricing.commission_pct
      );

      setForm((prev) => ({
        ...prev,
        calculations: calcs,
        imposition: impo,
        operations: prev.operations.length === 0 ? ops : prev.operations,
        pricing,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.width_cm,
    form.height_cm,
    form.quantity,
    form.grammage_gsm,
    form.color_front,
    form.color_back,
    form.substrate_type,
  ]);

  /* ── Step validation ────────────────────────────────────────── */
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: // info
        return form.client_name.trim().length > 0 && form.quantity > 0;
      case 1: // specs
        return form.width_cm > 0 && form.height_cm > 0;
      default:
        return true;
    }
  }, [step, form.client_name, form.quantity, form.width_cm, form.height_cm]);

  /* ── Navigation ─────────────────────────────────────────────── */
  const goNext = () => {
    if (step < EDIT_STEPS.length - 1 && canAdvance) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  /* ── Price change detection ─────────────────────────────────── */
  const priceChanged = form.pricing.total_price !== originalPrice;
  const priceDiff = form.pricing.total_price - originalPrice;
  const priceDiffPct = originalPrice > 0 ? (priceDiff / originalPrice) * 100 : 0;

  /* ── Submit changes via PATCH ───────────────────────────────── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: any = {
        client_name: form.client_name,
        client_id: form.client_id || null,
        product_name: form.product_name || form.trabajo || 'Sin nombre',
        description: form.description || null,
        quantity: form.quantity,
        priority_level: form.priority_level,
        deadline: form.deadline || null,
        product_type: form.product_type || null,
        width_cm: form.width_cm || null,
        height_cm: form.height_cm || null,
        substrate_type: form.substrate_type || null,
        grammage_gsm: form.grammage_gsm || null,
        substrate_brand: form.substrate_brand || null,
        substrate_supplier: form.substrate_supplier || null,
        color_front: form.color_front,
        color_back: form.color_back,
        pantone_colors: form.pantone_colors.length > 0 ? form.pantone_colors : null,
        ...Object.fromEntries(
          Object.entries(form.finishes).map(([k, v]) => [k, v])
        ),
        calc_sheets: form.calculations.calc_sheets || null,
        calc_substrate_kg: form.calculations.calc_substrate_kg || null,
        calc_ink_kg: form.calculations.calc_ink_kg || null,
        calc_plates: form.calculations.calc_plates || null,
        calc_print_hours: form.calculations.calc_print_hours || null,
        calc_finish_hours: form.calculations.calc_finish_hours || null,
        subtotal: form.pricing.subtotal,
        margin_pct: form.pricing.margin_pct,
        margin_amount: form.pricing.margin_amount,
        increment_pct: form.pricing.increment_pct,
        increment_amount: form.pricing.increment_amount,
        commission_pct: form.pricing.commission_pct,
        commission_amount: form.pricing.commission_amount,
        total_price: form.pricing.total_price,
        unit_price: form.pricing.unit_price,
        operations: form.operations.map((op) => ({
          category: op.category,
          name: op.name,
          unit: op.unit,
          quantity: op.quantity,
          unit_cost: op.unit_cost,
          sort_order: op.sort_order,
        })),
        notes: [
          form.production_detail.production_description,
          form.admin.notas_produccion,
        ]
          .filter(Boolean)
          .join('\n') || null,
      };

      const res = await fetch(`/api/ots/${ot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to update OT');
      }

      // Update production-specific data in localStorage
      localStorage.setItem(
        `ot-production-${ot.id}`,
        JSON.stringify({
          production_detail: form.production_detail,
          tapas: form.tapas,
          items: form.items,
          pliegos: form.pliegos,
          montaje: form.montaje,
          montaje_shapes: form.montaje_shapes,
          machine: form.machine,
          finishing: form.finishing,
          admin: form.admin,
          work_category: form.work_category,
        })
      );

      toast({
        title: '✅ Presupuesto Actualizado',
        description: priceChanged
          ? `${ot.ot_number} — Precio: ${formatCLP(originalPrice)} → ${formatCLP(form.pricing.total_price)}`
          : `${ot.ot_number} — Cambios guardados sin modificar el precio`,
      });

      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudo actualizar el presupuesto',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render current step ────────────────────────────────────── */
  const renderStep = () => {
    switch (step) {
      case 0:
        return <UnifiedStepInfo form={form} updateForm={updateForm} />;
      case 1:
        return <UnifiedStepSpecs form={form} updateForm={updateForm} />;
      case 2:
        return <UnifiedStepProduction form={form} updateForm={updateForm} />;
      case 3:
        return <UnifiedStepMontaje form={form} updateForm={updateForm} />;
      case 4:
        return <UnifiedStepMachine form={form} updateForm={updateForm} />;
      case 5:
        return <UnifiedStepOperations form={form} updateForm={updateForm} />;
      case 6:
        return <UnifiedStepSummary form={form} updateForm={updateForm} />;
      default:
        return null;
    }
  };

  const progressPct = ((step + 1) / EDIT_STEPS.length) * 100;
  const currentStep = EDIT_STEPS[step];
  const isLastStep = step === EDIT_STEPS.length - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Top bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          {/* Close */}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cerrar
          </Button>

          {/* Title */}
          <div className="text-center">
            <h2 className="text-sm font-bold text-foreground">
              ✏️ Modificar Presupuesto — {ot.ot_number}
            </h2>
            <p className="text-xs text-muted-foreground">{ot.client_name}</p>
          </div>

          {/* Steps pills */}
          <div className="hidden lg:flex items-center gap-1">
            {EDIT_STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => {
                  if (i <= step || canAdvance) setStep(i);
                }}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all
                  ${
                    i === step
                      ? 'bg-amber-500 text-white shadow-md'
                      : i < step
                        ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                        : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                <span>{s.icon}</span>
                <span className="hidden xl:inline">{s.label}</span>
                {i < step && <CheckCircle2 className="h-3 w-3" />}
              </button>
            ))}
          </div>

          {/* Mobile step counter */}
          <div className="lg:hidden">
            <Badge variant="outline" className="text-sm">
              {currentStep.icon} {step + 1}/{EDIT_STEPS.length}
            </Badge>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-5xl mx-auto mt-2">
          <Progress value={progressPct} className="h-1" />
        </div>
      </header>

      {/* ─── Price change banner ─────────────────────────────── */}
      {priceChanged && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-sm text-amber-300">
              <strong>Precio modificado:</strong>{' '}
              {formatCLP(originalPrice)} → {formatCLP(form.pricing.total_price)}{' '}
              <span className={priceDiff > 0 ? 'text-red-400' : 'text-green-400'}>
                ({priceDiff > 0 ? '+' : ''}{Math.round(priceDiffPct)}%)
              </span>
            </span>
          </div>
        </div>
      )}

      {/* ─── Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          {loadingOps ? (
            <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando datos del presupuesto…
            </div>
          ) : (
            renderStep()
          )}
        </div>
      </main>

      {/* ─── Bottom navigation ───────────────────────────────── */}
      <footer className="sticky bottom-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>

          <span className="text-sm text-muted-foreground hidden sm:inline">
            {currentStep.icon} {currentStep.label} — Paso {step + 1} de {EDIT_STEPS.length}
          </span>

          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700 text-white min-w-[200px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Presupuesto
                </>
              )}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canAdvance}>
              Siguiente
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
