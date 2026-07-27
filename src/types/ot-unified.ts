/* ------------------------------------------------------------------ */
/*  Unified OT types — merges quote + production into one form         */
/* ------------------------------------------------------------------ */

import type { OTColorMode, OTSubstrateType, OTPriorityLevel, OTFinishes, OTOperation, OTCalculations, OTPricing, ImpositionResult, MultiQuantityQuote } from './ot';
import type { OTTapa, OTPliego, OTMontaje, OTMachineConfig, OTFinishing, OTProductionDetail, OTAdminFooter, OTItem, OTMachineType } from './ot-production';
import type { WorkCategoryKey } from './work-category';

/* ─── Montaje shape item (for interactive montaje editor) ────── */
export interface MontajeShape {
  id: string;
  /** Label e.g. "A", "B" or "Troquel 1" */
  label: string;
  /** X position on grid (0-based, in mm from left) */
  x: number;
  /** Y position (mm from top) */
  y: number;
  /** Width in mm */
  width: number;
  /** Height in mm */
  height: number;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation: number;
  /** Shape type for die-cutting */
  shapeType: 'rectangle' | 'rounded' | 'circle' | 'custom' | 'die_cut';
  /** Optional SVG path for custom die-cut shapes */
  customPath?: string;
  /** Border radius in mm (for rounded) */
  borderRadius?: number;
  /** Bleed in mm */
  bleed: number;
  /** Color for visual differentiation */
  color: string;
}

/* ─── Unified form data ──────────────────────────────────────── */
export interface UnifiedOTForm {
  /* ─ Step 0: Category ─────────────────────────────────────── */
  work_category: WorkCategoryKey | null;

  /* ─ Step 1: Information ──────────────────────────────────── */
  client_name: string;
  client_id: string;
  product_name: string;
  trabajo: string;            // production job title
  quantity: number;
  deadline: string;           // ISO date
  fecha_ot: string;           // OT creation date
  priority_level: OTPriorityLevel;
  description: string;
  template_id: string;
  ot_anterior: string;        // reference to previous OT

  /* ─ Step 2: Specifications ───────────────────────────────── */
  product_type: string;
  width_cm: number;
  height_cm: number;
  substrate_type: OTSubstrateType | '';
  grammage_gsm: number;
  substrate_brand: string;
  substrate_supplier: string;
  color_front: OTColorMode;
  color_back: OTColorMode;
  pantone_colors: string[];
  /** Clase de cobertura del arte — multiplica el consumo de tinta. */
  ink_coverage: 'light' | 'medium' | 'heavy';
  finishes: OTFinishes;
  attachments: File[];
  /** true = la OT nace declaradamente sin arte; visible hasta que se adjunte. */
  sin_arte: boolean;

  /* ─ Step 3: Production detail ────────────────────────────── */
  production_detail: OTProductionDetail;
  tapas: OTTapa[];
  items: OTItem[];
  pliegos: OTPliego[];

  /* ─ Step 4: Montaje (interactive) ────────────────────────── */
  montaje: OTMontaje;
  montaje_shapes: MontajeShape[];
  press_sheet_width: number;  // mm (default 700)
  press_sheet_height: number; // mm (default 1000)

  /* ─ Step 5: Machine ──────────────────────────────────────── */
  machine: OTMachineConfig;

  /* ─ Step 6: Finishing ────────────────────────────────────── */
  finishing: OTFinishing;
  admin: OTAdminFooter;

  /* ─ Step 7: Calculations & Operations ────────────────────── */
  calculations: OTCalculations;
  imposition: ImpositionResult | null;
  operations: OTOperation[];
  pricing: OTPricing;
  extra_quantities: number[];
}

/* ─── Initial empty form ─────────────────────────────────────── */
export const EMPTY_UNIFIED_FORM: UnifiedOTForm = {
  work_category: null,

  client_name: '',
  client_id: '',
  product_name: '',
  trabajo: '',
  quantity: 1000,
  deadline: '',
  fecha_ot: new Date().toISOString().slice(0, 10),
  priority_level: 'normal',
  description: '',
  template_id: '',
  ot_anterior: '',

  product_type: '',
  width_cm: 0,
  height_cm: 0,
  substrate_type: '',
  grammage_gsm: 150,
  substrate_brand: '',
  substrate_supplier: '',
  color_front: 'cmyk',
  color_back: 'sin_impresion',
  pantone_colors: [],
  ink_coverage: 'medium',
  finishes: {
    finish_troquelado: false,
    finish_plegado: false,
    finish_pegado: false,
    finish_laminado: false,
    finish_barniz: false,
    finish_relieve: false,
    finish_perforado: false,
    finish_hot_stamping: false,
    finish_uv_localizado: false,
    finish_numeracion: false,
  },
  attachments: [],
  sin_arte: false,

  production_detail: {
    production_description: '',
    formato: '',
    tapas_spec: '',
    interior_spec: '',
    acabado: '',
  },
  tapas: [],
  items: [],
  pliegos: [],

  montaje: {
    paginas_total: 2,
    forma_extension: '',
    montaje_grid: '1 x 2',
    pliego_a_maquina: '',
    pinza_cm: 0.8,
    corte_hoja: '1/4 Normal',
    montaje_paginas: 2,
  },
  montaje_shapes: [],
  press_sheet_width: 700,
  press_sheet_height: 1000,

  machine: {
    machine_type: 'offset_4_colores',
    color_config: '4/4',
    tiraje: 0,
    ctp_needed: true,
    vb_pdf: false,
  },

  finishing: {
    corte_resma: false,
    corte_final: false,
    doblados: false,
    corchetes: false,
    cajas: false,
    despacho_gonsa: false,
  },
  admin: {
    solicitante: '',
    vendedor: '',
    categoria_pago: 'credito_30',
  },

  calculations: {
    calc_sheets: 0,
    calc_substrate_kg: 0,
    calc_ink_kg: 0,
    calc_plates: 0,
    calc_print_hours: 0,
    calc_finish_hours: 0,
  },
  imposition: null,
  operations: [],
  pricing: {
    subtotal: 0,
    margin_pct: 10,
    margin_amount: 0,
    increment_pct: 10,
    increment_amount: 0,
    commission_pct: 1,
    commission_amount: 0,
    total_price: 0,
    unit_price: 0,
  },
  extra_quantities: [],
};

/* ─── Step definitions for the unified wizard ────────────────── */
export const UNIFIED_STEPS = [
  { key: 'category',     label: 'Tipo',            number: 1, icon: '📋' },
  { key: 'info',         label: 'Información',     number: 2, icon: '👤' },
  { key: 'specs',        label: 'Especificaciones', number: 3, icon: '📐' },
  { key: 'production',   label: 'Producción',      number: 4, icon: '🏭' },
  // La prensa determina el montaje (cuerpos → pasadas, formato → poses), así
  // que se pregunta primero. Estaban invertidos (auditoría 2026-07).
  { key: 'machine',      label: 'Máquina',         number: 5, icon: '⚙️' },
  { key: 'montaje',      label: 'Montaje',         number: 6, icon: '🧩' },
  { key: 'operations',   label: 'Costos',          number: 7, icon: '💰' },
  { key: 'summary',      label: 'Resumen',         number: 8, icon: '✅' },
] as const;
