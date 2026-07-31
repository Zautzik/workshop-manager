import { describe, it, expect } from 'vitest';
import { validateStep, validateAllSteps, canJumpToStep, STEP } from '../ot-wizard-validation';
import { EMPTY_UNIFIED_FORM } from '@/types/ot-unified';
import type { UnifiedOTForm } from '@/types/ot-unified';

/** Un formulario completo y válido, del que cada test rompe una sola cosa. */
function formValido(): UnifiedOTForm {
  return {
    ...structuredClone(EMPTY_UNIFIED_FORM),
    work_category: 'cajas' as UnifiedOTForm['work_category'],
    client_name: 'Cliente Real',
    quantity: 5000,
    width_cm: 9,
    height_cm: 12,
    sin_arte: true,
    machine: { ...EMPTY_UNIFIED_FORM.machine, machine_id: 'uuid-de-la-ryobi' },
    imposition: {
      poses_per_sheet: 10,
      sheets_needed: 500,
      sheet_utilization_pct: 72,
      format_label: '35×50',
      format_w: 35,
      format_h: 50,
      cut_from: '70×100',
      cuts_per_parent: 4,
      exceeds_press: false,
    } as UnifiedOTForm['imposition'],
    operations: [{
      id: 'op-1', category: 'impresion', name: 'Impresión offset',
      unit: 'hora', quantity: 2, unit_cost: 55000, total_cost: 110000, sort_order: 1,
    }] as UnifiedOTForm['operations'],
    pricing: { ...EMPTY_UNIFIED_FORM.pricing, total_price: 250000 },
  };
}

describe('el agujero que dejaba costear sin máquina', () => {
  it('no deja pasar el paso Máquina sin máquina elegida', () => {
    const f = formValido();
    f.machine = { ...f.machine, machine_id: null };
    const r = validateStep(STEP.MACHINE, f);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('área máxima de impresión');
  });

  it('con máquina elegida, deja pasar', () => {
    expect(validateStep(STEP.MACHINE, formValido()).ok).toBe(true);
  });

  it('validateAllSteps frena la creación aunque se haya llegado al final sin máquina', () => {
    // Este es el caso real: alguien saltó por la barra de pasos y llegó al
    // Resumen. La última red antes de crear la OT.
    const f = formValido();
    f.machine = { ...f.machine, machine_id: undefined };
    const r = validateAllSteps(f);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Elige la máquina');
  });
});

describe('canJumpToStep — la barra de pasos ya no es un atajo al final', () => {
  it('siempre deja volver a un paso ya visitado', () => {
    expect(canJumpToStep(0, 5, false)).toBe(true);
    expect(canJumpToStep(4, 5, false)).toBe(true);
    expect(canJumpToStep(5, 5, false)).toBe(true);
  });

  it('deja avanzar sólo un paso, y sólo si el actual está completo', () => {
    expect(canJumpToStep(4, 3, true)).toBe(true);
    expect(canJumpToStep(4, 3, false)).toBe(false);
  });

  it('NO deja saltar del paso 3 al Resumen — el bug original', () => {
    // Antes: `i <= step || canAdvance` con canAdvance=true desde el paso 3
    // permitía setStep(7) directo, salteando Máquina, Montaje y Costos.
    expect(canJumpToStep(STEP.SUMMARY, STEP.PRODUCTION, true)).toBe(false);
    expect(canJumpToStep(STEP.MONTAJE, STEP.PRODUCTION, true)).toBe(false);
  });
});

describe('pasos 1 a 3', () => {
  it('exige tipo de trabajo', () => {
    const f = formValido();
    f.work_category = null;
    expect(validateStep(STEP.CATEGORY, f).ok).toBe(false);
  });

  it('exige cliente y cantidad', () => {
    const f = formValido();
    f.client_name = '   ';
    expect(validateStep(STEP.INFO, f).ok).toBe(false);

    const g = formValido();
    g.quantity = 0;
    expect(validateStep(STEP.INFO, g).ok).toBe(false);
  });

  it('exige medidas', () => {
    const f = formValido();
    f.width_cm = 0;
    expect(validateStep(STEP.SPECS, f).ok).toBe(false);
  });

  it('exige arte adjunto o la declaración explícita de que no lo hay', () => {
    const f = formValido();
    f.sin_arte = false;
    f.attachments = [];
    const r = validateStep(STEP.SPECS, f);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('sin arte');

    f.attachments = [new File(['x'], 'arte.pdf', { type: 'application/pdf' })];
    expect(validateStep(STEP.SPECS, f).ok).toBe(true);
  });

  it('Producción no inventa requisitos que el taller no tiene', () => {
    const f = formValido();
    f.production_detail = { ...f.production_detail, production_description: '' };
    expect(validateStep(STEP.PRODUCTION, f).ok).toBe(true);
  });
});

describe('montaje', () => {
  it('frena si la pieza no entra en la prensa', () => {
    const f = formValido();
    f.imposition = { ...f.imposition!, exceeds_press: true };
    const r = validateStep(STEP.MONTAJE, f);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no entra');
  });

  it('frena si todavía no hay imposición', () => {
    const f = formValido();
    f.imposition = null;
    expect(validateStep(STEP.MONTAJE, f).ok).toBe(false);
  });

  it('frena si la imposición dio cero poses', () => {
    const f = formValido();
    f.imposition = { ...f.imposition!, poses_per_sheet: 0 };
    expect(validateStep(STEP.MONTAJE, f).ok).toBe(false);
  });
});

describe('costos', () => {
  it('frena sin operaciones', () => {
    const f = formValido();
    f.operations = [];
    expect(validateStep(STEP.OPERATIONS, f).ok).toBe(false);
  });

  it('frena con precio total en cero', () => {
    const f = formValido();
    f.pricing = { ...f.pricing, total_price: 0 };
    const r = validateStep(STEP.OPERATIONS, f);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('cero');
  });
});

describe('el camino feliz sigue funcionando', () => {
  it('un formulario completo pasa todos los pasos', () => {
    const f = formValido();
    for (const s of Object.values(STEP)) {
      expect(validateStep(s, f).ok, `paso ${s} rechazó un formulario válido`).toBe(true);
    }
    expect(validateAllSteps(f).ok).toBe(true);
  });

  it('todo rechazo trae un motivo en español, nunca null', () => {
    const roto = { ...structuredClone(EMPTY_UNIFIED_FORM) } as UnifiedOTForm;
    for (const s of Object.values(STEP)) {
      const r = validateStep(s, roto);
      if (!r.ok) {
        expect(r.reason, `paso ${s} rechaza sin explicar`).toBeTruthy();
        expect(r.reason!.length).toBeGreaterThan(10);
      }
    }
  });
});
