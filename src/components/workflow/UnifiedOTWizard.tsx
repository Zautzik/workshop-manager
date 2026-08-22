'use client';

/**
 * UnifiedOTWizard — Single OT creation flow (8 steps).
 * Merges quote + production into one comprehensive wizard.
 * Creates OT at "visto_bueno" (pending approval) status.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EMPTY_UNIFIED_FORM, UNIFIED_STEPS, type UnifiedOTForm } from '@/types/ot-unified';
import { handoffSummary, takeHandoff, toWizardForm } from '@/lib/ot-handoff';
import { validateStep, validateAllSteps, canJumpToStep } from '@/lib/ot-wizard-validation';
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
  /** Cuántos campos llegaron desde la cotización, para poder decirlo. */
  const [desdeCotizacion, setDesdeCotizacion] = useState<{ campos: number; terminaciones: number } | null>(null);
  // Real rates for the estimate: shared DB catalog + purchase-weighted material cost.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();
  // Machines: the selected press feeds real speed + colour bodies into the
  // engine (P6.1 — a 4/0 job on a 4-body press is ONE pass, not four).
  //
  // El `?? []` va en un `useMemo` y NO como valor por defecto de la
  // desestructuración. Un `= []` mintea un arreglo NUEVO en cada render mientras
  // la consulta carga, y este arreglo es dependencia del efecto que recalcula y
  // llama a `setForm`: render → dependencia nueva → efecto → setForm → render.
  // Bucle infinito.
  //
  // Estaba latente desde siempre y no se veía porque el efecto tiene una guarda
  // —`width_cm > 0 && height_cm > 0 && quantity > 0`— que un formulario vacío no
  // pasa. Se destapó al prellenar el asistente desde una cotización, que es
  // justo lo que hace que la guarda se cumpla desde el primer render. También lo
  // habría destapado restaurar un borrador con medidas.
  const { data: maquinasCargadas } = useQuery<any[]>({
    queryKey: ['machines', 'wizard-calc'],
    queryFn: async () => {
      const res = await fetch('/api/machines?limit=100', { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });
  const wizardMachines = useMemo(() => maquinasCargadas ?? [], [maquinasCargadas]);
  const { toast } = useToast();

  /* ── Traspaso desde la cotización ───────────────────────────── */
  //
  // Se lee ANTES que el borrador y lo gana: quien apretó «Completar todos los
  // datos» lo pidió hace dos segundos, y un borrador de la semana pasada no
  // puede pisarle lo que acaba de escribir.
  useEffect(() => {
    const traspaso = takeHandoff();
    if (!traspaso) return;
    setForm((prev) => ({ ...prev, ...toWizardForm(traspaso) }));
    // Arranca en el paso 1: la categoría ya viene resuelta del tipo de producto,
    // y hacerlo elegirla de nuevo sería pedirle lo que ya contestó.
    setStep(toWizardForm(traspaso).work_category ? 1 : 0);
    setDesdeCotizacion(handoffSummary(traspaso));
  }, []);

  /* ── Draft persistence ──────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only treat it as a real draft if the user had entered something.
        if (parsed.form && (parsed.form.client_name || parsed.form.work_category || (parsed.step ?? 0) > 0)) {
          // Un traspaso desde la cotización gana: se pidió hace dos segundos y
          // el borrador puede ser de la semana pasada. `setForm` funcional para
          // poder mirar lo que ya hay en vez de suponerlo.
          setForm((prev) => (prev.client_id || prev.product_name ? prev : { ...prev, ...parsed.form }));
          setStep((prevStep) => (prevStep > 0 ? prevStep : parsed.step ?? 0));
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

      // The chosen machine sharpens the estimate (real speed + colour bodies).
      const machine = wizardMachines.find((m) => m.id === form.machine.machine_id);
      // Área máxima imprimible de la prensa elegida. Sin esto el motor proponía
      // pliegos que la máquina no puede tomar — una Ryobi 524GS agarra 37×52 y
      // se le mandaba un 77×110 (auditoría 2026-07).
      const pressLimit =
        machine?.max_print_width_mm && machine?.max_print_height_mm
          ? {
              maxWidthCm: Number(machine.max_print_width_mm) / 10,
              maxHeightCm: Number(machine.max_print_height_mm) / 10,
            }
          : null;

      const calcOpts = {
        inkCoverage: form.ink_coverage,
        machineSpeedSheetsHr: machine?.nominal_speed_sheets_hr ?? undefined,
        pressBodies: machine?.colors ?? undefined,
        pressLimit,
      };
      const impo = computeImposition(form.width_cm, form.height_cm, form.quantity, pressLimit);
      // La imposición alimenta el costeo: el corte de resma se deriva de ella.
      const calcs = computeOTCalculations({ ...calcInput, imposition: impo }, calcOpts);
      const costOverrides = resolveCostOverrides(catalog, {
        color_front: form.color_front, color_back: form.color_back,
        substrate_type: form.substrate_type, grammage_gsm: form.grammage_gsm,
      }, materialCost);
      const ops =
        form.operations.length === 0
          ? generateDefaultOperations({ ...calcInput, imposition: impo }, calcs, costOverrides)
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
    // Machine selection re-runs the estimate with real speed/bodies (P6.1).
    form.machine.machine_id,
    wizardMachines,
    // Don't include form.operations/pricing to avoid loop
  ]);

  /**
   * Repetición: cargar las especificaciones de un trabajo anterior y saltar
   * directo a Información. No se copia el precio — se recalcula con las tarifas
   * de hoy, porque arrastrar un precio viejo es cómo se repite un error.
   */
  const handleRepeatPrevious = useCallback(
    (patch: Partial<UnifiedOTForm>, otNumber: string) => {
      updateForm(patch);
      setStep(1);
      toast({
        title: `Repitiendo OT ${otNumber}`,
        description: 'Especificaciones cargadas. El precio se recalcula con las tarifas actuales.',
      });
    },
    [updateForm, toast]
  );

  /* ── Step validation ────────────────────────────────────────── */
  // La validación vive en src/lib/ot-wizard-validation.ts para poder testearse.
  // Antes esto hacía `default: return true` desde el paso 3, y como la barra de
  // pasos deja saltar mientras canAdvance sea verdadero, se llegaba al Resumen
  // sin elegir máquina — y sin máquina el motor imposiciona sobre una prensa
  // que no existe.
  const advanceCheck = useMemo(() => validateStep(step, form), [step, form]);
  const canAdvance = advanceCheck.ok;

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
    // Última red: revalida TODOS los pasos, no sólo el actual. Si alguien llegó
    // hasta acá por un camino que no previmos, la OT no se crea a medias.
    const completa = validateAllSteps(form);
    if (!completa.ok) {
      toast({
        title: 'Falta información para crear la OT',
        description: completa.reason ?? undefined,
        variant: 'destructive',
      });
      return;
    }

    // La pieza no entra en ningún pliego que la prensa elegida pueda tomar.
    // Antes se emitía igual una imposición imposible de montar.
    if (form.imposition?.exceeds_press) {
      toast({
        title: 'La pieza no entra en esa prensa',
        description: `${form.width_cm}×${form.height_cm} cm no cabe en ningún pliego que la máquina elegida pueda tomar. Elige otra prensa o revisa las medidas.`,
        variant: 'destructive',
      });
      return;
    }

    // La imagen ES el trabajo. Sin arte adjunto y sin la declaración explícita
    // de que aún no existe, la OT no se crea — y el servidor lo re-verifica.
    if (form.attachments.length === 0 && !form.sin_arte) {
      toast({
        title: 'Falta el diseño',
        description:
          'Adjunta la imagen del trabajo, o marca "todavía no hay diseño" para crearla declaradamente incompleta.',
        variant: 'destructive',
      });
      return;
    }

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
        art_files: form.attachments.length,
        sin_arte: form.sin_arte,
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
        ink_coverage: form.ink_coverage,
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
        // Every upload failed on an OT that promised art: mark it sin_arte so
        // the state stays honest and the badge asks for the file until it lands.
        if (attachmentResult.uploaded === 0 && !form.sin_arte) {
          await fetch(`/api/ots/${createdOT.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sin_arte: true }),
          }).catch(() => null);
        }
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
            onRepeat={handleRepeatPrevious}
          />
        );
      case 1:
        return <UnifiedStepInfo form={form} updateForm={updateForm} />;
      case 2:
        return <UnifiedStepSpecs form={form} updateForm={updateForm} />;
      case 3:
        return <UnifiedStepProduction form={form} updateForm={updateForm} />;
      // Máquina ANTES que montaje: los cuerpos de la prensa deciden las pasadas
      // y su formato máximo decide cuántas poses entran en el pliego. Preguntar
      // el montaje primero obliga a adivinar, y lo que se adivina es el default.
      case 4:
        return <UnifiedStepMachine form={form} updateForm={updateForm} />;
      case 5:
        return <UnifiedStepMontaje form={form} updateForm={updateForm} />;
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
    // `h-screen` y no `min-h-screen`: con altura mínima el contenedor crece con
    // el contenido, `main` nunca se acota, y el que hace scroll es la PÁGINA. La
    // barra de abajo es `sticky`, así que en ese escenario se pega al borde de
    // la ventana y tapa lo que hay detrás — que es por qué la última fila de
    // tarjetas aparecía cortada por la mitad.
    //
    // Con altura fija el que hace scroll es `main`, y la barra vuelve a ser un
    // hermano que nunca se superpone.
    <div className="h-screen bg-background flex flex-col overflow-hidden">
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
                  if (canJumpToStep(i, step, canAdvance)) setStep(i);
                }}
                title={
                  canJumpToStep(i, step, canAdvance)
                    ? undefined
                    : (advanceCheck.reason ?? 'Completa el paso actual para continuar')
                }
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
      {/* `pb-24` no es decoración: la barra de navegación es sticky y sin este
          espacio la última fila de contenido queda cortada por la mitad debajo
          de ella. Un corte a media tarjeta no se lee como «hay más abajo», se
          lee como que la pantalla está rota. */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-5xl mx-auto p-4 pb-24 md:p-6 md:pb-28">
          {/* De dónde viene. «Se recuperó un borrador» sería mentira: el
              vendedor no dejó nada a medias, vino a propósito desde la
              cotización. Y decir CUÁNTO se trajo evita que revise campo por
              campo para averiguar si llegó todo. */}
          {desdeCotizacion && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground">
                Vienes de una cotización: se trajeron {desdeCotizacion.campos} datos
                {desdeCotizacion.terminaciones > 0
                  ? ` y ${desdeCotizacion.terminaciones} ${desdeCotizacion.terminaciones === 1 ? 'terminación' : 'terminaciones'}`
                  : ''}
                . Falta el montaje, la máquina y el detalle de producción — el precio se
                recalcula al final con todo eso.
              </span>
            </div>
          )}
          {draftRestored && !desdeCotizacion && (
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

        {/* Un botón gris sin explicación obliga a adivinar qué falta. */}
        {!canAdvance && advanceCheck.reason && (
          <div className="max-w-5xl mx-auto px-1 pb-1">
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              {advanceCheck.reason}
            </p>
          </div>
        )}
      </footer>
    </div>
  );
}
