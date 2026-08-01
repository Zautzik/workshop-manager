import { describe, it, expect } from 'vitest';
import { computeAccrual, ACCRUING_TREE_TYPES, type MachineSkillLink, type ProficiencyLevel } from '../skill-accrual';

const OFFSET = 'maq-offset';
const GUILLOTINA = 'maq-guillotina';

const SKILLS: MachineSkillLink[] = [
  { machine_id: OFFSET, skill_id: 'offset', skill_tree_type: 'technical', skill_name: 'Offset — operación básica' },
  { machine_id: OFFSET, skill_id: 'registro', skill_tree_type: 'technical', skill_name: 'Preprensa y planchas' },
  // Foundational: NO acumula por estar en la máquina.
  { machine_id: OFFSET, skill_id: 'seguridad', skill_tree_type: 'foundational', skill_name: 'Seguridad en planta' },
  { machine_id: GUILLOTINA, skill_id: 'guillotina', skill_tree_type: 'technical', skill_name: 'Guillotina — básica' },
];

/** Escalera del taller: 0 / 40 / 80 / 160 / 320 h. */
const escalera = (skill_id: string): ProficiencyLevel[] => [
  { skill_id, level: 1, min_hours_required: 0 },
  { skill_id, level: 2, min_hours_required: 40 },
  { skill_id, level: 3, min_hours_required: 80 },
  { skill_id, level: 4, min_hours_required: 160 },
  { skill_id, level: 5, min_hours_required: 320 },
];
const LEVELS = ['offset', 'registro', 'seguridad', 'guillotina'].flatMap(escalera);

