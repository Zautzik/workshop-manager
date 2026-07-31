/**
 * Quién puede correr esta máquina — y qué pasa si ese día no viene.
 *
 * El taller tiene máquinas que sólo un par de personas sabe operar de verdad.
 * Eso hoy no aparece en ninguna pantalla: se descubre cuando esa persona toma
 * vacaciones y la dobladora queda parada con trabajo encima. La app ya tenía
 * todas las piezas para saberlo y ninguna conectada:
 *
 *   · `skills` + `skill_proficiency_levels`  → la escalera de cada oficio
 *   · `skill_dependencies`                   → qué hay que saber antes
 *   · `employee_skills`                      → quién llegó hasta dónde
 *   · `machine_skill_requirements`           → qué exige la máquina … VACÍA
 *
 * La última estaba en cero, así que `can_operate` respondía que sí para todos,
 * para todas las máquinas. Este módulo hace la aritmética en los dos sentidos:
 * de la persona hacia la máquina (¿está habilitado?) y de la máquina hacia el
 * taller (¿de cuánta gente depende?).
 *
 * Puro — sin I/O — como el motor de costeo y la atribución de mano de obra.
 */

export interface SkillRequirement {
  skill_id: string;
  skill_name?: string | null;
  min_proficiency: number;
  is_critical: boolean;
  requires_certification?: boolean | null;
  supervised_hours_required?: number | null;
}

export interface HeldSkill {
  skill_id: string;
  proficiency_level: number;
  certified: boolean;
  hours_practiced?: number | null;
  certification_expires_on?: string | null;
  /** Última vez que alguien verificó este nivel. */
  last_assessed_on?: string | null;
}

/**
 * Una competencia sin uso se enfría.
 *
 * Quien corrió la hotmelera hace dos años y no volvió a tocarla NO está en el
 * mismo nivel que declaró entonces. Hasta ahora la app lo contaba como
 * habilitado, y eso produce cobertura fantasma: tres habilitados en el papel,
 * uno solo capaz de levantar la máquina el lunes.
 *
 * No se degrada el dato guardado —eso es del evaluador, no del sistema— sino
 * que se calcula un nivel EFECTIVO para responder "¿de cuánta gente dependo
 * hoy?". El historial queda intacto.
 */
export const DECAY_GRACE_MONTHS = 12;
export const DECAY_MONTHS_PER_LEVEL = 12;
/** Nunca se descuenta por debajo de esto: algo queda siempre. */
export const DECAY_FLOOR = 1;

export function effectiveLevel(
  held: Pick<HeldSkill, 'proficiency_level' | 'last_assessed_on'>,
  today: Date
): { level: number; monthsStale: number | null; decayed: boolean } {
  if (!held.last_assessed_on) {
    // Sin fecha no se castiga: no saber cuándo se evaluó no es lo mismo que
    // saber que fue hace mucho.
    return { level: held.proficiency_level, monthsStale: null, decayed: false };
  }

  const then = new Date(held.last_assessed_on);
  if (Number.isNaN(then.getTime())) {
    return { level: held.proficiency_level, monthsStale: null, decayed: false };
  }

  const monthsStale = Math.max(
    0,
    (today.getFullYear() - then.getFullYear()) * 12 + (today.getMonth() - then.getMonth())
  );

  if (monthsStale <= DECAY_GRACE_MONTHS) {
    return { level: held.proficiency_level, monthsStale, decayed: false };
  }

  const steps = Math.floor((monthsStale - DECAY_GRACE_MONTHS) / DECAY_MONTHS_PER_LEVEL) + 1;
  const level = Math.max(DECAY_FLOOR, held.proficiency_level - steps);
  return { level, monthsStale, decayed: level < held.proficiency_level };
}

export type OperatorStatus =
  /** Cumple todo: opera sin supervisión. */
  | 'habilitado'
  /** Sabe lo suficiente para trabajar acompañado, no solo. */
  | 'con_supervision'
  /** Le falta una competencia crítica. */
  | 'no_habilitado'
  /** La certificación venció: sabía, pero el papel caducó. */
  | 'certificacion_vencida';

export interface SkillGap {
  skill_id: string;
  skill_name: string | null;
  required: number;
  current: number;
  gap: number;
  is_critical: boolean;
  /** Tiene el nivel pero le falta la certificación firmada. */
  needsCertification: boolean;
  missingSupervisedHours: number | null;
  /** Lo que dice la ficha, antes de enfriar por antigüedad. */
  declaredLevel: number;
  /** Meses desde la última evaluación, sólo si eso le bajó el nivel. */
  staleMonths: number | null;
}

