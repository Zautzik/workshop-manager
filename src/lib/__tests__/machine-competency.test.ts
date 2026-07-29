import { describe, it, expect } from 'vitest';
import {
  evaluateOperator,
  machineCoverage,
  NO_REQUIREMENTS_REASON,
  type SkillRequirement,
  type HeldSkill,
} from '../machine-competency';

const HOY = new Date('2026-07-28T12:00:00Z');

/** Hotmelera: la olla de cola quema y el lomo mal fresado arruina el tiraje. */
const HOTMELERA: SkillRequirement[] = [
  { skill_id: 'binding', skill_name: 'Encuadernación', min_proficiency: 3, is_critical: true, requires_certification: true, supervised_hours_required: 40 },
  { skill_id: 'safety',  skill_name: 'Seguridad',      min_proficiency: 2, is_critical: true },
  { skill_id: 'quality', skill_name: 'Control calidad', min_proficiency: 2, is_critical: false },
];

describe('una máquina sin requisitos no es una máquina abierta a cualquiera', () => {
  it('no declara habilitado a nadie cuando no hay competencias definidas', () => {
    const r = evaluateOperator([], [{ skill_id: 'x', proficiency_level: 5, certified: true }]);
    expect(r.canOperateAlone).toBe(false);
    expect(r.status).toBe('no_habilitado');
    expect(r.reason).toBe(NO_REQUIREMENTS_REASON);
  });

  it('la cobertura lo reporta como sin_datos, no como riesgo cero', () => {
    const c = machineCoverage([], [{ employeeId: 'a', skills: [] }]);
    expect(c.risk).toBe('sin_datos');
    expect(c.qualified).toBe(0);
  });
});

describe('evaluateOperator', () => {
  it('habilita a quien cumple nivel, certificación y horas', () => {
    const held: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 3, certified: true, hours_practiced: 60 },
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ];
    const r = evaluateOperator(HOTMELERA, held, { today: HOY });
    expect(r.status).toBe('habilitado');
    expect(r.canOperateAlone).toBe(true);
    expect(r.readiness).toBe(100);
    expect(r.gaps).toHaveLength(0);
  });

  it('tener el nivel pero no las horas acompañado no habilita a operar solo', () => {
    const held: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 3, certified: true, hours_practiced: 12 }, // faltan 28
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ];
    const r = evaluateOperator(HOTMELERA, held, { today: HOY });
    expect(r.canOperateAlone).toBe(false);
    expect(r.gaps[0].missingSupervisedHours).toBe(28);
  });

  it('el que sabe pero no está certificado queda "con supervisión", no fuera', () => {
    const held: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 3, certified: false, hours_practiced: 60 },
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ];
    const r = evaluateOperator(HOTMELERA, held, { today: HOY });
    expect(r.status).toBe('con_supervision');
    expect(r.canOperateSupervised).toBe(true);
    expect(r.canOperateAlone).toBe(false);
    expect(r.gaps[0].needsCertification).toBe(true);
  });

  it('una certificación vencida se distingue de no tenerla nunca', () => {
    const held: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 3, certified: true, hours_practiced: 60, certification_expires_on: '2026-01-01' },
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ];
    const r = evaluateOperator(HOTMELERA, held, { today: HOY });
    expect(r.status).toBe('certificacion_vencida');
    expect(r.canOperateAlone).toBe(false);
  });

  it('deja fuera a quien no llega al nivel en una competencia crítica', () => {
    const held: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 0, certified: false },
      { skill_id: 'safety',  proficiency_level: 0, certified: false },
    ];
    const r = evaluateOperator(HOTMELERA, held, { today: HOY });
    expect(r.status).toBe('no_habilitado');
    expect(r.canOperateSupervised).toBe(false);
    expect(r.reason).toContain('Encuadernación');
  });

  it('lo crítico pesa más que lo deseable en el readiness', () => {
    const soloCritico = evaluateOperator(HOTMELERA, [
      { skill_id: 'binding', proficiency_level: 3, certified: true, hours_practiced: 60 },
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
    ], { today: HOY });
    const soloDeseable = evaluateOperator(HOTMELERA, [
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ], { today: HOY });
    expect(soloCritico.readiness).toBeGreaterThan(soloDeseable.readiness);
  });

  it('el próximo paso es el hueco crítico más cerca de cerrarse', () => {
    const r = evaluateOperator(HOTMELERA, [
      { skill_id: 'binding', proficiency_level: 1, certified: false },
      { skill_id: 'safety',  proficiency_level: 1, certified: false },
    ], { today: HOY });
    // safety pide 2 y tiene 1 (gap 1); binding pide 3 y tiene 1 (gap 2).
    expect(r.nextStep?.skill_id).toBe('safety');
    expect(r.nextStep?.is_critical).toBe(true);
  });
});

