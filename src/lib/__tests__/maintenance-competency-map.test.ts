import { describe, it, expect } from 'vitest';
import {
  SYSTEM_TO_SKILL,
  skillForSystem,
  systemRequiresCertification,
  checkAssignee,
  MIN_LEVEL_TO_INTERVENE,
} from '../maintenance-competency-map';

/** Los sistemas sembrados por las migraciones de julio y agosto. */
const SISTEMAS = [
  'motriz', 'hidraulico', 'neumatico', 'electrico', 'control', 'lubricacion',
  'refrigeracion', 'entintado', 'mojado', 'mantillas', 'transporte', 'corte',
  'troquelado', 'rodadura', 'seguridad', 'plegado', 'arrastre', 'alzado',
  'corchete', 'encolado', 'fresado', 'mordazas', 'termico', 'bobina',
];

describe('todo sistema tiene una competencia que lo cubre', () => {
  it('ninguno queda sin mapear', () => {
    for (const s of SISTEMAS) {
      expect(skillForSystem(s), `${s} sin competencia`).toBeTruthy();
    }
  });

  it('un sistema desconocido cae en mecánica, no en null', () => {
    // Si mañana alguien agrega un sistema nuevo, la orden se puede asignar
    // igual — con la competencia más general — en vez de quedar sin verificar.
    expect(skillForSystem('sistema_que_no_existe')).toBe('MANT_MECANICO');
  });

  it('sin sistema no exige nada', () => {
    expect(skillForSystem(null)).toBeNull();
    expect(skillForSystem(undefined)).toBeNull();
  });

  it('el mapa sólo apunta a competencias de mantenimiento', () => {
    for (const code of Object.values(SYSTEM_TO_SKILL)) {
      expect(code).toMatch(/^MANT_/);
    }
  });

  it('lo eléctrico y lo hidráulico exigen certificación; lo mecánico no', () => {
    expect(systemRequiresCertification('hidraulico')).toBe(true);
    expect(systemRequiresCertification('electrico')).toBe(true);
    expect(systemRequiresCertification('seguridad')).toBe(true);
    expect(systemRequiresCertification('motriz')).toBe(false);
    expect(systemRequiresCertification('entintado')).toBe(false);
  });
});

describe('checkAssignee — avisa fuerte, no bloquea solo', () => {
  const base = {
    assigneeName: 'Miguel Fernández',
    systemName: 'Sistema hidráulico',
    certificationExpired: false,
  };

  it('deja pasar a quien está habilitado y certificado', () => {
    const r = checkAssignee({ ...base, systemCode: 'hidraulico', level: 4, certified: true });
    expect(r.ok).toBe(true);
    expect(r.requiresAcknowledgement).toBe(false);
  });

  it('pide confirmación si no tiene competencia registrada en el sistema', () => {
    const r = checkAssignee({ ...base, systemCode: 'hidraulico', level: null, certified: false });
    expect(r.ok).toBe(false);
    expect(r.requiresAcknowledgement).toBe(true);
    expect(r.reason).toContain('no tiene competencia registrada');
    // Sugiere registrarla: puede que sepa y nadie lo haya anotado.
    expect(r.reason).toContain('registrarle la competencia');
  });

  it('por debajo de Autónomo puede trabajar acompañado, no solo', () => {
    const r = checkAssignee({ ...base, systemCode: 'motriz', level: MIN_LEVEL_TO_INTERVENE - 1, certified: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('acompañado');
  });

  it('un sistema mecánico no exige certificación', () => {
    const r = checkAssignee({ ...base, systemCode: 'motriz', level: 3, certified: false });
    expect(r.ok).toBe(true);
  });

  it('un sistema eléctrico sí la exige', () => {
    const r = checkAssignee({ ...base, systemCode: 'electrico', level: 4, certified: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('certificación vigente');
  });

  it('distingue certificación vencida de no tenerla', () => {
    const r = checkAssignee({
      ...base, systemCode: 'hidraulico', level: 4, certified: true, certificationExpired: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('vencida');
    expect(r.reason).toContain('Reevaluar');
  });

  it('sin sistema no opina', () => {
    const r = checkAssignee({ ...base, systemCode: null, level: null, certified: false });
    expect(r.ok).toBe(true);
    expect(r.requiredSkillCode).toBeNull();
  });

  it('todo rechazo nombra a la persona y al sistema', () => {
    for (const sistema of ['hidraulico', 'electrico', 'motriz']) {
      const r = checkAssignee({ ...base, systemCode: sistema, level: 1, certified: false });
      if (!r.ok) {
        expect(r.reason).toContain('Miguel Fernández');
        expect(r.reason!.length).toBeGreaterThan(20);
      }
    }
  });
});
