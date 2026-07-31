import { describe, it, expect } from 'vitest';
import { COMPETENCY_TEMPLATES, competencyTemplateFor } from '../machine-competency-templates';
import { MACHINE_TYPE_VALUES } from '@/types/machine-type';

/**
 * El error que estos tests impiden repetir: usar UNA competencia para VARIAS
 * máquinas distintas. Con `BINDING_ASSEMBLY` compartida entre dobladora,
 * alzadora, corchetera y hotmelera, el motor de cobertura afirmaba que quien
 * está habilitado en una puede correr las otras tres.
 */

/** Máquinas que un operario habilita de a una, no de a familia. */
const TERMINACION = ['folder', 'collator', 'stitcher', 'perfect_binder', 'laminator'] as const;

describe('cada máquina exige su propia competencia', () => {
  it('dos máquinas de terminación no comparten la misma competencia crítica', () => {
    const criticaPorMaquina = new Map<string, string[]>();
    for (const t of TERMINACION) {
      criticaPorMaquina.set(
        t,
        competencyTemplateFor(t)
          .filter((c) => c.is_critical)
          // Seguridad y fundamentos SÍ se comparten: son la base de todas.
          .filter((c) => !['SAFETY_AWARENESS', 'MACHINERY_BASICS', 'FINISHING_QUALITY'].includes(c.skill_code))
          .map((c) => c.skill_code)
      );
    }

    const vistas = new Map<string, string>();
    for (const [maquina, codigos] of criticaPorMaquina) {
      for (const code of codigos) {
        const previa = vistas.get(code);
        expect(
          previa,
          `"${code}" es crítica en ${previa} y en ${maquina}: habilitar en una afirmaría habilitación en la otra`
        ).toBeUndefined();
        vistas.set(code, maquina);
      }
    }
  });

  it('la familia BINDING_ASSEMBLY ya no se usa como habilitación de máquina', () => {
    // Sigue existiendo en el catálogo como paraguas, pero no habilita nada.
    for (const t of MACHINE_TYPE_VALUES) {
      const usa = competencyTemplateFor(t).some((c) => c.skill_code === 'BINDING_ASSEMBLY');
      expect(usa, `${t} todavía exige la competencia paraguas`).toBe(false);
    }
  });

  it('cada máquina de terminación exige la competencia de su oficio', () => {
    const esperado: Record<string, string> = {
      folder: 'PLEGADO',
      collator: 'ALZADO',
      stitcher: 'CORCHETEADO',
      perfect_binder: 'HOTMELT',
      laminator: 'LAMINATION',
    };
    for (const [maquina, code] of Object.entries(esperado)) {
      const t = competencyTemplateFor(maquina);
      const req = t.find((c) => c.skill_code === code);
      expect(req, `${maquina} no exige ${code}`).toBeDefined();
      expect(req!.is_critical, `${code} debería ser crítica en ${maquina}`).toBe(true);
    }
  });
});

describe('coherencia de la plantilla', () => {
  it('toda máquina exige seguridad, y es crítica', () => {
    for (const t of MACHINE_TYPE_VALUES) {
      const seg = competencyTemplateFor(t).find((c) => c.skill_code === 'SAFETY_AWARENESS');
      expect(seg, `${t} no exige seguridad`).toBeDefined();
      expect(seg!.is_critical).toBe(true);
    }
  });

  it('los niveles están dentro de la escalera 1–5', () => {
    for (const items of Object.values(COMPETENCY_TEMPLATES)) {
      for (const c of items ?? []) {
        expect(c.min_proficiency).toBeGreaterThanOrEqual(1);
        expect(c.min_proficiency).toBeLessThanOrEqual(5);
      }
    }
  });

  it('no repite la misma competencia dos veces en una máquina', () => {
    for (const [t, items] of Object.entries(COMPETENCY_TEMPLATES)) {
      const codes = (items ?? []).map((c) => c.skill_code);
      expect(new Set(codes).size, `${t} repite una competencia`).toBe(codes.length);
    }
  });

  it('lo que exige certificación también exige horas acompañado', () => {
    // Certificar sin haber trabajado acompañado es firmar un papel.
    for (const [t, items] of Object.entries(COMPETENCY_TEMPLATES)) {
      for (const c of items ?? []) {
        if (c.requires_certification) {
          expect(
            c.supervised_hours_required,
            `${t} → ${c.skill_code} exige certificación pero no horas acompañado`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('la hotmelera y la guillotina exigen certificación: queman y cortan', () => {
    for (const [maquina, code] of [['perfect_binder', 'HOTMELT'], ['guillotine', 'GUILLOTINE_BASIC']] as const) {
      const c = competencyTemplateFor(maquina).find((x) => x.skill_code === code);
      expect(c?.requires_certification, `${maquina} debería exigir certificación`).toBe(true);
    }
  });
});
