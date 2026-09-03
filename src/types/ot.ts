/* ------------------------------------------------------------------ */
/*  OT (Work Order) domain types                                      */
/* ------------------------------------------------------------------ */

/* ─── Client type ────────────────────────────────────────────── */
export interface Client {
  id: string;
  name: string;
  rut?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ─── Template type ──────────────────────────────────────────── */
export interface OTTemplate {
  id: string;
  name: string;
  description?: string | null;
  product_type?: OTProductType | null;
  substrate_type?: OTSubstrateType | null;
  grammage_gsm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  color_front?: OTColorMode;
  color_back?: OTColorMode;
  finishes?: Partial<OTFinishes>;
  default_operations?: Array<{
    category: OTOperationCategory;
    name: string;
    unit: string;
    unit_cost: number;
  }>;
  margin_pct?: number;
  increment_pct?: number;
  commission_pct?: number;
  is_active: boolean;
  created_at: string;
}

/* ─── Draft type ─────────────────────────────────────────────── */
export interface OTDraft {
  id: string;
  user_id: string;
  title?: string | null;
  form_data: OTFormData;
  step: number;
  created_at: string;
  updated_at: string;
}

/* ─── Attachment type ────────────────────────────────────────── */
export interface OTAttachment {
  id: string;
  ot_id?: string | null;
  draft_id?: string | null;
  filename: string;
  storage_path: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

/* ─── Approval type ──────────────────────────────────────────── */
export type OTApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface OTApproval {
  id: string;
  ot_id: string;
  requested_by?: string | null;
  approver_id?: string | null;
  status: OTApprovalStatus;
  comments?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

/* ─── Imposition result ──────────────────────────────────────── */
export interface ImpositionResult {
  poses_per_sheet: number;
  cols: number;
  rows: number;
  waste_pct: number;
  sheet_utilization_pct: number;
  /** NET run (qty ÷ poses) — process waste is added by computeOTCalculations. */
  sheets_needed: number;
  rotated: boolean;
  /** Chosen print-sheet format (engine v2 picks among the plant's formats). */
  format_label?: string;
  format_w?: number;
  format_h?: number;
  /**
   * Formato de compra del que sale este pliego, cuando hay que cortarlo para que
   * entre en la prensa (ej. un 35×50 sale de partir un 70×100 en cuatro). null
   * significa que el pliego se compra tal cual.
   */
  cut_from?: string | null;
  /** Cuántos pliegos de prensa salen de cada pliego comprado. */
  cuts_per_parent?: number;
  /** La pieza no entra en ningún pliego que la prensa elegida pueda tomar. */
  exceeds_press?: boolean;
}

/* ─── Multi-quantity quote ───────────────────────────────────── */
export interface MultiQuantityQuote {
  quantity: number;
  total_price: number;
  unit_price: number;
}

export type OTProductType =
  | 'etiqueta'
  | 'caja_display'
  | 'caja_plegadiza'
  | 'volante'
  | 'afiche'
  | 'brochure'
  | 'carpeta'
  | 'sobre'
  | 'bolsa'
  | 'otro';

export type OTSubstrateType =
  | 'cauche'
  | 'bond'
  | 'couche'
  | 'cartulina'
  | 'kraft'
  | 'adhesivo'
  | 'vinilo'
  | 'otro';

export type OTColorMode =
  | 'cmyk'
  | '1_color'
  | '2_color'
  | '3_color'
  | 'cmyk_pantone'
  | 'sin_impresion';

export type OTPriorityLevel = 'baja' | 'normal' | 'alta' | 'urgente';

export type OTOperationCategory = 'materiales' | 'impresion' | 'terminaciones' | 'tercerizado' | 'otros';

/* ─── Product type labels ────────────────────────────────────── */

export const PRODUCT_TYPES: { value: OTProductType; label: string }[] = [
  { value: 'etiqueta', label: 'Etiqueta' },
  { value: 'caja_display', label: 'Caja Display' },
  { value: 'caja_plegadiza', label: 'Caja Plegadiza' },
  { value: 'volante', label: 'Volante / Flyer' },
  { value: 'afiche', label: 'Afiche / Póster' },
  { value: 'brochure', label: 'Brochure / Folleto' },
  { value: 'carpeta', label: 'Carpeta' },
  { value: 'sobre', label: 'Sobre' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'otro', label: 'Otro' },
];

export const SUBSTRATE_TYPES: { value: OTSubstrateType; label: string }[] = [
  { value: 'cauche', label: 'Cauche' },
  { value: 'bond', label: 'Bond' },
  { value: 'couche', label: 'Couché' },
  { value: 'cartulina', label: 'Cartulina' },
  { value: 'kraft', label: 'Kraft' },
  { value: 'adhesivo', label: 'Adhesivo' },
  { value: 'vinilo', label: 'Vinilo' },
  { value: 'otro', label: 'Otro' },
];

export const GRAMMAGE_OPTIONS = [
  75, 90, 115, 150, 200, 250, 300, 350, 400,
];

export const COLOR_MODES: { value: OTColorMode; label: string; icon?: string }[] = [
  { value: 'cmyk', label: 'CMYK', icon: '●●●●' },
  { value: '1_color', label: '1 Color' },
  { value: '2_color', label: '2 Colores' },
  { value: '3_color', label: '3 Colores' },
  { value: 'cmyk_pantone', label: 'CMYK + Pantone', icon: '●●●●●' },
  { value: 'sin_impresion', label: 'Sin impresión' },
];

export const PRIORITY_LEVELS: { value: OTPriorityLevel; label: string; color: string }[] = [
  { value: 'baja', label: 'Baja', color: 'text-blue-400' },
  { value: 'normal', label: 'Normal', color: 'text-green-400' },
  { value: 'alta', label: 'Alta', color: 'text-amber-400' },
  { value: 'urgente', label: 'Urgente', color: 'text-red-400' },
];

export const OPERATION_CATEGORIES: { value: OTOperationCategory; label: string }[] = [
  { value: 'materiales', label: 'Materiales' },
  { value: 'impresion', label: 'Impresión' },
  { value: 'terminaciones', label: 'Terminaciones' },
  { value: 'tercerizado', label: 'Tercerizado' },
  { value: 'otros', label: 'Otros' },
];

/* ─── Finishing option type ──────────────────────────────────── */

export interface FinishOption {
  key: keyof OTFinishes;
  label: string;
  primary?: boolean; // shown in main grid vs "Ver más"
}

export const FINISH_OPTIONS: FinishOption[] = [
  { key: 'finish_troquelado', label: 'Troquelado', primary: true },
  { key: 'finish_plegado', label: 'Plegado', primary: true },
  { key: 'finish_pegado', label: 'Pegado', primary: true },
  { key: 'finish_laminado', label: 'Laminado', primary: true },
  { key: 'finish_barniz', label: 'Barniz', primary: true },
  { key: 'finish_relieve', label: 'Relieve', primary: true },
  { key: 'finish_perforado', label: 'Perforado' },
  { key: 'finish_hot_stamping', label: 'Hot Stamping' },
  { key: 'finish_uv_localizado', label: 'UV Localizado' },
  { key: 'finish_numeracion', label: 'Numeración' },
];

/* ─── Form data shapes ──────────────────────────────────────── */

export interface OTFinishes {
  finish_troquelado: boolean;
  finish_plegado: boolean;
  finish_pegado: boolean;
  finish_laminado: boolean;
  finish_barniz: boolean;
  finish_relieve: boolean;
  finish_perforado: boolean;
  finish_hot_stamping: boolean;
  finish_uv_localizado: boolean;
  finish_numeracion: boolean;
}

export interface OTOperation {
  id: string;
  category: OTOperationCategory;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
  /**
   * true cuando una persona escribió o corrigió esta línea a mano — falso
   * cuando la generó el motor. Es lo que permite que un cambio de
   * especificación refresque el presupuesto SIN pisar una corrección
   * deliberada (ver `reconcileOperations` en ot-calculations.ts).
   */
  is_manual?: boolean;
  /**
   * Sólo en memoria, nunca se guarda: la línea es manual y ya no coincide con
   * lo que el motor calcularía hoy — alguien la editó y después cambió la
   * especificación.
   */
  _stale?: boolean;
  /**
   * Sólo en memoria: la línea es manual y el motor ya no propone nada
   * parecido (p.ej. se destildó el acabado que la justificaba).
   */
  _orphaned?: boolean;
}

export interface OTCalculations {
  calc_sheets: number;
  calc_substrate_kg: number;
  calc_ink_kg: number;
  calc_plates: number;
  calc_print_hours: number;
  calc_finish_hours: number;
  /**
   * De `calc_print_hours`, cuántas son la pasada digital del dato variable.
   * `calc_print_hours` sigue siendo el total (offset + digital, correcto
   * para programar la máquina) — este campo existe sólo para que el costo se
   * reparta bien: la pasada digital ya se cobra por clic
   * (`digital_variable_click`), así que cobrarla también como hora de prensa
   * offset la duplica (auditoría 2026-08). Opcional y no persistido: ausente
   * equivale a 0, que es el comportamiento de siempre.
   */
  calc_digital_hours?: number;
}

export interface OTPricing {
  subtotal: number;
  margin_pct: number;
  margin_amount: number;
  increment_pct: number;
  increment_amount: number;
  commission_pct: number;
  commission_amount: number;
  total_price: number;
  unit_price: number;
}

export interface OTFormData {
  // Step 1: Information
  client_name: string;
  client_id: string;           // FK to clients table
  product_name: string;
  quantity: number;
  deadline: string;
  priority_level: OTPriorityLevel;
  description: string;
  template_id: string;         // FK to ot_templates
  // Step 2: Specifications
  product_type: OTProductType | '';
  width_cm: number;
  height_cm: number;
  substrate_type: OTSubstrateType | '';
  grammage_gsm: number;
  substrate_brand: string;
  substrate_supplier: string;
  color_front: OTColorMode;
  color_back: OTColorMode;
  pantone_colors: string[];
  finishes: OTFinishes;
  /**
   * El trabajo lleva dato variable: se tira en offset y se personaliza en
   * digital. Ver `OTCalcOptions.variableData`.
   */
  variable_data?: boolean;
  /**
   * Hay que mandar a hacer el troquel. Sólo aplica si el trabajo se troquela.
   * Un costo de una vez, no por pliego — ver `DEFAULT_COSTS.die_tooling`.
   */
  die_new?: boolean;
  attachments: File[];          // artwork files to upload
  // Step 3: Calculations (computed)
  calculations: OTCalculations;
  imposition: ImpositionResult | null;
  // Step 4: Operations
  operations: OTOperation[];
  // Step 5: Pricing
  pricing: OTPricing;
  extra_quantities: number[];   // multi-quantity quoting
}

/* ─── Initial empty form ─────────────────────────────────────── */

export const EMPTY_FINISHES: OTFinishes = {
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
};

export const INITIAL_OT_FORM: OTFormData = {
  client_name: '',
  client_id: '',
  product_name: '',
  quantity: 1000,
  deadline: '',
  priority_level: 'normal',
  description: '',
  template_id: '',
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
  finishes: { ...EMPTY_FINISHES },
  attachments: [],
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
