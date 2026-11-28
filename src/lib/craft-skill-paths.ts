/**
 * @fileoverview Craft Skill Paths — visual skill-tree definitions
 *
 * Covers every workshop craft with a Tier 0-5 progression:
 *   Foundation → Novice → Apprentice → Operator → Senior → Master
 *
 * Crafts:
 *   • Printing Press  (shared intro then Offset / Digital sub-branches)
 *   • Guillotine
 *   • Die Cutting
 *   • Workshop Craft  (revision, boxing, detachment, sashes, bending)
 */

// ── Types ────────────────────────────────────────────────────────────

export type CraftBranch =
  | 'foundation'
  | 'offset_printing'
  | 'digital_printing'
  | 'guillotine'
  | 'die_cutting'
  | 'workshop';

export interface SkillNodeDef {
  id: string;
  code: string;
  name: string;
  description: string;
  branch: CraftBranch;
  tier: number;           // 0 = foundation, 1-5 = progression
  category: string;       // maps to skills.category in DB
  skillTreeType: string;  // foundational | technical | operational | supervisory
  icon: string;           // lucide icon key
  x: number;              // SVG x position
  y: number;              // SVG y position
}

export interface SkillConnection {
  from: string;           // source node id (prerequisite)
  to: string;             // target node id (dependant)
  branch: CraftBranch;    // colour taken from target branch
}

export interface BranchMeta {
  id: CraftBranch;
  name: string;
  color: string;
  glowColor: string;
  bgColor: string;
  darkColor: string;
}

// ── Branch colours & metadata ────────────────────────────────────────

export const BRANCHES: Record<CraftBranch, BranchMeta> = {
  foundation: {
    id: 'foundation',
    name: 'Fundamentos',
    color: '#6b7280',
    glowColor: '#9ca3af',
    bgColor: '#374151',
    darkColor: '#1f2937',
  },
  offset_printing: {
    id: 'offset_printing',
    name: 'Impresión offset',
    color: '#3b82f6',
    glowColor: '#60a5fa',
    bgColor: '#1e3a5f',
    darkColor: '#172554',
  },
  digital_printing: {
    id: 'digital_printing',
    name: 'Impresión digital',
    color: '#a855f7',
    glowColor: '#c084fc',
    bgColor: '#4c1d95',
    darkColor: '#2e1065',
  },
  guillotine: {
    id: 'guillotine',
    name: 'Guillotina',
    color: '#ef4444',
    glowColor: '#f87171',
    bgColor: '#7f1d1d',
    darkColor: '#450a0a',
  },
  die_cutting: {
    id: 'die_cutting',
    name: 'Troquelado',
    color: '#22c55e',
    glowColor: '#4ade80',
    bgColor: '#14532d',
    darkColor: '#052e16',
  },
  workshop: {
    id: 'workshop',
    name: 'Oficios de taller',
    color: '#eab308',
    glowColor: '#facc15',
    bgColor: '#713f12',
    darkColor: '#422006',
  },
};

// ── Tier labels ──────────────────────────────────────────────────────

export const TIER_LABELS: Record<number, string> = {
  0: 'Fundamentos',
  1: 'Inicial',
  2: 'Aprendiz',
  3: 'Operador',
  4: 'Avanzado',
  5: 'Maestro',
};

export interface SkillTrack {
  id: string;
  name: string;
  description: string;
  branch: CraftBranch;
  nodeIds: string[];
}

export interface RoleTargetTemplate {
  id: string;
  name: string;
  description: string;
  primaryTrackId: string;
  secondaryTrackIds: string[];
  requiredNodeIds: string[];
}