describe('machineCoverage — el factor bus, medible', () => {
  const experto: HeldSkill[] = [
    { skill_id: 'binding', proficiency_level: 4, certified: true, hours_practiced: 200 },
    { skill_id: 'safety',  proficiency_level: 3, certified: true },
    { skill_id: 'quality', proficiency_level: 3, certified: true },
  ];
  const aprendiz: HeldSkill[] = [
    { skill_id: 'binding', proficiency_level: 2, certified: false, hours_practiced: 10 },
    { skill_id: 'safety',  proficiency_level: 2, certified: false },
  ];
  const ajeno: HeldSkill[] = [{ skill_id: 'otra', proficiency_level: 5, certified: true }];

  it('un solo habilitado es riesgo crítico aunque sea muy bueno', () => {
    const c = machineCoverage(HOTMELERA, [
      { employeeId: 'experto', skills: experto },
      { employeeId: 'aprendiz', skills: aprendiz },
      { employeeId: 'ajeno', skills: ajeno },
    ], 2, { today: HOY });

    expect(c.qualified).toBe(1);
    expect(c.risk).toBe('critico');
    expect(c.reason).toContain('Si falta, la máquina se detiene');
    expect(c.shortfall).toBe(1);
  });

  it('cuenta aparte a los que pueden trabajar acompañados', () => {
    const c = machineCoverage(HOTMELERA, [
      { employeeId: 'experto', skills: experto },
      { employeeId: 'aprendiz', skills: aprendiz },
    ], 2, { today: HOY });
    expect(c.supervisedOnly).toBe(1);
  });

  it('nadie habilitado también es crítico', () => {
    const c = machineCoverage(HOTMELERA, [{ employeeId: 'ajeno', skills: ajeno }], 2, { today: HOY });
    expect(c.qualified).toBe(0);
    expect(c.risk).toBe('critico');
    expect(c.reason).toContain('Nadie está habilitado');
  });

  it('respeta el umbral que el taller definió para esa máquina', () => {
    const roster = [
      { employeeId: 'a', skills: experto },
      { employeeId: 'b', skills: experto },
    ];
    expect(machineCoverage(HOTMELERA, roster, 2, { today: HOY }).risk).toBe('ok');
    expect(machineCoverage(HOTMELERA, roster, 4, { today: HOY }).risk).toBe('ajustado');
  });

  it('propone a quién conviene formar, por cercanía', () => {
    const casi: HeldSkill[] = [
      { skill_id: 'binding', proficiency_level: 3, certified: false, hours_practiced: 60 },
      { skill_id: 'safety',  proficiency_level: 3, certified: false },
      { skill_id: 'quality', proficiency_level: 2, certified: false },
    ];
    const c = machineCoverage(HOTMELERA, [
      { employeeId: 'experto', skills: experto },
      { employeeId: 'lejos', skills: ajeno },
      { employeeId: 'casi', skills: casi },
    ], 3, { today: HOY });

    expect(c.closestCandidates[0].employeeId).toBe('casi');
    expect(c.closestCandidates[0].readiness).toBeGreaterThan(c.closestCandidates[1].readiness);
    expect(c.closestCandidates[0].nextStep).not.toBeNull();
  });
});
