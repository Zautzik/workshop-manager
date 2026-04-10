/* ------------------------------------------------------------------ */
/*  OT Production (Orden de Trabajo) — Extended types matching         */
/*  the physical workshop form with full production-level detail       */
/* ------------------------------------------------------------------ */

import type { OTColorMode, OTSubstrateType, OTPriorityLevel } from './ot';

/* ─── Tapa (Cover variant) ───────────────────────────────────── */
export interface OTTapa {
  id: string;
  /** e.g. "A", "B", "C", "D", "E" */
  code: string;
  /** Destination / client name for this variant */
  destination: string;
  /** Quantity of finished units for this variant */
  quantity: number;
}

/* ─── Pliego (Signature / Press sheet run) ───────────────────── */
export interface OTPliego {
  id: string;
  /** Pliego number (1, 2, 3...) */
  pliego_number: number;
  /** Units per page */
  unid_pag: number;
  /** Front colors count */
  tiro: number;
  /** Back colors count */
  retiro: number;
  /** Description, e.g. "TAPAS A" */
  description: string;
  /** Press run for this pliego */
  tiraje: number;
  /** Overrun / waste sheets */
  sobrantes: number;
  /** Final output quantity */
  cantidad: number;
  /** Optional note, e.g. "500 C/U" */
  nota?: string;
}

/* ─── Montaje (Imposition layout) ────────────────────────────── */
export interface OTMontaje {
  /** Total pages in the product */
  paginas_total: number;
  /** Form/extension dimensions, e.g. "21.5 x 32" */
  forma_extension: string;
  /** Montaje grid, e.g. "1 x 2" */
  montaje_grid: string;
  /** Press sheet dimensions for montaje, e.g. "33 x 48" */
  pliego_a_maquina: string;
  /** Pinza (gripper margin) in cm */
  pinza_cm: number;
  /** Sheet cut description, e.g. "1/4 Normal" */
  corte_hoja: string;
  /** Number of pages in montaje */
  montaje_paginas: number;
}

/* ─── Machine / Print configuration ──────────────────────────── */
export type OTMachineType =
  | 'impresion_digital'
  | 'offset_1_color'
  | 'offset_2_colores'
  | 'offset_4_colores'
  | 'serigrafia'
  | 'flexografia'
  | 'otro';

export const MACHINE_TYPES: { value: OTMachineType; label: string }[] = [
  { value: 'impresion_digital', label: 'Impresión Digital' },
  { value: 'offset_1_color', label: 'Offset 1 Color' },
  { value: 'offset_2_colores', label: 'Offset 2 Colores' },
  { value: 'offset_4_colores', label: 'Offset 4 Colores' },
  { value: 'serigrafia', label: 'Serigrafía' },
  { value: 'flexografia', label: 'Flexografía' },
  { value: 'otro', label: 'Otra' },
];

export interface OTMachineConfig {
  machine_type: OTMachineType;
  /** Color config string, e.g. "4/4", "4/1", "1/1" */
  color_config: string;
  /** Estimated hours */
  horas?: number;
  /** Total press run (tiraje) */
  tiraje: number;
  /** Whether CTP plates needed */
  ctp_needed: boolean;
  /** Number of CTP plates */
  ctp_count?: number;
  /** Special colors description */
  colores_especiales?: string;
  /** V°B° PDF approved */
  vb_pdf: boolean;
}

/* ─── Encuadernación y Terminación (Binding & Finishing) ──────── */
export interface OTFinishing {
  corte_resma: boolean;
  corte_resma_qty?: number;
  corte_final: boolean;
  corte_final_qty?: number;
  doblados: boolean;
  doblados_qty?: number;
  corchetes: boolean;
  corchetes_qty?: number;
  cajas: boolean;
  cajas_qty?: number;
  despacho_gonsa: boolean;
  despacho_gonsa_detail?: string;
  /** Free-text for additional finishing processes */
  otros?: string;
}

/* ─── Resumen de procesos (Process summary) ──────────────────── */
export interface OTProcessSummary {
  /** E.g. "ALZADO DIGITAL / 2 CORCHETES / CAJAS DE 500 UNIDADES" */
  description: string;
  /** Montaje method: T/R Aparte, etc. */
  montaje_method?: string;
}

/* ─── Production detail (upper section) ──────────────────────── */
export interface OTProductionDetail {
  /** Full description of the product for production, e.g. "Libros para Pintar 5 Cambios (Solo Tapas)" */
  production_description: string;
  /** Format: closed dimensions, e.g. "21.5 x 16 cms Cerrado / 21.5 x 32 cms Ext." */
  formato: string;
  /** Cover spec, e.g. "Tapas (5 Motivos) 4/1 colores en Bond 140 grs" */
  tapas_spec?: string;
  /** Interior spec, e.g. "Interior (Común) 1/1 colores en Bond 90 grs" */
  interior_spec?: string;
  /** Finishing description, e.g. "Dobladas / Corchetéadas. Cajas de 500 unid." */
  acabado?: string;
}