export interface OperatorEvaluation {
  status: OperatorStatus;
  canOperateAlone: boolean;
  canOperateSupervised: boolean;
  /** 0–100. Cuánto del requisito cubre hoy, ponderando lo crítico. */
  readiness: number;
  gaps: SkillGap[];
  /** Lo próximo a trabajar: el hueco crítico más cercano a cerrarse. */
  nextStep: SkillGap | null;
  reason: string;
}

/**
 * Una máquina sin requisitos declarados NO es una máquina que cualquiera pueda
 * operar: es una máquina sobre la que no sabemos nada. La diferencia importa,
 * porque la primera lectura deja programar a un aprendiz en la hotmelera.
 */
export const NO_REQUIREMENTS_REASON =
  'Esta máquina no tiene competencias declaradas. Hasta definirlas, la app no puede afirmar quién está habilitado.';

export function evaluateOperator(
  requirements: SkillRequirement[],
  held: HeldSkill[],
  opts: { today?: Date } = {}
): OperatorEvaluation {
  const today = opts.today ?? new Date();
  const bySkill = new Map(held.map((h) => [h.skill_id, h]));

  if (requirements.length === 0) {
    return {
      status: 'no_habilitado',
      canOperateAlone: false,
      canOperateSupervised: false,
      readiness: 0,
      gaps: [],
      nextStep: null,
      reason: NO_REQUIREMENTS_REASON,
    };
  }

  const gaps: SkillGap[] = [];
  let expired = false;
  let criticalWeight = 0;
  let criticalMet = 0;
  let totalWeight = 0;
  let totalMet = 0;

  for (const req of requirements) {
    const h = bySkill.get(req.skill_id);
    // Nivel EFECTIVO: el declarado, enfriado por el tiempo sin verificar.
    const decay = h ? effectiveLevel(h, today) : null;
    const current = decay?.level ?? 0;
    const levelOk = current >= req.min_proficiency;

    const certOk = !req.requires_certification || (h?.certified ?? false);
    const certExpired =
      req.requires_certification &&
      h?.certified === true &&
      !!h.certification_expires_on &&
      new Date(h.certification_expires_on) < today;
    if (certExpired) expired = true;

    const hoursNeeded = req.supervised_hours_required ?? null;
    const hoursDone = h?.hours_practiced ?? 0;
    const missingSupervisedHours =
      hoursNeeded && hoursDone < hoursNeeded ? hoursNeeded - hoursDone : null;

    // Un requisito está cumplido cuando el nivel alcanza, la certificación (si
    // se exige) está vigente, y las horas acompañado están hechas.
    const met = levelOk && certOk && !certExpired && missingSupervisedHours === null;

    const weight = req.is_critical ? 2 : 1;
    totalWeight += weight;
    if (met) totalMet += weight;
    if (req.is_critical) {
      criticalWeight += 1;
      if (met) criticalMet += 1;
    }

    if (!met) {
      gaps.push({
        skill_id: req.skill_id,
        skill_name: req.skill_name ?? null,
        required: req.min_proficiency,
        current,
        gap: Math.max(0, req.min_proficiency - current),
        is_critical: req.is_critical,
        needsCertification: levelOk && (!certOk || !!certExpired),
        missingSupervisedHours,
        declaredLevel: h?.proficiency_level ?? 0,
        // Sin esto, un supervisor ve "nivel 2" sobre alguien a quien certificó
        // en 4 y no entiende nada. Con esto ve por qué, y qué hacer: reevaluar.
        staleMonths: decay?.decayed ? decay.monthsStale : null,
      });
    }
  }

  const readiness = totalWeight > 0 ? Math.round((totalMet / totalWeight) * 100) : 0;
  const allCriticalMet = criticalWeight === 0 || criticalMet === criticalWeight;
  const allMet = gaps.length === 0;

  // Puede trabajar acompañado si domina lo crítico a nivel básico, aunque le
  // falte la certificación o las horas. Es exactamente el estado del que está
  // aprendiendo, y es el que hoy no se podía representar.
  const criticalLevelsOk = requirements
    .filter((r) => r.is_critical)
    .every((r) => {
      const h = bySkill.get(r.skill_id);
      const lvl = h ? effectiveLevel(h, today).level : 0;
      return lvl >= Math.max(1, r.min_proficiency - 1);
    });

  let status: OperatorStatus;
  let reason: string;

  if (allMet) {
    status = 'habilitado';
    reason = 'Cumple todas las competencias exigidas por la máquina.';
  } else if (expired && allCriticalMet === false && gaps.every((g) => g.needsCertification)) {
    status = 'certificacion_vencida';
    reason = 'Tiene el nivel pero la certificación caducó. Reevaluar para volver a habilitar.';
  } else if (gaps.length > 0 && gaps.every((g) => g.needsCertification)) {
    status = expired ? 'certificacion_vencida' : 'con_supervision';
    reason = expired
      ? 'Tiene el nivel pero la certificación caducó. Reevaluar para volver a habilitar.'
      : 'Alcanza el nivel técnico; falta la certificación para operar sin supervisión.';
  } else if (criticalLevelsOk) {
    status = 'con_supervision';
    const faltan = gaps.filter((g) => g.is_critical).length;
    reason = faltan
      ? `Puede trabajar acompañado. Le faltan ${faltan} competencia(s) crítica(s) para operar solo.`
      : 'Puede trabajar acompañado mientras completa las competencias pendientes.';
  } else {
    status = 'no_habilitado';
    const criticas = gaps.filter((g) => g.is_critical);
    reason = criticas.length
      ? `No habilitado: le falta ${criticas.map((g) => g.skill_name ?? 'una competencia').join(', ')}.`
      : 'No habilitado para esta máquina.';
  }

  // Lo próximo a trabajar: primero lo crítico, y dentro de eso lo más cerca.
  const nextStep =
    [...gaps].sort((a, b) => {
      if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1;
      return a.gap - b.gap;
    })[0] ?? null;

  return {
    status,
    canOperateAlone: allMet,
    canOperateSupervised: status === 'con_supervision' || allMet,
    readiness,
    gaps,
    nextStep,
    reason,
  };
}

