'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, ArrowRight, Check, FileBox, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OTFormData } from '@/types/ot';
import { INITIAL_OT_FORM } from '@/types/ot';
import {
  computeOTCalculations,
  generateDefaultOperations,
  computeOTPricing,
  computeImposition,
} from '@/lib/ot-calculations';
import { useOTDraftAutoSave, hasSavedDraft } from '@/hooks/use-ot-draft';

import { OTStepInformation } from './ot-wizard/OTStepInformation';
import { OTStepSpecifications } from './ot-wizard/OTStepSpecifications';
import { OTStepCalculations } from './ot-wizard/OTStepCalculations';
import { OTStepOperations } from './ot-wizard/OTStepOperations';
import { OTStepPricing } from './ot-wizard/OTStepPricing';

/* ─── Step definitions ──────────────────────────────────────── */

const STEPS = [
  { key: 'info', label: 'Información', number: 1 },
  { key: 'specs', label: 'Especificaciones', number: 2 },
  { key: 'calcs', label: 'Cálculos', number: 3 },
  { key: 'ops', label: 'Operaciones', number: 4 },
  { key: 'price', label: 'Precio', number: 5 },
] as const;

/* ─── Props ─────────────────────────────────────────────────── */

interface CreateOTWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

/* ─── Component ─────────────────────────────────────────────── */