/* ─── Die-cut shape presets ───────────────────────────────────── */
export type OTDieShapePreset =
  | 'rectangle'   // default — plain rectangle
  | 'rounded'     // rounded corners
  | 'circle'      // perfect circle
  | 'oval'        // ellipse
  | 'wavy'        // ondulating / wavy edges (troquel ondulado)
  | 'arch_top'    // flat bottom, arched top
  | 'label'       // classic label / tag shape with notched sides
  | 'heart'       // heart shape
  | 'star'        // 5-point star
  | 'scalloped';  // scalloped edges (festoneado)

/**
 * Normalised SVG path strings for each preset shape.
 * All paths are defined in a 0–100 × 0–100 coordinate space.
 * The renderer scales them to the actual page dimensions.
 */
export const DIE_SHAPE_PATHS: Record<OTDieShapePreset, string> = {
  rectangle:
    'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  rounded:
    'M 10 0 L 90 0 Q 100 0 100 10 L 100 90 Q 100 100 90 100 L 10 100 Q 0 100 0 90 L 0 10 Q 0 0 10 0 Z',
  circle:
    'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z',
  oval:
    'M 50 0 C 85 0 100 22 100 50 C 100 78 85 100 50 100 C 15 100 0 78 0 50 C 0 22 15 0 50 0 Z',
  wavy:
    // Top edge: wavy left-to-right
    'M 0 6 Q 8 0 17 6 Q 25 12 33 6 Q 42 0 50 6 Q 58 12 67 6 Q 75 0 83 6 Q 92 12 100 6 '
    // Right edge: wavy top-to-bottom
    + 'L 100 6 Q 94 14 100 22 Q 94 30 100 38 Q 94 46 100 54 Q 94 62 100 70 Q 94 78 100 86 Q 94 94 100 94 '
    // Bottom edge: wavy right-to-left
    + 'L 100 94 Q 92 100 83 94 Q 75 88 67 94 Q 58 100 50 94 Q 42 88 33 94 Q 25 100 17 94 Q 8 88 0 94 '
    // Left edge: wavy bottom-to-top
    + 'L 0 94 Q 6 86 0 78 Q 6 70 0 62 Q 6 54 0 46 Q 6 38 0 30 Q 6 22 0 14 Z',
  arch_top:
    'M 0 100 L 0 35 Q 0 0 50 0 Q 100 0 100 35 L 100 100 Z',
  label:
    'M 12 0 L 88 0 L 100 12 L 100 88 L 88 100 L 12 100 L 0 88 L 0 12 Z',
  heart:
    'M 50 18 C 50 0 100 0 100 30 C 100 60 50 100 50 100 C 50 100 0 60 0 30 C 0 0 50 0 50 18 Z',
  star:
    'M 50 0 L 61 35 L 100 38 L 70 62 L 79 100 L 50 78 L 21 100 L 30 62 L 0 38 L 39 35 Z',
  scalloped:
    // Top edge: scalloped arcs left-to-right
    'M 0 8 Q 5 0 10 8 Q 15 0 20 8 Q 25 0 30 8 Q 35 0 40 8 Q 45 0 50 8 Q 55 0 60 8 Q 65 0 70 8 Q 75 0 80 8 Q 85 0 90 8 Q 95 0 100 8 '
    // Right edge: scalloped arcs top-to-bottom
    + 'Q 100 13 92 18 Q 100 23 92 28 Q 100 33 92 38 Q 100 43 92 48 Q 100 53 92 58 Q 100 63 92 68 Q 100 73 92 78 Q 100 83 92 88 Q 100 93 92 92 '
    // Bottom edge: scalloped arcs right-to-left
    + 'Q 95 100 90 92 Q 85 100 80 92 Q 75 100 70 92 Q 65 100 60 92 Q 55 100 50 92 Q 45 100 40 92 Q 35 100 30 92 Q 25 100 20 92 Q 15 100 10 92 Q 5 100 0 92 '
    // Left edge: scalloped arcs bottom-to-top
    + 'Q 0 87 8 82 Q 0 77 8 72 Q 0 67 8 62 Q 0 57 8 52 Q 0 47 8 42 Q 0 37 8 32 Q 0 27 8 22 Q 0 17 8 12 Z',
};

