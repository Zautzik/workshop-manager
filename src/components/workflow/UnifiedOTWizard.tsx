'use client';

/**
 * UnifiedOTWizard — Single OT creation flow (8 steps).
 * Merges quote + production into one comprehensive wizard.
 * Creates OT at "visto_bueno" (pending approval) status.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  ArrowRight,
  X,
  Save,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EMPTY_UNIFIED_FORM, UNIFIED_STEPS, type UnifiedOTForm } from '@/types/ot-unified';
import { CATEGORY_DEFAULTS, type WorkCategoryKey } from '@/types/work-category';
import {
  computeOTCalculations,
  computeImposition,
  generateDefaultOperations,
  computeOTPricing,
} from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import type { OTFormData } from '@/types/ot';

/* ── Step Components ──────────────────────────────────────────── */
import { UnifiedStepCategory } from './unified-wizard/UnifiedStepCategory';
import { UnifiedStepInfo } from './unified-wizard/UnifiedStepInfo';
import { UnifiedStepSpecs } from './unified-wizard/UnifiedStepSpecs';
import { UnifiedStepProduction } from './unified-wizard/UnifiedStepProduction';
import { UnifiedStepMontaje } from './unified-wizard/UnifiedStepMontaje';
import { UnifiedStepMachine } from './unified-wizard/UnifiedStepMachine';
import { UnifiedStepOperations } from './unified-wizard/UnifiedStepOperations';
import { UnifiedStepSummary } from './unified-wizard/UnifiedStepSummary';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const DRAFT_KEY = 'unified-ot-draft';

