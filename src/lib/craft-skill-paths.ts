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
    name: 'Foundation',
    color: '#6b7280',
    glowColor: '#9ca3af',
    bgColor: '#374151',
    darkColor: '#1f2937',
  },
  offset_printing: {
    id: 'offset_printing',
    name: 'Offset Printing',
    color: '#3b82f6',
    glowColor: '#60a5fa',
    bgColor: '#1e3a5f',
    darkColor: '#172554',
  },
  digital_printing: {
    id: 'digital_printing',
    name: 'Digital Printing',
    color: '#a855f7',
    glowColor: '#c084fc',
    bgColor: '#4c1d95',
    darkColor: '#2e1065',
  },
  guillotine: {
    id: 'guillotine',
    name: 'Guillotine',
    color: '#ef4444',
    glowColor: '#f87171',
    bgColor: '#7f1d1d',
    darkColor: '#450a0a',
  },
  die_cutting: {
    id: 'die_cutting',
    name: 'Die Cutting',
    color: '#22c55e',
    glowColor: '#4ade80',
    bgColor: '#14532d',
    darkColor: '#052e16',
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop Craft',
    color: '#eab308',
    glowColor: '#facc15',
    bgColor: '#713f12',
    darkColor: '#422006',
  },
};

// ── Tier labels ──────────────────────────────────────────────────────

export const TIER_LABELS: Record<number, string> = {
  0: 'Foundation',
  1: 'Novice',
  2: 'Apprentice',
  3: 'Operator',
  4: 'Senior',
  5: 'Master',
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
    name: 'Offset Operator Path',
    description: 'From press introduction to full offset production autonomy.',
    branch: 'offset_printing',
    nodeIds: ['PRESS_INTRO', 'OFF_PAPER', 'OFF_INK', 'OFF_SINGLE', 'OFF_MULTI', 'OFF_MASTER'],
  },
  {
    id: 'track_digital_operator',
    name: 'Digital Operator Path',
    description: 'From file preparation to advanced digital printing leadership.',
    branch: 'digital_printing',
    nodeIds: ['PRESS_INTRO', 'DIG_FILES', 'DIG_BASIC', 'DIG_COLOR', 'DIG_SPEC', 'DIG_MASTER'],
  },
  {
    id: 'track_guillotine_specialist',
    name: 'Guillotine Specialist Path',
    description: 'Safe cutting foundations evolving into precision and programming.',
    branch: 'guillotine',
    nodeIds: ['GUIL_INTRO', 'GUIL_SINGLE', 'GUIL_COMPLEX', 'GUIL_PRECISION', 'GUIL_MASTER'],
  },
  {
    id: 'track_diecut_specialist',
    name: 'Die-Cutting Specialist Path',
    description: 'Die setup, complex configurations, registration and multi-station operations.',
    branch: 'die_cutting',
    nodeIds: ['DIE_INTRO', 'DIE_SETUP', 'DIE_COMPLEX', 'DIE_REGISTER', 'DIE_MASTER'],
  },
  {
    id: 'track_workshop_finisher',
    name: 'Workshop Finishing Path',
    description: 'From revision and packaging to advanced finishing mastery.',
    branch: 'workshop',
    nodeIds: ['WORK_INTRO', 'WORK_REVISION', 'WORK_DETACH', 'WORK_FINISH', 'WORK_MASTER'],
  },
];