const dias = (n: number, machine: string, employee = 'ana') =>
  Array.from({ length: n }, (_, i) => ({
    employee_id: employee, machine_id: machine, hours: 8,
    date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));

describe('las horas reales salen de los partes de trabajo', () => {
  it('suma las horas de una persona en una máquina', () => {
    const r = computeAccrual({
      assignments: dias(10, OFFSET),           // 80 h
      machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    const offset = r.find((x) => x.skill_id === 'offset')!;
    expect(offset.observedHours).toBe(80);
  });

  it('las horas cuentan para CADA competencia técnica de esa máquina', () => {
    const r = computeAccrual({
      assignments: dias(10, OFFSET), machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    expect(r.find((x) => x.skill_id === 'offset')!.observedHours).toBe(80);
    expect(r.find((x) => x.skill_id === 'registro')!.observedHours).toBe(80);
  });

  it('lo foundational NO acumula por estar parado en la máquina', () => {
    // Nadie aprende seguridad por horas frente a una prensa: se enseña aparte.
    const r = computeAccrual({
      assignments: dias(40, OFFSET), machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    expect(r.find((x) => x.skill_id === 'seguridad')).toBeUndefined();
    expect(ACCRUING_TREE_TYPES.has('foundational')).toBe(false);
  });

  it('separa por máquina: horas en la guillotina no suben el offset', () => {
    const r = computeAccrual({
      assignments: [...dias(5, OFFSET), ...dias(20, GUILLOTINA)],
      machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    expect(r.find((x) => x.skill_id === 'offset')!.observedHours).toBe(40);
    expect(r.find((x) => x.skill_id === 'guillotina')!.observedHours).toBe(160);
  });

  it('guarda desde cuándo y hasta cuándo trabajó', () => {
    const r = computeAccrual({
      assignments: dias(10, OFFSET), machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    const o = r.find((x) => x.skill_id === 'offset')!;
    expect(o.firstWorked).toBe('2026-01-01');
    expect(o.lastWorked).toBe('2026-01-10');
  });
});

describe('propone, no promueve', () => {
  it('sugiere el nivel cuyo umbral de horas ya se cumplió', () => {
    const r = computeAccrual({
      assignments: dias(20, OFFSET),          // 160 h → nivel 4
      machineSkills: SKILLS, levels: LEVELS,
      existing: [{ employee_id: 'ana', skill_id: 'offset', proficiency_level: 2, hours_practiced: 10, certified: false }],
    });
    const o = r.find((x) => x.skill_id === 'offset')!;
    expect(o.suggestedLevel).toBe(4);
    expect(o.currentLevel).toBe(2);
    expect(o.hasProposal).toBe(true);
    expect(o.reason).toContain('Falta que alguien lo evalúe');
  });

  it('nunca propone bajar de nivel', () => {
    // Un evaluador lo puso en 5 sabiendo algo que las horas no cuentan.
    const r = computeAccrual({
      assignments: dias(2, OFFSET),           // 16 h → daría nivel 1
      machineSkills: SKILLS, levels: LEVELS,
      existing: [{ employee_id: 'ana', skill_id: 'offset', proficiency_level: 5, hours_practiced: 900, certified: true }],
    });
    const o = r.find((x) => x.skill_id === 'offset')!;
    expect(o.suggestedLevel).toBe(5);
  });

  it('descubre a quien trabaja una máquina sin tener el registro creado', () => {
    // El caso que importa: alguien lleva meses en la guillotina y en la ficha
    // no figura. La app lo nota; el evaluador lo confirma.
    const r = computeAccrual({
      assignments: dias(30, GUILLOTINA, 'pedro'),
      machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    const g = r.find((x) => x.skill_id === 'guillotina')!;
    expect(g.isNew).toBe(true);
    expect(g.currentLevel).toBe(0);
    expect(g.reason).toContain('no tiene el registro creado');
  });

  it('avisa cuando las horas registradas no coinciden con las reales', () => {
    const r = computeAccrual({
      assignments: dias(10, OFFSET),          // 80 reales
      machineSkills: SKILLS, levels: LEVELS,
      existing: [{ employee_id: 'ana', skill_id: 'offset', proficiency_level: 3, hours_practiced: 12, certified: true }],
    });
    const o = r.find((x) => x.skill_id === 'offset')!;
    expect(o.observedHours).toBe(80);
    expect(o.recordedHours).toBe(12);
    expect(o.hasProposal).toBe(true);
  });

  it('sin nada que proponer, no molesta', () => {
    const r = computeAccrual({
      assignments: dias(10, OFFSET),          // 80 h
      machineSkills: SKILLS, levels: LEVELS,
      existing: [{ employee_id: 'ana', skill_id: 'offset', proficiency_level: 3, hours_practiced: 80, certified: true }],
    });
    expect(r.find((x) => x.skill_id === 'offset')!.hasProposal).toBe(false);
  });
});

describe('robustez sobre datos reales', () => {
  it('ignora partes sin persona, sin horas o de máquinas sin competencias', () => {
    const r = computeAccrual({
      assignments: [
        { employee_id: '', machine_id: OFFSET, hours: 8, date: '2026-01-01' },
        { employee_id: 'ana', machine_id: OFFSET, hours: 0, date: '2026-01-02' },
        { employee_id: 'ana', machine_id: 'maquina-sin-competencias', hours: 8, date: '2026-01-03' },
      ],
      machineSkills: SKILLS, levels: LEVELS, existing: [],
    });
    expect(r).toHaveLength(0);
  });

  it('el resultado es el mismo si se corre dos veces: total, no incremento', () => {
    // Idempotencia: hours_practiced se FIJA al total observado, nunca se suma,
    // así que reprocesar no infla las horas de nadie.
    const args = { assignments: dias(10, OFFSET), machineSkills: SKILLS, levels: LEVELS, existing: [] };
    const a = computeAccrual(args);
    const b = computeAccrual(args);
    expect(a.map((x) => x.observedHours)).toEqual(b.map((x) => x.observedHours));
  });

  it('ordena primero lo que hay que revisar', () => {
    const r = computeAccrual({
      assignments: [...dias(30, GUILLOTINA, 'pedro'), ...dias(10, OFFSET, 'ana')],
      machineSkills: SKILLS, levels: LEVELS,
      existing: [
        { employee_id: 'ana', skill_id: 'offset', proficiency_level: 3, hours_practiced: 80, certified: true },
        { employee_id: 'ana', skill_id: 'registro', proficiency_level: 3, hours_practiced: 80, certified: true },
      ],
    });
    expect(r[0].isNew).toBe(true);           // pedro, sin registro
    expect(r.at(-1)!.hasProposal).toBe(false); // ana, al día
  });
});
