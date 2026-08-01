/**
 * La matriz de competencias se mantiene sola.
 *
 * `employee_skills.hours_practiced` es un campo que alguien tiene que tipear, y
 * por eso está casi vacío: 30 registros para 20 personas, uno por cabeza. Una
 * matriz de competencias que hay que mantener a mano no se mantiene.
 *
 * Pero el taller YA registra la verdad: `worker_assignments` dice qué persona
 * estuvo en qué puesto, qué día, cuántas horas — y cada puesto tiene su
 * máquina. O sea que las horas de práctica de cada quien existen desde hace
 * meses y nadie las miró. Es el mismo patrón que la cobertura de tinta, el
 * `ot_anterior` y el contador: el dato llega, se guarda, no se consulta.
 *
 * LO QUE ESTE MÓDULO HACE Y LO QUE NO HACE
 * ----------------------------------------
 * Hace: sumar horas reales por persona y competencia, y AVISAR cuando alguien
 * cruzó el umbral de horas del siguiente nivel.
 *
 * No hace: subir a nadie de nivel. Trescientas horas en la guillotina no
 * prueban que alguien corte bien — prueban que estuvo ahí. Quién sabe hacer el
 * trabajo lo decide una persona mirando el trabajo, y eso no se automatiza.
 * La app aporta lo que la app puede saber: cuántas horas, sobre qué máquina,
 * desde cuándo.
 *
 * Puro y testeable, como el resto de la lógica de negocio.
 */

export interface AssignmentHours {
  employee_id: string;
  machine_id: string;
  hours: number;
  date: string;
}

export interface MachineSkillLink {
  machine_id: string;
  skill_id: string;
  /** Sólo lo técnico acumula por estar en la máquina. */
  skill_tree_type: string;
  skill_name?: string | null;
}

export interface ProficiencyLevel {
  skill_id: string;
  level: number;
  min_hours_required: number | null;
}

export interface ExistingSkill {
  employee_id: string;
  skill_id: string;
  proficiency_level: number;
  hours_practiced?: number | null;
  certified: boolean;
}

export interface AccrualRow {
  employee_id: string;
  skill_id: string;
  skill_name: string | null;
  /** Horas reales sumadas desde los partes de trabajo. */
  observedHours: number;
  /** Lo que hoy dice la ficha. */
  recordedHours: number;
  /** Nivel actual declarado. 0 = no tiene el registro. */
  currentLevel: number;
  /** Nivel que las horas habilitarían a evaluar. */
  suggestedLevel: number;
  /** Hay algo que proponerle al evaluador. */
  hasProposal: boolean;
  /** Nunca tuvo registro de esta competencia y sin embargo trabajó en ella. */
  isNew: boolean;
  firstWorked: string;
  lastWorked: string;
  reason: string;
}

/**
 * Sólo lo técnico se aprende estando en la máquina. Nadie sube en "Seguridad en
 * planta" ni en "Liderazgo de equipo" por acumular horas frente a una prensa:
 * eso se enseña y se evalúa aparte.
 */
export const ACCRUING_TREE_TYPES = new Set(['technical']);

export function computeAccrual(params: {
  assignments: AssignmentHours[];
  machineSkills: MachineSkillLink[];
  levels: ProficiencyLevel[];
  existing: ExistingSkill[];
}): AccrualRow[] {
  const { assignments, machineSkills, levels, existing } = params;

  // máquina → competencias técnicas que exige
  const skillsByMachine = new Map<string, MachineSkillLink[]>();
  for (const ms of machineSkills) {
    if (!ACCRUING_TREE_TYPES.has(ms.skill_tree_type)) continue;
    skillsByMachine.set(ms.machine_id, [...(skillsByMachine.get(ms.machine_id) ?? []), ms]);
  }

  // (persona, competencia) → horas y fechas
  interface Acc { hours: number; first: string; last: string; name: string | null }
  const acc = new Map<string, Acc>();

  for (const a of assignments) {
    if (!a.employee_id || !a.machine_id || !(a.hours > 0)) continue;
    const skills = skillsByMachine.get(a.machine_id);
    if (!skills?.length) continue;

    for (const s of skills) {
      const key = `${a.employee_id}|${s.skill_id}`;
      const prev = acc.get(key);
      acc.set(key, {
        // Las horas en la máquina cuentan para CADA competencia técnica que
        // exige: estar en la offset es practicar el offset y el registro a la vez.
        hours: (prev?.hours ?? 0) + a.hours,
        first: prev && prev.first < a.date ? prev.first : a.date,
        last: prev && prev.last > a.date ? prev.last : a.date,
        name: s.skill_name ?? prev?.name ?? null,
      });
    }
  }

  // competencia → escalera de horas, ordenada
  const levelsBySkill = new Map<string, ProficiencyLevel[]>();
  for (const l of levels) {
    levelsBySkill.set(l.skill_id, [...(levelsBySkill.get(l.skill_id) ?? []), l]);
  }
  for (const list of levelsBySkill.values()) list.sort((a, b) => a.level - b.level);

  const existingByKey = new Map(existing.map((e) => [`${e.employee_id}|${e.skill_id}`, e]));

  const rows: AccrualRow[] = [];

  for (const [key, a] of acc) {
    const [employee_id, skill_id] = key.split('|');
    const prev = existingByKey.get(key);
    const currentLevel = prev?.proficiency_level ?? 0;
    const recordedHours = Number(prev?.hours_practiced ?? 0);

    // Nivel más alto cuyo umbral de horas ya se cumplió.
    const escalera = levelsBySkill.get(skill_id) ?? [];
    let suggestedLevel = 0;
    for (const l of escalera) {
      if ((l.min_hours_required ?? 0) <= a.hours) suggestedLevel = l.level;
    }

    // Nunca se propone bajar: las horas sólo suman. Si alguien está en nivel 4
    // con pocas horas registradas, es porque un evaluador lo puso ahí y sabía
    // algo que las horas no cuentan.
    const propuesto = Math.max(suggestedLevel, currentLevel);
    const isNew = !prev;
    const hasProposal = propuesto > currentLevel || Math.abs(a.hours - recordedHours) >= 1;

    const nombre = a.name ?? 'esta competencia';
    let reason: string;
    if (isNew) {
      reason = `Trabajó ${fmt(a.hours)} h en máquinas que exigen ${nombre} y no tiene el registro creado. Conviene evaluarlo y dejarlo asentado.`;
    } else if (propuesto > currentLevel) {
      reason = `Acumula ${fmt(a.hours)} h reales: alcanza las horas del nivel ${propuesto} (hoy está en ${currentLevel}). Falta que alguien lo evalúe.`;
    } else {
      reason = `Las horas registradas (${fmt(recordedHours)}) no coinciden con las reales (${fmt(a.hours)}).`;
    }

    rows.push({
      employee_id, skill_id,
      skill_name: a.name,
      observedHours: round1(a.hours),
      recordedHours: round1(recordedHours),
      currentLevel,
      suggestedLevel: propuesto,
      hasProposal,
      isNew,
      firstWorked: a.first,
      lastWorked: a.last,
      reason,
    });
  }

  // Primero lo que tiene algo que proponer, y dentro de eso las más horas.
  rows.sort((x, y) => {
    if (x.hasProposal !== y.hasProposal) return x.hasProposal ? -1 : 1;
    if (x.isNew !== y.isNew) return x.isNew ? -1 : 1;
    return y.observedHours - x.observedHours;
  });

  return rows;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
}