export const ROLE_TARGET_TEMPLATES: RoleTargetTemplate[] = [
  {
    id: 'role_offset_lead',
    name: 'Offset Lead Operator',
    description: 'Runs offset production with quality responsibility and coaching capability.',
    primaryTrackId: 'track_offset_operator',
    secondaryTrackIds: ['track_guillotine_specialist'],
    requiredNodeIds: ['OFF_MULTI', 'OFF_TRX', 'OFF_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_digital_specialist',
    name: 'Digital Print Specialist',
    description: 'Owns color-critical digital jobs and specialty media execution.',
    primaryTrackId: 'track_digital_operator',
    secondaryTrackIds: ['track_workshop_finisher'],
    requiredNodeIds: ['DIG_COLOR', 'DIG_SPEC', 'DIG_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_diecut_trainer',
    name: 'Die-Cutting Trainer',
    description: 'Leads die-cut setup, registration precision, and team training.',
    primaryTrackId: 'track_diecut_specialist',
    secondaryTrackIds: ['track_workshop_finisher'],
    requiredNodeIds: ['DIE_COMPLEX', 'DIE_REGISTER', 'DIE_MASTER', 'QC_BASICS'],
  },
  {
    id: 'role_finishing_supervisor',
    name: 'Finishing Supervisor',
    description: 'Coordinates workshop finishing flow and final quality outcomes.',
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
    id: 'SAFETY', code: 'SAFETY_AWARENESS', name: 'Safety Protocols',
    description: 'General workshop safety rules, PPE usage, emergency procedures',
    branch: 'foundation', tier: 0, category: 'Foundation',
    skillTreeType: 'foundational', icon: 'shield', x: 480, y: TY[0],
  },
  {
    id: 'TOOLS', code: 'BASIC_TOOLS', name: 'Basic Hand Tools',
    description: 'Proper use of common hand tools: wrenches, screwdrivers, pliers',
    branch: 'foundation', tier: 0, category: 'Foundation',
    skillTreeType: 'foundational', icon: 'wrench', x: 630, y: TY[0],
  },
  {
    id: 'MEASURE', code: 'MEASUREMENT_READING', name: 'Measurements & Reading',
    description: 'Rulers, calipers, reading specs and technical documents',
    branch: 'foundation', tier: 0, category: 'Foundation',
    skillTreeType: 'foundational', icon: 'ruler', x: 770, y: TY[0],
  },
  {
    id: 'QC_BASICS', code: 'QUALITY_BASICS', name: 'Quality Control Basics',
    description: 'Inspecting work, identifying defects, basic quality standards',
    branch: 'foundation', tier: 0, category: 'Foundation',
    skillTreeType: 'foundational', icon: 'eye', x: 920, y: TY[0],
  },

  // ═══════════════════  PRINTING PRESS — shared intro  ═══════════════
  {
    id: 'PRESS_INTRO', code: 'PRESS_INTRO', name: 'Printing Press Introduction',
    description: 'General press mechanics, safety, machine parts recognition',
    branch: 'offset_printing', tier: 1, category: 'Printing Press',
    skillTreeType: 'technical', icon: 'printer', x: 250, y: TY[1],
  },

  // ═══════════════════  OFFSET PRINTING  ═════════════════════════════
  {
    id: 'OFF_PAPER', code: 'OFFSET_PAPER_FEED', name: 'Paper Loading & Feeding',
    description: 'Paper feeder setup, stock types, feeding adjustments',
    branch: 'offset_printing', tier: 2, category: 'Offset Printing',
    skillTreeType: 'technical', icon: 'file-input', x: 100, y: TY[2],
  },
  {
    id: 'OFF_INK', code: 'OFFSET_INK_SETUP', name: 'Ink Setup & Rollers',
    description: 'Ink fountain adjustment, roller pressure, ink-water balance',
    branch: 'offset_printing', tier: 2, category: 'Offset Printing',
    skillTreeType: 'technical', icon: 'droplets', x: 210, y: TY[2],
  },
  {
    id: 'OFF_SINGLE', code: 'OFFSET_SINGLE_COLOR', name: 'Single-Color Printing',
    description: 'Running single-colour offset jobs, basic registration',
    branch: 'offset_printing', tier: 3, category: 'Offset Printing',
    skillTreeType: 'operational', icon: 'circle-dot', x: 80, y: TY[3],
  },
  {
    id: 'OFF_PLATE', code: 'OFFSET_PLATE_MOUNT', name: 'Plate Mounting & Registration',
    description: 'Plate installation, pin-bar registration, pre-press setup',
    branch: 'offset_printing', tier: 3, category: 'Offset Printing',
    skillTreeType: 'operational', icon: 'layers', x: 200, y: TY[3],
  },
  {
    id: 'OFF_MULTI', code: 'OFFSET_MULTI_COLOR', name: 'Multi-Color Printing',
    description: 'Multi-pass registration, colour sequence, trapping',
    branch: 'offset_printing', tier: 4, category: 'Offset Printing',
    skillTreeType: 'operational', icon: 'palette', x: 80, y: TY[4],
  },
  {
    id: 'OFF_TRX', code: 'OFFSET_TRX', name: 'TRX Control & Motorization',
    description: 'Advanced machine controls, motorisation tuning, TRX system',
    branch: 'offset_printing', tier: 4, category: 'Offset Printing',
    skillTreeType: 'operational', icon: 'settings', x: 200, y: TY[4],
  },
  {
    id: 'OFF_MASTER', code: 'OFFSET_MASTER', name: 'Offset Press Master',
    description: 'Full production autonomy, quality lead, can train others',
    branch: 'offset_printing', tier: 5, category: 'Offset Printing',
    skillTreeType: 'supervisory', icon: 'crown', x: 140, y: TY[5],
  },

  // ═══════════════════  DIGITAL PRINTING  ════════════════════════════
  {
    id: 'DIG_FILES', code: 'DIGITAL_FILE_PREP', name: 'Digital File Preparation',
    description: 'PDF preparation, bleed, trim marks, colour profiles, pre-flight',
    branch: 'digital_printing', tier: 2, category: 'Digital Printing',
    skillTreeType: 'technical', icon: 'file-text', x: 310, y: TY[2],
  },
  {
    id: 'DIG_BASIC', code: 'DIGITAL_BASIC_OP', name: 'Digital Press Operation',
    description: 'Running basic digital print jobs, media loading, queue mgmt',
    branch: 'digital_printing', tier: 2, category: 'Digital Printing',
    skillTreeType: 'technical', icon: 'monitor', x: 410, y: TY[2],
  },
  {
    id: 'DIG_COLOR', code: 'DIGITAL_COLOR_MGMT', name: 'Color Management (ICC)',
    description: 'ICC profiles, colour calibration, soft-proofing',
    branch: 'digital_printing', tier: 3, category: 'Digital Printing',
    skillTreeType: 'operational', icon: 'palette', x: 310, y: TY[3],
  },
  {
    id: 'DIG_LARGE', code: 'DIGITAL_LARGE_FORMAT', name: 'Large Format Printing',
    description: 'Wide-format printers, banners, posters, roll media',
    branch: 'digital_printing', tier: 3, category: 'Digital Printing',
    skillTreeType: 'operational', icon: 'maximize', x: 420, y: TY[3],
  },
  {
    id: 'DIG_VARDATA', code: 'DIGITAL_VARIABLE_DATA', name: 'Variable Data Printing',
    description: 'VDP, personalisation, database-driven print runs',
    branch: 'digital_printing', tier: 4, category: 'Digital Printing',
    skillTreeType: 'operational', icon: 'database', x: 310, y: TY[4],
  },
  {
    id: 'DIG_SPEC', code: 'DIGITAL_SPECIALTY', name: 'Specialty Media & Finishes',
    description: 'Special substrates, UV coating, lamination, embellishments',
    branch: 'digital_printing', tier: 4, category: 'Digital Printing',
    skillTreeType: 'operational', icon: 'sparkles', x: 420, y: TY[4],
  },
  {
    id: 'DIG_MASTER', code: 'DIGITAL_MASTER', name: 'Digital Printing Master',
    description: 'Full digital production lead, innovation, can train others',
    branch: 'digital_printing', tier: 5, category: 'Digital Printing',
    skillTreeType: 'supervisory', icon: 'crown', x: 365, y: TY[5],
  },

  // ═══════════════════  GUILLOTINE  ══════════════════════════════════
  {
    id: 'GUIL_INTRO', code: 'GUILLOTINE_INTRO', name: 'Guillotine Safety & Intro',
    description: 'Blade safety, machine parts, basic operation principles',
    branch: 'guillotine', tier: 1, category: 'Guillotine',
    skillTreeType: 'technical', icon: 'scissors', x: 590, y: TY[1],
  },
  {
    id: 'GUIL_SINGLE', code: 'GUILLOTINE_SINGLE_CUT', name: 'Single & Stack Cutting',
    description: 'Basic single-sheet and stack cutting, clamp adjustment',
    branch: 'guillotine', tier: 2, category: 'Guillotine',
    skillTreeType: 'technical', icon: 'file-minus', x: 540, y: TY[2],
  },
  {
    id: 'GUIL_MEASURE', code: 'GUILLOTINE_MEASURE', name: 'Cut Measurement & Setup',
    description: 'Backgauge programming, ruler reading, cut planning',
    branch: 'guillotine', tier: 2, category: 'Guillotine',
    skillTreeType: 'technical', icon: 'ruler', x: 640, y: TY[2],
  },
  {
    id: 'GUIL_COMPLEX', code: 'GUILLOTINE_COMPLEX', name: 'Complex Multi-Cut Programs',
    description: 'Multi-step cutting sequences, nested cuts, optimisation',
    branch: 'guillotine', tier: 3, category: 'Guillotine',
    skillTreeType: 'operational', icon: 'layout-grid', x: 540, y: TY[3],
  },
  {
    id: 'GUIL_BLADE', code: 'GUILLOTINE_BLADE', name: 'Blade Maintenance & Change',
    description: 'Blade replacement, sharpening, cutting stick rotation',
    branch: 'guillotine', tier: 3, category: 'Guillotine',
    skillTreeType: 'operational', icon: 'wrench', x: 640, y: TY[3],
  },
  {
    id: 'GUIL_PRECISION', code: 'GUILLOTINE_PRECISION', name: 'Precision Cutting',
    description: 'Tight tolerances, specialty materials, quality verification',
    branch: 'guillotine', tier: 4, category: 'Guillotine',
    skillTreeType: 'operational', icon: 'target', x: 540, y: TY[4],
  },
  {
    id: 'GUIL_PROGRAM', code: 'GUILLOTINE_PROGRAMMING', name: 'Advanced Programming',
    description: 'CNC programming, automation sequences, production optimisation',
    branch: 'guillotine', tier: 4, category: 'Guillotine',
    skillTreeType: 'operational', icon: 'cpu', x: 640, y: TY[4],
  },
  {
    id: 'GUIL_MASTER', code: 'GUILLOTINE_MASTER', name: 'Guillotine Master',
    description: 'Full cutting production lead, optimisation expert, trainer',
    branch: 'guillotine', tier: 5, category: 'Guillotine',
    skillTreeType: 'supervisory', icon: 'crown', x: 590, y: TY[5],
  },

  // ═══════════════════  DIE CUTTING  ═════════════════════════════════
  {
    id: 'DIE_INTRO', code: 'DIE_CUT_INTRO', name: 'Die Cutting Safety & Intro',
    description: 'Die types, machine safety, basic operation',
    branch: 'die_cutting', tier: 1, category: 'Die Cutting',
    skillTreeType: 'technical', icon: 'box', x: 870, y: TY[1],
  },
  {
    id: 'DIE_SETUP', code: 'DIE_CUT_SETUP', name: 'Die Setup & Alignment',
    description: 'Die mounting, makeready, pressure adjustment',
    branch: 'die_cutting', tier: 2, category: 'Die Cutting',
    skillTreeType: 'technical', icon: 'settings', x: 820, y: TY[2],
  },
  {
    id: 'DIE_RUN', code: 'DIE_CUT_BASIC_RUN', name: 'Basic Die Cutting Runs',
    description: 'Running production, speed control, quality monitoring',
    branch: 'die_cutting', tier: 2, category: 'Die Cutting',
    skillTreeType: 'technical', icon: 'play', x: 920, y: TY[2],
  },
  {
    id: 'DIE_COMPLEX', code: 'DIE_CUT_COMPLEX', name: 'Complex Die Configurations',
    description: 'Multi-level dies, kiss-cut, perforation, embossing dies',
    branch: 'die_cutting', tier: 3, category: 'Die Cutting',
    skillTreeType: 'operational', icon: 'hexagon', x: 820, y: TY[3],
  },
  {
    id: 'DIE_STRIP', code: 'DIE_CUT_STRIPPING', name: 'Stripping & Waste Removal',
    description: 'Stripping tools, waste removal, blanking',
    branch: 'die_cutting', tier: 3, category: 'Die Cutting',
    skillTreeType: 'operational', icon: 'unlink', x: 920, y: TY[3],
  },
  {
    id: 'DIE_REGISTER', code: 'DIE_CUT_REGISTER', name: 'Precision Registration',
    description: 'Tight registration to print, sensor alignment, consistency',
    branch: 'die_cutting', tier: 4, category: 'Die Cutting',
    skillTreeType: 'operational', icon: 'crosshair', x: 820, y: TY[4],
  },
  {
    id: 'DIE_MULTI', code: 'DIE_CUT_MULTI_STATION', name: 'Multi-Station Operations',
    description: 'Inline stripping, blanking, stacking stations',
    branch: 'die_cutting', tier: 4, category: 'Die Cutting',
    skillTreeType: 'operational', icon: 'grid-3x3', x: 920, y: TY[4],
  },
  {
    id: 'DIE_MASTER', code: 'DIE_CUT_MASTER', name: 'Die Cutting Master',
    description: 'Full die-cut production lead, design consultation, trainer',
    branch: 'die_cutting', tier: 5, category: 'Die Cutting',
    skillTreeType: 'supervisory', icon: 'crown', x: 870, y: TY[5],
  },

  // ═══════════════════  WORKSHOP CRAFT  ══════════════════════════════
  {
    id: 'WORK_INTRO', code: 'WORKSHOP_INTRO', name: 'Workshop Tools & Organisation',
    description: 'Workshop layout, tool care, workspace management',
    branch: 'workshop', tier: 1, category: 'Workshop Craft',
    skillTreeType: 'technical', icon: 'hammer', x: 1150, y: TY[1],
  },
  {
    id: 'WORK_REVISION', code: 'WORKSHOP_REVISION', name: 'Revision & Inspection',
    description: 'Quality inspection of finished goods, sorting, defect detection',
    branch: 'workshop', tier: 2, category: 'Workshop Craft',
    skillTreeType: 'technical', icon: 'search', x: 1090, y: TY[2],
  },
  {
    id: 'WORK_BOXING', code: 'WORKSHOP_BOXING', name: 'Boxing & Packaging',
    description: 'Packaging finished articles, boxing standards, labelling',
    branch: 'workshop', tier: 2, category: 'Workshop Craft',
    skillTreeType: 'technical', icon: 'package', x: 1210, y: TY[2],
  },
  {
    id: 'WORK_DETACH', code: 'WORKSHOP_DETACHMENT', name: 'Die-Cut Detachment',
    description: 'Manual detachment of die-cut goods, careful handling',
    branch: 'workshop', tier: 3, category: 'Workshop Craft',
    skillTreeType: 'operational', icon: 'unlink', x: 1040, y: TY[3],
  },
  {
    id: 'WORK_SASH', code: 'WORKSHOP_SASHES', name: 'Sashes (Fajas)',
    description: 'Sash / faja production, wrapping, finishing',
    branch: 'workshop', tier: 3, category: 'Workshop Craft',
    skillTreeType: 'operational', icon: 'ribbon', x: 1150, y: TY[3],
  },
  {
    id: 'WORK_BEND', code: 'WORKSHOP_BENDING_BASIC', name: 'Bending Machine — Diptychs',
    description: 'Basic bending machine operation for two-panel (diptych) folds',
    branch: 'workshop', tier: 3, category: 'Workshop Craft',
    skillTreeType: 'operational', icon: 'corner-down-right', x: 1270, y: TY[3],
  },
  {
    id: 'WORK_FINISH', code: 'WORKSHOP_FINISHING', name: 'Advanced Finishing',
    description: 'Complex assembly, multi-step finishing, quality finishing',
    branch: 'workshop', tier: 4, category: 'Workshop Craft',
    skillTreeType: 'operational', icon: 'puzzle', x: 1090, y: TY[4],
  },
  {
    id: 'WORK_BEND_ADV', code: 'WORKSHOP_BENDING_ADV', name: 'Bending Machine — Advanced',
    description: 'Complex folds: triptychs, gatefolds, accordion, custom folds',
    branch: 'workshop', tier: 4, category: 'Workshop Craft',
    skillTreeType: 'operational', icon: 'rotate-cw', x: 1220, y: TY[4],
  },
  {
    id: 'WORK_MASTER', code: 'WORKSHOP_MASTER', name: 'Workshop Craft Master',
    description: 'Full workshop lead, multi-craft oversight, trainer',
    branch: 'workshop', tier: 5, category: 'Workshop Craft',
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
