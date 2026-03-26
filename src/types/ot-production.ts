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