export const SKILL_TRACKS: SkillTrack[] = [
  {
    id: 'track_offset_operator',
    name: 'Ruta de operador offset',
    description: 'De la introducción a la prensa a la autonomía total en producción offset.',
    branch: 'offset_printing',
    nodeIds: ['PRESS_INTRO', 'OFF_PAPER', 'OFF_INK', 'OFF_SINGLE', 'OFF_MULTI', 'OFF_MASTER'],
  },
  {
    id: 'track_digital_operator',
    name: 'Ruta de operador digital',
    description: 'De la preparación de archivos al liderazgo en impresión digital avanzada.',
    branch: 'digital_printing',
    nodeIds: ['PRESS_INTRO', 'DIG_FILES', 'DIG_BASIC', 'DIG_COLOR', 'DIG_SPEC', 'DIG_MASTER'],
  },
  {
    id: 'track_guillotine_specialist',
    name: 'Ruta de especialista en guillotina',
    description: 'Del corte seguro a la precisión y la programación.',
    branch: 'guillotine',
    nodeIds: ['GUIL_INTRO', 'GUIL_SINGLE', 'GUIL_COMPLEX', 'GUIL_PRECISION', 'GUIL_MASTER'],
  },
  {
    id: 'track_diecut_specialist',
    name: 'Ruta de especialista en troquelado',
    description: 'Montaje de troqueles, configuraciones complejas, registro y operación multiestación.',
    branch: 'die_cutting',
    nodeIds: ['DIE_INTRO', 'DIE_SETUP', 'DIE_COMPLEX', 'DIE_REGISTER', 'DIE_MASTER'],
  },
  {
    id: 'track_workshop_finisher',
    name: 'Ruta de terminaciones de taller',
    description: 'De la revisión y el embalaje al dominio de terminaciones avanzadas.',
    branch: 'workshop',
    nodeIds: ['WORK_INTRO', 'WORK_REVISION', 'WORK_DETACH', 'WORK_FINISH', 'WORK_MASTER'],
  },
];

