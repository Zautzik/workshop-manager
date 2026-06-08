export type StationSkillRequirement = {
  skillCodes: string[];
  minProficiency: number;
};

export const STATION_SKILL_REQUIREMENTS: Record<string, StationSkillRequirement> = {
  offset_printer: {
    skillCodes: ['OFFSET_PRESS_ADVANCED', 'OFFSET_PRESS_BASIC', 'PRE_PRESS_SETUP'],
    minProficiency: 2,
  },
  guillotine: {
    skillCodes: ['GUILLOTINE_ADVANCED', 'GUILLOTINE_BASIC'],
    minProficiency: 2,
  },
  die_cutter: {
    skillCodes: ['DIE_CUTTING'],
    minProficiency: 2,
  },
  workshop: {
    skillCodes: ['MANUAL_WORKSHOP'],
    minProficiency: 1,
  },
  manual_workshop: {
    skillCodes: ['MANUAL_WORKSHOP'],
    minProficiency: 1,
  },
  other: {
    skillCodes: ['WAREHOUSE_OPS', 'MATERIAL_HANDLING', 'QUALITY_CONTROL'],
    minProficiency: 1,
  },
};

const normalizeSkillCode = (code?: string | null) =>
  (code || '').toUpperCase().trim();

const getWorkerSkills = (worker: any) => {
  if (!worker) return [];
  if (Array.isArray(worker.employee_skills)) return worker.employee_skills;
  if (Array.isArray(worker.skills)) return worker.skills;
  return [];
};

export const getWorkerSkillMap = (worker: any) => {
  const skills = getWorkerSkills(worker);
  const map = new Map<string, number>();

  skills.forEach((entry: any) => {
    const skillData = entry?.skill ?? entry?.skills ?? entry;
    const code = normalizeSkillCode(
      typeof skillData === 'string' ? skillData : skillData?.code
    );
    if (!code) return;

    const proficiency = Number(
      entry?.proficiency_level ?? entry?.level ?? entry?.proficiency ?? 0
    );

    const current = map.get(code) ?? 0;
    if (proficiency > current) map.set(code, proficiency);
  });

  return map;
};

export const getStationSkillRequirement = (
  stationOrType: any
): StationSkillRequirement | null => {
  const stationType = typeof stationOrType === 'string' ? stationOrType : stationOrType?.type;
  if (!stationType) return null;

  const customRequirements = stationOrType?.skill_requirements;
  if (customRequirements?.skillCodes?.length) {
    return {
      skillCodes: customRequirements.skillCodes
        .map(normalizeSkillCode)
        .filter(Boolean),
      minProficiency: Number(customRequirements.minProficiency ?? 1) || 1,
    };
  }

  return STATION_SKILL_REQUIREMENTS[stationType] ?? null;
};

export const getWorkerQualificationScore = (worker: any, stationOrType: any) => {
  const requirement = getStationSkillRequirement(stationOrType);
  if (!requirement) return null;

  const skillMap = getWorkerSkillMap(worker);
  let best = 0;

  requirement.skillCodes.forEach(code => {
    const score = skillMap.get(normalizeSkillCode(code)) ?? 0;
    if (score > best) best = score;
  });

  return best >= requirement.minProficiency ? best : null;
};

export const isWorkerQualifiedForStation = (worker: any, station: any) => {
  const requirement = getStationSkillRequirement(station);
  if (!requirement) return true;
  return getWorkerQualificationScore(worker, station) !== null;
};

export const getWorkerPrimaryStationType = (worker: any, stationTypes: string[]) => {
  let bestType: string | null = null;
  let bestScore = -1;

  stationTypes.forEach(type => {
    const score = getWorkerQualificationScore(worker, type);
    if (score !== null && score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  });

  return bestType;
};