export function CreateOTWizard({ onClose, onSuccess }: CreateOTWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OTFormData>({ ...INITIAL_OT_FORM });
  const [saving, setSaving] = useState(false);
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const { toast } = useToast();

  /* Draft auto-save */
  const draft = useOTDraftAutoSave(form, step, true);

  /* Check for existing draft on mount */
  useEffect(() => {
    if (hasSavedDraft()) {
      setShowDraftRestore(true);
    }
  }, []);

  const restoreDraft = () => {
    const saved = draft.loadFromLocal();
    if (saved) {
      setForm({ ...INITIAL_OT_FORM, ...saved.form, attachments: [] });
      setStep(saved.step);
      toast({ title: 'Borrador restaurado', description: 'Continúa donde lo dejaste' });
    }
    setShowDraftRestore(false);
  };

  /* Update form fields */
  const updateForm = useCallback(
    (patch: Partial<OTFormData>) => setForm((prev) => ({ ...prev, ...patch })),
    []
  );

  /* When moving from step 1→2, nothing special */
  /* When moving from step 2→3, auto-calculate + imposition */
  useEffect(() => {
    if (step === 2) {
      const calcs = computeOTCalculations(form);
      const imp = computeImposition(form.width_cm, form.height_cm, form.quantity);
      updateForm({ calculations: calcs, imposition: imp });
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  /* When moving from step 3→4, generate default operations */
  useEffect(() => {
    if (step === 3 && form.operations.length === 0) {
      const ops = generateDefaultOperations(form, form.calculations);
      const pricing = computeOTPricing(ops, form.quantity);
      updateForm({ operations: ops, pricing });
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Recalc pricing whenever operations change */
  const recalcPricing = useCallback(() => {
    const pricing = computeOTPricing(
      form.operations,
      form.quantity,
      form.pricing.margin_pct,
      form.pricing.increment_pct,
      form.pricing.commission_pct
    );
    updateForm({ pricing });
  }, [form.operations, form.quantity, form.pricing.margin_pct, form.pricing.increment_pct, form.pricing.commission_pct, updateForm]);

  /* Step validation */
  const isStepValid = useMemo(() => {
    switch (step) {
      case 0:
        return form.client_name.trim().length > 0 && form.product_name.trim().length > 0 && form.quantity > 0;
      case 1:
        return true; // specs are optional
      case 2:
        return true; // calculations are auto
      case 3:
        return form.operations.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, form]);

  /* Navigation */
  const goNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  /* Submit the OT */
  const handleSubmit = async () => {
    setSaving(true);
    try {
      // First generate the OT number
      const numberRes = await fetch('/api/ots/generate-number');
      const { ot_number } = await numberRes.json();

      // Build payload
      const payload = {
        ot_number,
        client_name: form.client_name,
        client_id: form.client_id || null,
        product_name: form.product_name,
        description: form.description || null,
        quantity: form.quantity,
        priority_level: form.priority_level,
        deadline: form.deadline || null,
        status: 'pre_press',
        template_id: form.template_id || null,
        // Specs
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
        // Finishes
        ...form.finishes,
        // Calculations
        ...form.calculations,
        // Pricing
        ...form.pricing,
        // Operations sent separately
        operations: form.operations.map((op) => ({
          category: op.category,
          name: op.name,
          unit: op.unit,
          quantity: op.quantity,
          unit_cost: op.unit_cost,
          sort_order: op.sort_order,
        })),
      };

      const response = await fetch('/api/ots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'Error al crear la OT');
      }

      // Clear the draft after successful creation
      draft.clearDraft();

      toast({ title: 'OT creada exitosamente', description: `Orden ${ot_number} registrada` });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({
        title: 'Error al crear la OT',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /* Save draft explicitly */
  const handleSaveDraft = async () => {
    draft.saveToLocal();
    draft.saveToServer();
    toast({ title: 'Borrador guardado', description: 'Puedes continuar editando más tarde' });
  };

  /* Format last saved time */
  const lastSavedLabel = draft.lastSaved
    ? `Guardado ${draft.lastSaved.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
    : draft.isDirty
      ? 'Sin guardar'
      : '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Draft restore banner ────────────────────────── */}
      {showDraftRestore && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileBox className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-amber-200 font-medium">
                Tienes un borrador guardado
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-300 hover:text-amber-100"
                onClick={() => setShowDraftRestore(false)}
              >
                Ignorar
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={restoreDraft}
              >
                Restaurar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-foreground text-center">
            Nueva Orden de Trabajo
          </h1>

          {/* ─── Stepper ─────────────────────────────────── */}
          <div className="flex items-center justify-center mt-4">
            {STEPS.map((s, i) => {
              const isActive = i === step;
              const isCompleted = i < step;
              return (
                <div key={s.key} className="flex items-center">
                  {/* Step circle */}
                  <button
                    type="button"
                    onClick={() => i <= step && setStep(i)}
                    className={cn(
                      'flex flex-col items-center gap-1 group cursor-pointer',
                      i > step && 'opacity-50 cursor-default'
                    )}
                    disabled={i > step}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                        isCompleted && 'bg-primary text-primary-foreground',
                        isActive && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
                        !isCompleted && !isActive && 'bg-muted text-muted-foreground border border-border'
                      )}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : s.number}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] sm:text-xs font-medium',
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'w-12 sm:w-20 h-0.5 mx-1',
                        i < step ? 'bg-primary' : 'bg-border'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Step Content ────────────────────────────────── */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {step === 0 && (
          <OTStepInformation form={form} updateForm={updateForm} />
        )}
        {step === 1 && (
          <OTStepSpecifications form={form} updateForm={updateForm} />
        )}
        {step === 2 && (
          <OTStepCalculations form={form} updateForm={updateForm} />
        )}
        {step === 3 && (
          <OTStepOperations
            form={form}
            updateForm={updateForm}
            recalcPricing={recalcPricing}
          />
        )}
        {step === 4 && (
          <OTStepPricing form={form} updateForm={updateForm} />
        )}
      </div>

      {/* ─── Footer Navigation ───────────────────────────── */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm sticky bottom-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={step === 0 ? onClose : goBack}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>

          <Button
            variant="ghost"
            onClick={handleSaveDraft}
            className="gap-2 text-muted-foreground"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">{lastSavedLabel || 'Guardar borrador'}</span>
            {draft.isDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={goNext}
              disabled={!isStepValid}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              Siguiente
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={saving || !isStepValid}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {saving ? 'Creando...' : 'Crear OT'}
              <Check className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