export const ROLE_TARGET_TEMPLATES: RoleTargetTemplate[] = [
  {
    id: 'role_offset_lead',
    name: 'Operador líder offset',
    description: 'Lleva la producción offset con responsabilidad de calidad y capacidad de enseñar.',
    primaryTrackId: 'track_offset_operator',
    secondaryTrackIds: ['track_guillotine_specialist'],
    requiredNodeIds: ['OFF_MULTI', 'OFF_TRX', 'OFF_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_digital_specialist',
    name: 'Especialista en impresión digital',
    description: 'Responde por trabajos digitales con color crítico y soportes especiales.',
    primaryTrackId: 'track_digital_operator',
    secondaryTrackIds: ['track_workshop_finisher'],
    requiredNodeIds: ['DIG_COLOR', 'DIG_SPEC', 'DIG_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_diecut_trainer',
    name: 'Instructor de troquelado',
    description: 'Dirige el montaje de troqueles, la precisión de registro y la formación del equipo.',
    primaryTrackId: 'track_diecut_specialist',
    secondaryTrackIds: ['track_workshop_finisher'],
    requiredNodeIds: ['DIE_COMPLEX', 'DIE_REGISTER', 'DIE_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_finishing_supervisor',
    name: 'Supervisor de terminaciones',
    description: 'Coordina el flujo de terminaciones del taller y la calidad final.',
    primaryTrackId: 'track_workshop_finisher',
    secondaryTrackIds: ['track_guillotine_specialist'],
    requiredNodeIds: ['WORK_FINISH', 'WORK_MASTER', 'GUIL_PRECISION', 'QC_BASICS'],
  },
];

// ── Layout constants ─────────────────────────────────────────────────

export const VIEWBOX = { width: 1400, height: 1100 };

const TY: Record<number, number> = {
  0: 1020,
  1: 860,
  2: 700,
  3: 540,
  4: 380,
  5: 200,
};

// ── Skill node definitions ───────────────────────────────────────────

export const SKILL_NODES: SkillNodeDef[] = [
  // ═══════════════════════  FOUNDATION  ═══════════════════════
  {
    id: 'SAFETY', code: 'SAFETY_AWARENESS', name: 'Protocolos de seguridad',
    description: 'Normas de seguridad del taller, uso de EPP, procedimientos de emergencia',
    branch: 'foundation', tier: 0, category: 'Fundamentos',
    skillTreeType: 'foundational', icon: 'shield', x: 480, y: TY[0],
  },
  {
    id: 'TOOLS', code: 'BASIC_TOOLS', name: 'Herramientas manuales básicas',
    description: 'Uso correcto de herramientas manuales: llaves, destornilladores, alicates',
    branch: 'foundation', tier: 0, category: 'Fundamentos',
    skillTreeType: 'foundational', icon: 'wrench', x: 630, y: TY[0],
  },
  {
    id: 'MEASURE', code: 'MEASUREMENT_READING', name: 'Medición y lectura',
    description: 'Reglas, pie de metro, lectura de especificaciones y documentos técnicos',
    branch: 'foundation', tier: 0, category: 'Fundamentos',
    skillTreeType: 'foundational', icon: 'ruler', x: 770, y: TY[0],
  },
  {
    id: 'QC_BASICS', code: 'QUALITY_BASICS', name: 'Control de calidad básico',
    description: 'Inspección del trabajo, detección de defectos, estándares básicos de calidad',
    branch: 'foundation', tier: 0, category: 'Fundamentos',
    skillTreeType: 'foundational', icon: 'eye', x: 920, y: TY[0],
  },

  // ═══════════════════  PRINTING PRESS — shared intro  ═══════════════
  {
    id: 'PRESS_INTRO', code: 'PRESS_INTRO', name: 'Introducción a la prensa',
    description: 'Mecánica general de la prensa, seguridad, reconocimiento de partes',
    branch: 'offset_printing', tier: 1, category: 'Printing Press',
    skillTreeType: 'technical', icon: 'printer', x: 250, y: TY[1],
  },

  // ═══════════════════  OFFSET PRINTING  ═════════════════════════════
  {
    id: 'OFF_PAPER', code: 'OFFSET_PAPER_FEED', name: 'Carga y alimentación de papel',
    description: 'Ajuste del marcador, tipos de papel, regulación de la alimentación',
    branch: 'offset_printing', tier: 2, category: 'Impresión offset',
    skillTreeType: 'technical', icon: 'file-input', x: 100, y: TY[2],
  },
  {
    id: 'OFF_INK', code: 'OFFSET_INK_SETUP', name: 'Tintero y rodillos',
    description: 'Ajuste del tintero, presión de rodillos, equilibrio tinta-agua',
    branch: 'offset_printing', tier: 2, category: 'Impresión offset',
    skillTreeType: 'technical', icon: 'droplets', x: 210, y: TY[2],
  },
  {
    id: 'OFF_SINGLE', code: 'OFFSET_SINGLE_COLOR', name: 'Impresión a un color',
    description: 'Trabajos offset a un color, registro básico',
    branch: 'offset_printing', tier: 3, category: 'Impresión offset',
    skillTreeType: 'operational', icon: 'circle-dot', x: 80, y: TY[3],
  },
  {
    id: 'OFF_PLATE', code: 'OFFSET_PLATE_MOUNT', name: 'Montaje de planchas y registro',
    description: 'Instalación de planchas, registro con pines, preparación de preprensa',
    branch: 'offset_printing', tier: 3, category: 'Impresión offset',
    skillTreeType: 'operational', icon: 'layers', x: 200, y: TY[3],
  },
  {
    id: 'OFF_MULTI', code: 'OFFSET_MULTI_COLOR', name: 'Impresión multicolor',
    description: 'Registro en varias pasadas, secuencia de colores, trapping',
    branch: 'offset_printing', tier: 4, category: 'Impresión offset',
    skillTreeType: 'operational', icon: 'palette', x: 80, y: TY[4],
  },
  {
    id: 'OFF_TRX', code: 'OFFSET_TRX', name: 'Control TRX y motorización',
    description: 'Controles avanzados, ajuste de motorización, sistema TRX',
    branch: 'offset_printing', tier: 4, category: 'Impresión offset',
    skillTreeType: 'operational', icon: 'settings', x: 200, y: TY[4],
  },
  {
    id: 'OFF_MASTER', code: 'OFFSET_MASTER', name: 'Maestro de prensa offset',
    description: 'Autonomía total en producción, líder de calidad, puede formar a otros',
    branch: 'offset_printing', tier: 5, category: 'Impresión offset',
    skillTreeType: 'supervisory', icon: 'crown', x: 140, y: TY[5],
  },

  // ═══════════════════  DIGITAL PRINTING  ════════════════════════════
  {
    id: 'DIG_FILES', code: 'DIGITAL_FILE_PREP', name: 'Preparación de archivos digitales',
    description: 'Preparación de PDF, sangrado, marcas de corte, perfiles de color, preflight',
    branch: 'digital_printing', tier: 2, category: 'Impresión digital',
    skillTreeType: 'technical', icon: 'file-text', x: 310, y: TY[2],
  },
  {
    id: 'DIG_BASIC', code: 'DIGITAL_BASIC_OP', name: 'Operación de prensa digital',
    description: 'Trabajos digitales básicos, carga de soportes, manejo de la cola',
    branch: 'digital_printing', tier: 2, category: 'Impresión digital',
    skillTreeType: 'technical', icon: 'monitor', x: 410, y: TY[2],
  },
  {
    id: 'DIG_COLOR', code: 'DIGITAL_COLOR_MGMT', name: 'Gestión de color (ICC)',
    description: 'Perfiles ICC, calibración de color, prueba en pantalla',
    branch: 'digital_printing', tier: 3, category: 'Impresión digital',
    skillTreeType: 'operational', icon: 'palette', x: 310, y: TY[3],
  },
  {
    id: 'DIG_LARGE', code: 'DIGITAL_LARGE_FORMAT', name: 'Impresión gran formato',
    description: 'Impresoras de gran formato, pendones, afiches, soportes en rollo',
    branch: 'digital_printing', tier: 3, category: 'Impresión digital',
    skillTreeType: 'operational', icon: 'maximize', x: 420, y: TY[3],
  },
  {
    id: 'DIG_VARDATA', code: 'DIGITAL_VARIABLE_DATA', name: 'Impresión de datos variables',
    description: 'Datos variables, personalización, tirajes desde base de datos',
    branch: 'digital_printing', tier: 4, category: 'Impresión digital',
    skillTreeType: 'operational', icon: 'database', x: 310, y: TY[4],
  },
  {
    id: 'DIG_SPEC', code: 'DIGITAL_SPECIALTY', name: 'Soportes y terminaciones especiales',
    description: 'Sustratos especiales, barniz UV, laminado, aplicaciones',
    branch: 'digital_printing', tier: 4, category: 'Impresión digital',
    skillTreeType: 'operational', icon: 'sparkles', x: 420, y: TY[4],
  },
  {
    id: 'DIG_MASTER', code: 'DIGITAL_MASTER', name: 'Maestro de impresión digital',
    description: 'Líder de producción digital, innovación, puede formar a otros',
    branch: 'digital_printing', tier: 5, category: 'Impresión digital',
    skillTreeType: 'supervisory', icon: 'crown', x: 365, y: TY[5],
  },

  // ═══════════════════  GUILLOTINE  ══════════════════════════════════
  {
    id: 'GUIL_INTRO', code: 'GUILLOTINE_INTRO', name: 'Guillotina: seguridad e introducción',
    description: 'Seguridad con la cuchilla, partes de la máquina, principios de operación',
    branch: 'guillotine', tier: 1, category: 'Guillotina',
    skillTreeType: 'technical', icon: 'scissors', x: 590, y: TY[1],
  },
  {
    id: 'GUIL_SINGLE', code: 'GUILLOTINE_SINGLE_CUT', name: 'Corte de pliego y de resma',
    description: 'Corte básico de pliego y de resma, ajuste del pisón',
    branch: 'guillotine', tier: 2, category: 'Guillotina',
    skillTreeType: 'technical', icon: 'file-minus', x: 540, y: TY[2],
  },
  {
    id: 'GUIL_MEASURE', code: 'GUILLOTINE_MEASURE', name: 'Medición y preparación del corte',
    description: 'Programación de la escuadra, lectura de regla, planificación de cortes',
    branch: 'guillotine', tier: 2, category: 'Guillotina',
    skillTreeType: 'technical', icon: 'ruler', x: 640, y: TY[2],
  },
  {
    id: 'GUIL_COMPLEX', code: 'GUILLOTINE_COMPLEX', name: 'Programas de corte múltiple',
    description: 'Secuencias de corte en varios pasos, cortes anidados, optimización',
    branch: 'guillotine', tier: 3, category: 'Guillotina',
    skillTreeType: 'operational', icon: 'layout-grid', x: 540, y: TY[3],
  },
  {
    id: 'GUIL_BLADE', code: 'GUILLOTINE_BLADE', name: 'Mantención y cambio de cuchilla',
    description: 'Cambio y afilado de cuchilla, rotación del listón de corte',
    branch: 'guillotine', tier: 3, category: 'Guillotina',
    skillTreeType: 'operational', icon: 'wrench', x: 640, y: TY[3],
  },
  {
    id: 'GUIL_PRECISION', code: 'GUILLOTINE_PRECISION', name: 'Corte de precisión',
    description: 'Tolerancias estrechas, materiales especiales, verificación de calidad',
    branch: 'guillotine', tier: 4, category: 'Guillotina',
    skillTreeType: 'operational', icon: 'target', x: 540, y: TY[4],
  },
  {
    id: 'GUIL_PROGRAM', code: 'GUILLOTINE_PROGRAMMING', name: 'Programación avanzada',
    description: 'Programación CNC, secuencias automáticas, optimización de producción',
    branch: 'guillotine', tier: 4, category: 'Guillotina',
    skillTreeType: 'operational', icon: 'cpu', x: 640, y: TY[4],
  },
  {
    id: 'GUIL_MASTER', code: 'GUILLOTINE_MASTER', name: 'Maestro de guillotina',
    description: 'Líder de corte, experto en optimización, instructor',
    branch: 'guillotine', tier: 5, category: 'Guillotina',
    skillTreeType: 'supervisory', icon: 'crown', x: 590, y: TY[5],
  },

  // ═══════════════════  DIE CUTTING  ═════════════════════════════════
  {
    id: 'DIE_INTRO', code: 'DIE_CUT_INTRO', name: 'Troquelado: seguridad e introducción',
    description: 'Tipos de troquel, seguridad de la máquina, operación básica',
    branch: 'die_cutting', tier: 1, category: 'Troquelado',
    skillTreeType: 'technical', icon: 'box', x: 870, y: TY[1],
  },
  {
    id: 'DIE_SETUP', code: 'DIE_CUT_SETUP', name: 'Montaje y alineación del troquel',
    description: 'Montaje del troquel, arreglo, ajuste de presión',
    branch: 'die_cutting', tier: 2, category: 'Troquelado',
    skillTreeType: 'technical', icon: 'settings', x: 820, y: TY[2],
  },
  {
    id: 'DIE_RUN', code: 'DIE_CUT_BASIC_RUN', name: 'Tirajes básicos de troquelado',
    description: 'Producción, control de velocidad, seguimiento de calidad',
    branch: 'die_cutting', tier: 2, category: 'Troquelado',
    skillTreeType: 'technical', icon: 'play', x: 920, y: TY[2],
  },
  {
    id: 'DIE_COMPLEX', code: 'DIE_CUT_COMPLEX', name: 'Configuraciones complejas de troquel',
    description: 'Troqueles multinivel, medio corte, perforado, troqueles de relieve',
    branch: 'die_cutting', tier: 3, category: 'Troquelado',
    skillTreeType: 'operational', icon: 'hexagon', x: 820, y: TY[3],
  },
  {
    id: 'DIE_STRIP', code: 'DIE_CUT_STRIPPING', name: 'Desbarbado y retiro de recortes',
    description: 'Herramientas de desbarbado, retiro de recortes, separación de piezas',
    branch: 'die_cutting', tier: 3, category: 'Troquelado',
    skillTreeType: 'operational', icon: 'unlink', x: 920, y: TY[3],
  },
  {
    id: 'DIE_REGISTER', code: 'DIE_CUT_REGISTER', name: 'Registro de precisión',
    description: 'Registro estrecho con la impresión, alineación de sensores, consistencia',
    branch: 'die_cutting', tier: 4, category: 'Troquelado',
    skillTreeType: 'operational', icon: 'crosshair', x: 820, y: TY[4],
  },
  {
    id: 'DIE_MULTI', code: 'DIE_CUT_MULTI_STATION', name: 'Operación multiestación',
    description: 'Desbarbado, separación y apilado en línea',
    branch: 'die_cutting', tier: 4, category: 'Troquelado',
    skillTreeType: 'operational', icon: 'grid-3x3', x: 920, y: TY[4],
  },
  {
    id: 'DIE_MASTER', code: 'DIE_CUT_MASTER', name: 'Maestro de troquelado',
    description: 'Líder de troquelado, asesoría de diseño, instructor',
    branch: 'die_cutting', tier: 5, category: 'Troquelado',
    skillTreeType: 'supervisory', icon: 'crown', x: 870, y: TY[5],
  },

  // ═══════════════════  WORKSHOP CRAFT  ══════════════════════════════
  {
    id: 'WORK_INTRO', code: 'WORKSHOP_INTRO', name: 'Herramientas y orden del taller',
    description: 'Distribución del taller, cuidado de herramientas, orden del puesto',
    branch: 'workshop', tier: 1, category: 'Oficios de taller',
    skillTreeType: 'technical', icon: 'hammer', x: 1150, y: TY[1],
  },
  {
    id: 'WORK_REVISION', code: 'WORKSHOP_REVISION', name: 'Revisión e inspección',
    description: 'Inspección de producto terminado, selección, detección de defectos',
    branch: 'workshop', tier: 2, category: 'Oficios de taller',
    skillTreeType: 'technical', icon: 'search', x: 1090, y: TY[2],
  },
  {
    id: 'WORK_BOXING', code: 'WORKSHOP_BOXING', name: 'Encajado y embalaje',
    description: 'Embalaje de producto terminado, normas de encajado, etiquetado',
    branch: 'workshop', tier: 2, category: 'Oficios de taller',
    skillTreeType: 'technical', icon: 'package', x: 1210, y: TY[2],
  },
  {
    id: 'WORK_DETACH', code: 'WORKSHOP_DETACHMENT', name: 'Desglose de troquelados',
    description: 'Desglose manual de piezas troqueladas, manipulación cuidadosa',
    branch: 'workshop', tier: 3, category: 'Oficios de taller',
    skillTreeType: 'operational', icon: 'unlink', x: 1040, y: TY[3],
  },
  {
    id: 'WORK_SASH', code: 'WORKSHOP_SASHES', name: 'Fajas',
    description: 'Producción de fajas, envoltura, terminación',
    branch: 'workshop', tier: 3, category: 'Oficios de taller',
    skillTreeType: 'operational', icon: 'ribbon', x: 1150, y: TY[3],
  },
  {
    id: 'WORK_BEND', code: 'WORKSHOP_BENDING_BASIC', name: 'Plegadora: dípticos',
    description: 'Operación básica de la plegadora para dípticos',
    branch: 'workshop', tier: 3, category: 'Oficios de taller',
    skillTreeType: 'operational', icon: 'corner-down-right', x: 1270, y: TY[3],
  },
  {
    id: 'WORK_FINISH', code: 'WORKSHOP_FINISHING', name: 'Terminaciones avanzadas',
    description: 'Armado complejo, terminaciones en varios pasos, terminación de calidad',
    branch: 'workshop', tier: 4, category: 'Oficios de taller',
    skillTreeType: 'operational', icon: 'puzzle', x: 1090, y: TY[4],
  },
  {
    id: 'WORK_BEND_ADV', code: 'WORKSHOP_BENDING_ADV', name: 'Plegadora: avanzado',
    description: 'Pliegues complejos: trípticos, ventana, acordeón, pliegues especiales',
    branch: 'workshop', tier: 4, category: 'Oficios de taller',
    skillTreeType: 'operational', icon: 'rotate-cw', x: 1220, y: TY[4],
  },
  {
    id: 'WORK_MASTER', code: 'WORKSHOP_MASTER', name: 'Maestro de oficios de taller',
    description: 'Líder de taller, supervisión de varios oficios, instructor',
    branch: 'workshop', tier: 5, category: 'Oficios de taller',
    skillTreeType: 'supervisory', icon: 'crown', x: 1150, y: TY[5],
  },
];

// ── Connections (prerequisite → dependant) ───────────────────────────

export const CONNECTIONS: SkillConnection[] = [
  // Foundation → Craft tier-1 intros
  { from: 'SAFETY',     to: 'PRESS_INTRO', branch: 'offset_printing' },
  { from: 'MEASURE',    to: 'PRESS_INTRO', branch: 'offset_printing' },
  { from: 'SAFETY',     to: 'GUIL_INTRO',  branch: 'guillotine' },
  { from: 'MEASURE',    to: 'GUIL_INTRO',  branch: 'guillotine' },
  { from: 'SAFETY',     to: 'DIE_INTRO',   branch: 'die_cutting' },
  { from: 'TOOLS',      to: 'DIE_INTRO',   branch: 'die_cutting' },
  { from: 'SAFETY',     to: 'WORK_INTRO',  branch: 'workshop' },
  { from: 'TOOLS',      to: 'WORK_INTRO',  branch: 'workshop' },
  { from: 'QC_BASICS',  to: 'WORK_INTRO',  branch: 'workshop' },

  // Printing Press intro → Offset & Digital tier-2
  { from: 'PRESS_INTRO', to: 'OFF_PAPER',  branch: 'offset_printing' },
  { from: 'PRESS_INTRO', to: 'OFF_INK',    branch: 'offset_printing' },
  { from: 'PRESS_INTRO', to: 'DIG_FILES',  branch: 'digital_printing' },
  { from: 'PRESS_INTRO', to: 'DIG_BASIC',  branch: 'digital_printing' },
  { from: 'QC_BASICS',   to: 'DIG_BASIC',  branch: 'digital_printing' },

  // ── Offset internal ────────────────────────────────────────────────
  { from: 'OFF_PAPER',  to: 'OFF_SINGLE',  branch: 'offset_printing' },
  { from: 'OFF_INK',    to: 'OFF_SINGLE',  branch: 'offset_printing' },
  { from: 'OFF_PAPER',  to: 'OFF_PLATE',   branch: 'offset_printing' },
  { from: 'OFF_SINGLE', to: 'OFF_MULTI',   branch: 'offset_printing' },
  { from: 'OFF_PLATE',  to: 'OFF_MULTI',   branch: 'offset_printing' },
  { from: 'OFF_SINGLE', to: 'OFF_TRX',     branch: 'offset_printing' },
  { from: 'QC_BASICS',  to: 'OFF_TRX',     branch: 'offset_printing' },
  { from: 'OFF_MULTI',  to: 'OFF_MASTER',  branch: 'offset_printing' },
  { from: 'OFF_TRX',    to: 'OFF_MASTER',  branch: 'offset_printing' },

  // ── Digital internal ───────────────────────────────────────────────
  { from: 'DIG_FILES',   to: 'DIG_COLOR',   branch: 'digital_printing' },
  { from: 'DIG_BASIC',   to: 'DIG_COLOR',   branch: 'digital_printing' },
  { from: 'DIG_BASIC',   to: 'DIG_LARGE',   branch: 'digital_printing' },
  { from: 'DIG_COLOR',   to: 'DIG_VARDATA', branch: 'digital_printing' },
  { from: 'DIG_COLOR',   to: 'DIG_SPEC',    branch: 'digital_printing' },
  { from: 'DIG_LARGE',   to: 'DIG_SPEC',    branch: 'digital_printing' },
  { from: 'QC_BASICS',   to: 'DIG_SPEC',    branch: 'digital_printing' },
  { from: 'DIG_VARDATA', to: 'DIG_MASTER',  branch: 'digital_printing' },
  { from: 'DIG_SPEC',    to: 'DIG_MASTER',  branch: 'digital_printing' },

  // ── Guillotine internal ────────────────────────────────────────────
  { from: 'GUIL_INTRO',     to: 'GUIL_SINGLE',    branch: 'guillotine' },
  { from: 'GUIL_INTRO',     to: 'GUIL_MEASURE',   branch: 'guillotine' },
  { from: 'GUIL_SINGLE',    to: 'GUIL_COMPLEX',   branch: 'guillotine' },
  { from: 'GUIL_MEASURE',   to: 'GUIL_COMPLEX',   branch: 'guillotine' },
  { from: 'GUIL_SINGLE',    to: 'GUIL_BLADE',     branch: 'guillotine' },
  { from: 'TOOLS',          to: 'GUIL_BLADE',     branch: 'guillotine' },
  { from: 'GUIL_COMPLEX',   to: 'GUIL_PRECISION', branch: 'guillotine' },
  { from: 'GUIL_BLADE',     to: 'GUIL_PRECISION', branch: 'guillotine' },
  { from: 'QC_BASICS',      to: 'GUIL_PRECISION', branch: 'guillotine' },
  { from: 'GUIL_COMPLEX',   to: 'GUIL_PROGRAM',   branch: 'guillotine' },
  { from: 'GUIL_PRECISION', to: 'GUIL_MASTER',    branch: 'guillotine' },
  { from: 'GUIL_PROGRAM',   to: 'GUIL_MASTER',    branch: 'guillotine' },

  // ── Die Cutting internal ───────────────────────────────────────────
  { from: 'DIE_INTRO',     to: 'DIE_SETUP',    branch: 'die_cutting' },
  { from: 'DIE_INTRO',     to: 'DIE_RUN',      branch: 'die_cutting' },
  { from: 'TOOLS',         to: 'DIE_SETUP',    branch: 'die_cutting' },
  { from: 'DIE_SETUP',     to: 'DIE_COMPLEX',  branch: 'die_cutting' },
  { from: 'DIE_RUN',       to: 'DIE_COMPLEX',  branch: 'die_cutting' },
  { from: 'DIE_RUN',       to: 'DIE_STRIP',    branch: 'die_cutting' },
  { from: 'DIE_COMPLEX',   to: 'DIE_REGISTER', branch: 'die_cutting' },
  { from: 'DIE_COMPLEX',   to: 'DIE_MULTI',    branch: 'die_cutting' },
  { from: 'DIE_STRIP',     to: 'DIE_MULTI',    branch: 'die_cutting' },
  { from: 'QC_BASICS',     to: 'DIE_REGISTER', branch: 'die_cutting' },
  { from: 'DIE_REGISTER',  to: 'DIE_MASTER',   branch: 'die_cutting' },
  { from: 'DIE_MULTI',     to: 'DIE_MASTER',   branch: 'die_cutting' },

  // ── Workshop internal ──────────────────────────────────────────────
  { from: 'WORK_INTRO',     to: 'WORK_REVISION',  branch: 'workshop' },
  { from: 'WORK_INTRO',     to: 'WORK_BOXING',    branch: 'workshop' },
  { from: 'WORK_REVISION',  to: 'WORK_DETACH',    branch: 'workshop' },
  { from: 'WORK_BOXING',    to: 'WORK_SASH',      branch: 'workshop' },
  { from: 'WORK_BOXING',    to: 'WORK_BEND',      branch: 'workshop' },
  { from: 'WORK_DETACH',    to: 'WORK_FINISH',    branch: 'workshop' },
  { from: 'WORK_SASH',      to: 'WORK_FINISH',    branch: 'workshop' },
  { from: 'QC_BASICS',      to: 'WORK_FINISH',    branch: 'workshop' },
  { from: 'WORK_BEND',      to: 'WORK_BEND_ADV',  branch: 'workshop' },
  { from: 'WORK_FINISH',    to: 'WORK_MASTER',    branch: 'workshop' },
  { from: 'WORK_BEND_ADV',  to: 'WORK_MASTER',    branch: 'workshop' },
];

// ── Helpers ──────────────────────────────────────────────────────────

export type NodeState = 'locked' | 'available' | 'in_progress' | 'mastered';

/** Map of skill code → proficiency level (1-5). */
export type ProficiencyMap = Map<string, number>;

const nodeById = new Map(SKILL_NODES.map(n => [n.id, n]));
const prereqsByTarget = new Map<string, SkillConnection[]>();
CONNECTIONS.forEach(c => {
  const list = prereqsByTarget.get(c.to) ?? [];
  list.push(c);
  prereqsByTarget.set(c.to, list);
});

/**
 * Determine the visual state of a node given the employee's proficiency map.
 * When no employee is selected pass an empty map – all nodes show as 'available'.
 */
export const getNodeState = (
  nodeId: string,
  proficiencyMap: ProficiencyMap,
  hasEmployee: boolean,
): NodeState => {
  if (!hasEmployee) return 'available';

  const node = nodeById.get(nodeId);
  if (!node) return 'locked';

  const level = proficiencyMap.get(node.code) ?? 0;
  if (level >= 5) return 'mastered';
  if (level > 0) return 'in_progress';

  // Check prerequisites
  const prereqs = prereqsByTarget.get(nodeId);
  if (!prereqs || prereqs.length === 0) return 'available';

  const met = prereqs.every(conn => {
    const pre = nodeById.get(conn.from);
    return pre ? (proficiencyMap.get(pre.code) ?? 0) >= 1 : false;
  });

  return met ? 'available' : 'locked';
};

/**
 * Per-branch progress summary.
 */
export const getBranchProgress = (
  branch: CraftBranch,
  proficiencyMap: ProficiencyMap,
): { completed: number; total: number; percentage: number } => {
  const nodes = SKILL_NODES.filter(n => n.branch === branch);
  const completed = nodes.filter(n => (proficiencyMap.get(n.code) ?? 0) >= 1).length;
  return {
    completed,
    total: nodes.length,
    percentage: nodes.length > 0 ? Math.round((completed / nodes.length) * 100) : 0,
  };
};

export const getTrackProgress = (
  trackId: string,
  proficiencyMap: ProficiencyMap,
): { completed: number; total: number; percentage: number } => {
  const track = SKILL_TRACKS.find(t => t.id === trackId);
  if (!track) return { completed: 0, total: 0, percentage: 0 };

  const completed = track.nodeIds.filter(nodeId => {
    const node = nodeById.get(nodeId);
    return node ? (proficiencyMap.get(node.code) ?? 0) >= 1 : false;
  }).length;

  return {
    completed,
    total: track.nodeIds.length,
    percentage: track.nodeIds.length > 0 ? Math.round((completed / track.nodeIds.length) * 100) : 0,
  };
};

export const getRoleTemplateReadiness = (
  templateId: string,
  proficiencyMap: ProficiencyMap,
): {
  readiness: number;
  missingNodeIds: string[];
  coveredNodeIds: string[];
} => {
  const template = ROLE_TARGET_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return { readiness: 0, missingNodeIds: [], coveredNodeIds: [] };
  }

  const allTrackIds = [template.primaryTrackId, ...template.secondaryTrackIds];
  const trackProgress = allTrackIds.map(trackId => getTrackProgress(trackId, proficiencyMap));
  const primary = trackProgress[0]?.percentage ?? 0;
  const secondaryAverage = trackProgress.length > 1
    ? Math.round(trackProgress.slice(1).reduce((acc, p) => acc + p.percentage, 0) / (trackProgress.length - 1))
    : 0;

  const coveredNodeIds = template.requiredNodeIds.filter(nodeId => {
    const node = nodeById.get(nodeId);
    return node ? (proficiencyMap.get(node.code) ?? 0) >= 1 : false;
  });

  const missingNodeIds = template.requiredNodeIds.filter(nodeId => !coveredNodeIds.includes(nodeId));
  const requiredCoverage = template.requiredNodeIds.length > 0
    ? Math.round((coveredNodeIds.length / template.requiredNodeIds.length) * 100)
    : 0;

  const readiness = Math.round((primary * 0.5) + (secondaryAverage * 0.2) + (requiredCoverage * 0.3));

  return {
    readiness,
    missingNodeIds,
    coveredNodeIds,
  };
};
