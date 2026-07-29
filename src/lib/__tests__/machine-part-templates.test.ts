import { describe, it, expect } from 'vitest';
import { PART_TEMPLATES, partTemplateFor, hasTemplate } from '../machine-part-templates';
import { MACHINE_TYPE_VALUES } from '@/types/machine-type';

/**
 * Las plantillas alimentan un formulario que después proyecta fechas de compra.
 * Si una referencia a un sistema está mal escrita, la pieza se descarta en
 * silencio y el mecánico nunca sabe que faltó. Estos tests fijan lo que la
 * plantilla PUEDE y lo que NO puede traer.
 */

// Códigos sembrados por las migraciones 20260728120000 y 20260728150000.
const SISTEMAS_VALIDOS = new Set([
  'motriz', 'hidraulico', 'neumatico', 'electrico', 'control', 'lubricacion',
  'refrigeracion', 'entintado', 'mojado', 'mantillas', 'transporte', 'corte',
  'troquelado', 'rodadura', 'seguridad', 'plegado', 'arrastre', 'alzado',
  'corchete', 'encolado', 'fresado', 'mordazas', 'termico', 'bobina',
]);

describe('integridad de las plantillas', () => {
  it('toda pieza apunta a un sistema que existe en el catálogo', () => {
    for (const [tipo, items] of Object.entries(PART_TEMPLATES)) {
      for (const it of items ?? []) {
        expect(SISTEMAS_VALIDOS.has(it.system), `${tipo} → "${it.name}" usa el sistema inexistente "${it.system}"`).toBe(true);
      }
    }
  });

  it('no repite el mismo nombre de pieza dentro de una máquina', () => {
    for (const [tipo, items] of Object.entries(PART_TEMPLATES)) {
      const nombres = (items ?? []).map((i) => i.name.toLowerCase());
      expect(new Set(nombres).size, `${tipo} tiene piezas duplicadas`).toBe(nombres.length);
    }
  });

  it('las cinco máquinas de terminación tienen plantilla propia', () => {
    for (const t of ['folder', 'collator', 'stitcher', 'perfect_binder', 'laminator'] as const) {
      expect(hasTemplate(t), `falta plantilla para ${t}`).toBe(true);
      expect(partTemplateFor(t).length).toBeGreaterThan(5);
    }
  });

  it('un tipo sin plantilla cae en las piezas comunes, no en vacío', () => {
    const r = partTemplateFor('pre_press');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => SISTEMAS_VALIDOS.has(i.system))).toBe(true);
  });

  it('acepta cualquier tipo del enum sin romperse', () => {
    for (const t of MACHINE_TYPE_VALUES) {
      expect(() => partTemplateFor(t)).not.toThrow();
      expect(partTemplateFor(t).length).toBeGreaterThan(0);
    }
  });
});

describe('la plantilla no inventa lo que no puede saber', () => {
  it('ninguna pieza trae número de parte, proveedor, plazo ni vida útil', () => {
    // Esos cuatro dependen del modelo exacto y del proveedor del taller.
    // Traerlos de fábrica haría que la app proyecte fechas de compra sobre
    // datos que nadie verificó — peor que no proyectar.
    for (const items of Object.values(PART_TEMPLATES)) {
      for (const it of items ?? []) {
        const claves = Object.keys(it);
        expect(claves).not.toContain('part_number');
        expect(claves).not.toContain('preferred_supplier');
        expect(claves).not.toContain('lead_time_days');
        expect(claves).not.toContain('expected_life_usage');
      }
    }
  });

  it('sí trae criticidad, que sí depende de la clase de máquina', () => {
    const hotmelera = partTemplateFor('perfect_binder');
    const olla = hotmelera.find((i) => i.name.includes('olla de cola'));
    expect(olla?.criticality).toBe('critica');
  });

  it('la parada de emergencia es crítica en toda máquina que la tenga', () => {
    for (const [tipo, items] of Object.entries(PART_TEMPLATES)) {
      const parada = (items ?? []).find((i) => i.system === 'seguridad');
      if (parada) {
        expect(parada.criticality, `${tipo}: la parada de emergencia no es crítica`).toBe('critica');
      }
    }
  });
});

describe('coherencia con el oficio', () => {
  it('la offset lleva mantilla y rodillos de entintado y mojado', () => {
    const sistemas = partTemplateFor('offset_printer').map((i) => i.system);
    expect(sistemas).toContain('mantillas');
    expect(sistemas).toContain('entintado');
    expect(sistemas).toContain('mojado');
  });

  it('la guillotina lleva cuchilla y listón, y no lleva entintado', () => {
    const g = partTemplateFor('guillotine');
    expect(g.some((i) => i.name.toLowerCase().includes('cuchilla'))).toBe(true);
    expect(g.some((i) => i.name.toLowerCase().includes('listón'))).toBe(true);
    expect(g.some((i) => i.system === 'entintado')).toBe(false);
  });

  it('la hotmelera lleva fresa de lomo y control de temperatura', () => {
    const h = partTemplateFor('perfect_binder');
    expect(h.some((i) => i.system === 'fresado')).toBe(true);
    expect(h.some((i) => i.system === 'termico')).toBe(true);
  });

  it('el vehículo no hereda piezas de imprenta', () => {
    const v = partTemplateFor('delivery');
    expect(v.some((i) => ['entintado', 'mojado', 'mantillas', 'neumatico'].includes(i.system))).toBe(false);
    expect(v.some((i) => i.system === 'rodadura')).toBe(true);
  });
});