/* ─── Item (can have multiple items per OT) ──────────────────── */
export interface OTItem {
  id: string;
  /** Item number */
  item_number: number;
  /** Item description, e.g. "Tapas 5 Motivos" */
  description: string;
  /** Units to print */
  a_imprimir: number;
  /** Paper type */
  papel: OTSubstrateType | string;
  /** Grammage */
  grammage_grs: number;
  /** Sheet dimensions */
  sheet_width: number;
  sheet_height: number;
  /** Sheets before cutting */
  hojas_sin_cortar: number;
  /** Pi/Base */
  pi_base: number;
  /** Pi/Sobrante */
  pi_sobrante: number;
  /** Pliegos a máquina */
  pliegos_a_maquina: number;
  /** Number of pliegos (signatures) */
  pliegos_count: number;
  /**
   * Optional die-cut shape for the finished piece.
   * When set, the montaje diagram renders this outline instead of a rectangle.
   * Can be:
   *  - a preset key  ('rounded', 'wavy', 'circle', 'oval', 'arch_top', 'label', 'heart', 'star', 'custom')
   *  - 'custom' means `die_shape_path` contains a raw SVG <path> d-attribute
   */
  die_shape?: OTDieShapePreset | 'custom';
  /**
   * Raw SVG path d-attribute for fully custom die-cut outlines.
   * The path is drawn inside a normalised 0-100 × 0-100 viewBox and will be
   * scaled to fit the page dimensions in the montaje diagram.
   */
  die_shape_path?: string;
  /** Human-readable label for the shape, e.g. "Troquel ondulado" */
  die_shape_label?: string;
}

/* ─── Administrative footer ──────────────────────────────────── */
export interface OTAdminFooter {
  /** Person who requested the order */
  solicitante: string;
  /** Sales person */
  vendedor: string;
  /** Contact phone */
  telefono?: string;
  /** Client RUT (tax ID) */
  rut?: string;
  /** Quote/budget number */
  presupuesto_numero?: string;
  /** Purchase order number */
  orden_compra?: string;
  /** Payment category, e.g. "B : CRÉDITO 30 DÍAS" */
  categoria_pago: string;
  /** Notes for production */
  notas_produccion?: string;
  /** How originals were received */
  originales_via?: string;
}

/* ─── Payment categories ─────────────────────────────────────── */
export const PAYMENT_CATEGORIES = [
  { value: 'contado', label: 'Contado' },
  { value: 'credito_15', label: 'Crédito 15 Días' },
  { value: 'credito_30', label: 'B : Crédito 30 Días' },
  { value: 'credito_60', label: 'Crédito 60 Días' },
  { value: 'credito_90', label: 'Crédito 90 Días' },
  { value: 'otro', label: 'Otro' },
];

/* ================================================================ */
/*  MASTER PRODUCTION OT FORM                                       */
/* ================================================================ */

export interface OTProductionForm {
  /* ─── Header ─────────────────────────────────────────────── */
  ot_number: string;
  ot_anterior?: string;
  fecha_ot: string;
  fecha_entrega: string;
  client_name: string;
  client_id: string;
  trabajo: string;
  cantidad_total: number;
  unidades_label: string;
  priority_level: OTPriorityLevel;

  /* ─── Production detail ─────────────────────────────────── */
  production_detail: OTProductionDetail;

  /* ─── Tapas distribution ────────────────────────────────── */
  tapas: OTTapa[];

  /* ─── Items ─────────────────────────────────────────────── */
  items: OTItem[];

  /* ─── Montaje ───────────────────────────────────────────── */
  montaje: OTMontaje;

  /* ─── Machine / Print ───────────────────────────────────── */
  machine: OTMachineConfig;

  /* ─── Process summary ───────────────────────────────────── */
  process_summary: OTProcessSummary;

  /* ─── Pliegos detail ────────────────────────────────────── */
  pliegos: OTPliego[];

  /* ─── Finishing ─────────────────────────────────────────── */
  finishing: OTFinishing;

  /* ─── Admin footer ──────────────────────────────────────── */
  admin: OTAdminFooter;
}

/* ─── Initial empty production form ──────────────────────────── */

export const EMPTY_PRODUCTION_FORM: OTProductionForm = {
  ot_number: '',
  ot_anterior: '',
  fecha_ot: new Date().toISOString().slice(0, 10),
  fecha_entrega: '',
  client_name: '',
  client_id: '',
  trabajo: '',
  cantidad_total: 0,
  unidades_label: 'UNIDADES',
  priority_level: 'normal',

  production_detail: {
    production_description: '',
    formato: '',
    tapas_spec: '',
    interior_spec: '',
    acabado: '',
  },

  tapas: [],

  items: [{
    id: crypto.randomUUID?.() ?? '1',
    item_number: 1,
    description: '',
    a_imprimir: 0,
    papel: 'bond',
    grammage_grs: 140,
    sheet_width: 72,
    sheet_height: 102,
    hojas_sin_cortar: 0,
    pi_base: 0,
    pi_sobrante: 0,
    pliegos_a_maquina: 0,
    pliegos_count: 4,
    die_shape: 'rectangle',
  }],

  montaje: {
    paginas_total: 2,
    forma_extension: '',
    montaje_grid: '1 x 2',
    pliego_a_maquina: '',
    pinza_cm: 0.8,
    corte_hoja: '1/4 Normal',
    montaje_paginas: 2,
  },

  machine: {
    machine_type: 'impresion_digital',
    color_config: '4/4',
    tiraje: 0,
    ctp_needed: false,
    vb_pdf: false,
  },

  process_summary: {
    description: '',
  },

  pliegos: [],

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
};