// ── De la máquina hacia el taller: el factor bus ────────────────────────────

export type CoverageRisk = 'sin_datos' | 'critico' | 'ajustado' | 'ok';

export interface MachineCoverage {
  risk: CoverageRisk;
  qualified: number;
  supervisedOnly: number;
  /** Umbral que el taller declaró para esta máquina. */
  minRequired: number;
  /** Cuántos habilitados faltan para dejar de depender de una persona. */
  shortfall: number;
  /** Personas más cerca de habilitarse, mejor primero. */
  closestCandidates: Array<{ employeeId: string; readiness: number; nextStep: SkillGap | null }>;
  reason: string;
}

export function machineCoverage(
  requirements: SkillRequirement[],
  roster: Array<{ employeeId: string; skills: HeldSkill[] }>,
  minRequired = 2,
  opts: { today?: Date } = {}
): MachineCoverage {
  if (requirements.length === 0) {
    return {
      risk: 'sin_datos',
      qualified: 0,
      supervisedOnly: 0,
      minRequired,
      shortfall: minRequired,
      closestCandidates: [],
      reason: NO_REQUIREMENTS_REASON,
    };
  }

  const evaluations = roster.map((p) => ({
    employeeId: p.employeeId,
    ev: evaluateOperator(requirements, p.skills, opts),
  }));

  const qualified = evaluations.filter((e) => e.ev.canOperateAlone).length;
  const supervisedOnly = evaluations.filter(
    (e) => !e.ev.canOperateAlone && e.ev.canOperateSupervised
  ).length;

  const shortfall = Math.max(0, minRequired - qualified);

  const closestCandidates = evaluations
    .filter((e) => !e.ev.canOperateAlone)
    .sort((a, b) => b.ev.readiness - a.ev.readiness)
    .slice(0, 3)
    .map((e) => ({ employeeId: e.employeeId, readiness: e.ev.readiness, nextStep: e.ev.nextStep }));

  let risk: CoverageRisk;
  let reason: string;
  if (qualified === 0) {
    risk = 'critico';
    reason = 'Nadie está habilitado para operar esta máquina.';
  } else if (qualified === 1) {
    risk = 'critico';
    reason = 'Una sola persona puede operarla. Si falta, la máquina se detiene.';
  } else if (qualified < minRequired) {
    risk = 'ajustado';
    reason = `${qualified} habilitados de los ${minRequired} que el taller definió como mínimo.`;
  } else {
    risk = 'ok';
    reason = `${qualified} personas habilitadas.`;
  }

  return { risk, qualified, supervisedOnly, minRequired, shortfall, closestCandidates, reason };
}

// ── Etiquetas, en un solo lugar ─────────────────────────────────────────────

export const OPERATOR_STATUS_LABEL: Record<OperatorStatus, string> = {
  habilitado: 'Habilitado',
  con_supervision: 'Con supervisión',
  no_habilitado: 'No habilitado',
  certificacion_vencida: 'Certificación vencida',
};

export const COVERAGE_RISK_LABEL: Record<CoverageRisk, string> = {
  sin_datos: 'Sin competencias definidas',
  critico: 'Depende de una persona',
  ajustado: 'Cobertura ajustada',
  ok: 'Cobertura suficiente',
};