export function UnifiedOTWizard({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<UnifiedOTForm>({ ...EMPTY_UNIFIED_FORM });
  const [submitting, setSubmitting] = useState(false);
  // A restored draft used to appear silently — a half-filled form from last
  // week with no explanation (2026-07 audit). Surface it as a dismissible
  // banner with a "start fresh" escape hatch.
  const [draftRestored, setDraftRestored] = useState(false);
  // Real rates for the estimate: shared DB catalog + purchase-weighted material cost.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();
  const { toast } = useToast();

  /* ── Draft persistence ──────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only treat it as a real draft if the user had entered something.
        if (parsed.form && (parsed.form.client_name || parsed.form.work_category || (parsed.step ?? 0) > 0)) {
          setForm((prev) => ({ ...prev, ...parsed.form }));
          setStep(parsed.step ?? 0);
          setDraftRestored(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const discardDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setForm({ ...EMPTY_UNIFIED_FORM });
    setStep(0);
    setDraftRestored(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step }));
    } catch { /* ignore */ }
  }, [form, step]);

  /* ── Update helper ──────────────────────────────────────────── */
  const updateForm = useCallback((patch: Partial<UnifiedOTForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  /* ── When category is selected, apply defaults ──────────────── */
  const handleCategorySelect = useCallback((cat: WorkCategoryKey) => {
    const defaults = CATEGORY_DEFAULTS[cat];
    if (defaults) {
      updateForm({
        work_category: cat,
        substrate_type: (defaults.papel as any) || '',
        grammage_gsm: defaults.grammage_grs || 150,
        machine: {
          ...form.machine,
          machine_type: (defaults.machine_type as any) || 'offset_4_colores',
          color_config: defaults.color_config || '4/4',
        },
        finishing: {
          ...form.finishing,
          corte_resma: defaults.corte_resma ?? false,
          corte_final: defaults.corte_final ?? false,
          doblados: defaults.doblados ?? false,
          corchetes: defaults.corchetes ?? false,
          cajas: defaults.cajas ?? false,
        },
        montaje: {
          ...form.montaje,
          montaje_grid: defaults.montaje_grid || '1 x 2',
          corte_hoja: defaults.corte_hoja || '1/4 Normal',
        },
        production_detail: {
          ...form.production_detail,
          production_description: defaults.production_description || '',
          formato: defaults.formato || '',
          tapas_spec: defaults.tapas_spec || '',
          interior_spec: defaults.interior_spec || '',
          acabado: defaults.acabado || '',
        },
      });
    } else {
      updateForm({ work_category: cat });
    }
    setStep(1);
  }, [form.machine, form.finishing, form.montaje, form.production_detail, updateForm]);

  /* ── Auto-calculate when specs change ──────────────────────── */
  useEffect(() => {
    if (form.width_cm > 0 && form.height_cm > 0 && form.quantity > 0) {
      // Build a compatible OTFormData for the calculation engine
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
    // Don't include form.operations/pricing to avoid loop
  ]);

  /* ── Step validation ────────────────────────────────────────── */
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!form.work_category;
      case 1:
        return form.client_name.trim().length > 0 && form.quantity > 0;
      case 2:
        return form.width_cm > 0 && form.height_cm > 0;
      default:
        return true;
    }
  }, [step, form.work_category, form.client_name, form.quantity, form.width_cm, form.height_cm]);

  /* ── Navigation ─────────────────────────────────────────────── */
  const goNext = () => {
    if (step < UNIFIED_STEPS.length - 1 && canAdvance) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const uploadAttachments = async (otId: string, files: File[]) => {
    if (!files.length) return { uploaded: 0, failed: 0 };

    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ot_id', otId);

      const response = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) uploaded += 1;
      else failed += 1;
    }

    return { uploaded, failed };
  };

  /* ── Submit to API ──────────────────────────────────────────── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // 1) Generate OT number (plant correlative, e.g. OT-40502)
      const numRes = await fetch('/api/ots/generate-number');
      const numBody = await numRes.json().catch(() => null);
      if (!numRes.ok || !numBody?.ot_number) {
        throw new Error(numBody?.error || 'No se pudo generar el número de OT. Reintenta.');
      }
      const { ot_number } = numBody;

      // 2) Prepare API payload
      const payload = {
        ot_number,
        client_name: form.client_name,
        client_id: form.client_id || null,
        product_name: form.product_name || form.trabajo || 'Sin nombre',
        description: form.description || null,
        quantity: form.quantity,
        priority_level: form.priority_level,
        deadline: form.deadline || null,
        status: 'visto_bueno', // starts at approval
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
        // Machine assignment from Machines module
        assigned_machine_id: form.machine.machine_id || null,
        // Full production bundle — persisted to the DB (was localStorage-only).
        production_detail: {
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
        },
      };

      const res = await fetch('/api/ots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to create OT');
      }

      const createdOT = await res.json();

      const attachmentResult = await uploadAttachments(createdOT.id, form.attachments);

      // Store production-specific data in localStorage for now
      // (production detail, tapas, items, pliegos, montaje, machine, finishing, admin)
      localStorage.setItem(
        `ot-production-${createdOT.id}`,
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

      // Clear draft
      localStorage.removeItem(DRAFT_KEY);

      toast({
        title: '✅ OT Creada',
        description: `${createdOT.ot_number} — Esperando aprobación (Visto Bueno)`,
      });

      if (attachmentResult.failed > 0) {
        toast({
          title: 'OT creada con advertencias',
          description: `Se subieron ${attachmentResult.uploaded} archivo(s) y ${attachmentResult.failed} fallaron.`,
          variant: 'destructive',
        });
      }

      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudo crear la OT',
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
        return (
          <UnifiedStepCategory
            selected={form.work_category}
            onSelect={handleCategorySelect}
          />
        );
      case 1:
        return <UnifiedStepInfo form={form} updateForm={updateForm} />;
      case 2:
        return <UnifiedStepSpecs form={form} updateForm={updateForm} />;
      case 3:
        return <UnifiedStepProduction form={form} updateForm={updateForm} />;
      case 4:
        return <UnifiedStepMontaje form={form} updateForm={updateForm} />;
      case 5:
        return <UnifiedStepMachine form={form} updateForm={updateForm} />;
      case 6:
        return <UnifiedStepOperations form={form} updateForm={updateForm} />;
      case 7:
        return <UnifiedStepSummary form={form} updateForm={updateForm} />;
      default:
        return null;
    }
  };

  const progressPct = ((step + 1) / UNIFIED_STEPS.length) * 100;
  const currentStep = UNIFIED_STEPS[step];
  const isLastStep = step === UNIFIED_STEPS.length - 1;

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

          {/* Steps pills */}
          <div className="hidden md:flex items-center gap-1">
            {UNIFIED_STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => {
                  if (i <= step || canAdvance) setStep(i);
                }}
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all
                  ${
                    i === step
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : i < step
                        ? 'bg-primary/15 text-primary hover:bg-primary/25'
                        : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                <span>{s.icon}</span>
                <span className="hidden lg:inline">{s.label}</span>
                {i < step && <CheckCircle2 className="h-3 w-3" />}
              </button>
            ))}
          </div>

          {/* Mobile: step counter */}
          <div className="md:hidden">
            <Badge variant="outline" className="text-sm">
              {currentStep.icon} Paso {step + 1}/{UNIFIED_STEPS.length}
            </Badge>
          </div>

          {/* Draft indicator */}
          <Badge variant="secondary" className="text-xs gap-1">
            <Save className="h-3 w-3" />
            Auto-guardado
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="max-w-5xl mx-auto mt-2">
          <Progress value={progressPct} className="h-1" />
        </div>
      </header>

      {/* ─── Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          {draftRestored && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
              <span className="text-amber-700 dark:text-amber-300">
                Recuperamos un borrador sin terminar. Puedes continuarlo o empezar de cero.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraftRestored(false)}>
                  Continuar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={discardDraft}>
                  Empezar de cero
                </Button>
              </div>
            </div>
          )}
          {renderStep()}
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
            {currentStep.icon} {currentStep.label} — Paso {step + 1} de {UNIFIED_STEPS.length}
          </span>

          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando OT…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Crear OT
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
