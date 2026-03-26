/* ------------------------------------------------------------------ */
/*  Work Category Types — Pre-form category selector & cost centers    */
/* ------------------------------------------------------------------ */

/* ─── Work Categories ────────────────────────────────────────── */
export type WorkCategoryKey =
  | 'etiqueta'
  | 'estuche'
  | 'afiche'
  | 'caja_plegadiza'
  | 'caja_display'
  | 'libro'
  | 'revista'
  | 'folleto'
  | 'volante'
  | 'carpeta'
  | 'sobre'
  | 'talonario'
  | 'calendario'
  | 'otro';

export interface WorkCategoryOption {
  key: WorkCategoryKey;
  label: string;
  icon: string;           // emoji
  description: string;
  /** Hex color for the card accent */
  color: string;
}

export const WORK_CATEGORIES: WorkCategoryOption[] = [
  {
    key: 'etiqueta',
    label: 'Etiqueta',
    icon: '🏷️',
    description: 'Etiquetas adhesivas, etiquetas de producto, etiquetas de bodega',
    color: '#f59e0b',
  },
  {
    key: 'estuche',
    label: 'Estuche',
    icon: '📦',
    description: 'Estuches para productos, packaging premium, cajas decorativas',
    color: '#8b5cf6',
  },
  {
    key: 'afiche',
    label: 'Afiche / Póster',
    icon: '🖼️',
    description: 'Afiches promocionales, pósters, pendones impresos en pliego',
    color: '#ef4444',
  },
  {
    key: 'caja_plegadiza',
    label: 'Caja Plegadiza',
    icon: '📦',
    description: 'Cajas de cartulina plegables, envases farmacéuticos, alimenticios',
    color: '#06b6d4',
  },
  {
    key: 'caja_display',
    label: 'Caja Display',
    icon: '🗃️',
    description: 'Displays de punto de venta, exhibidores, cajas con ventana',
    color: '#10b981',
  },
  {
    key: 'libro',
    label: 'Libro / Cuaderno',
    icon: '📚',
    description: 'Libros, cuadernos, manuales, catálogos encuadernados',
    color: '#3b82f6',
  },
  {
    key: 'revista',
    label: 'Revista',
    icon: '📰',
    description: 'Revistas, periódicos, boletines, publicaciones periódicas',
    color: '#ec4899',
  },
  {
    key: 'folleto',
    label: 'Folleto / Brochure',
    icon: '📄',
    description: 'Folletos trípticos, dípticos, brochures corporativos',
    color: '#14b8a6',
  },
  {
    key: 'volante',
    label: 'Volante / Flyer',
    icon: '📃',
    description: 'Volantes publicitarios, flyers, insertos, hojas sueltas',
    color: '#f97316',
  },
  {
    key: 'carpeta',
    label: 'Carpeta',
    icon: '📂',
    description: 'Carpetas corporativas, carpetas con bolsillo, solapas',
    color: '#6366f1',
  },
  {
    key: 'sobre',
    label: 'Sobre',
    icon: '✉️',
    description: 'Sobres impresos, sobres con ventana, sobres especiales',
    color: '#84cc16',
  },
  {
    key: 'talonario',
    label: 'Talonario / Formulario',
    icon: '📋',
    description: 'Talonarios, boletas, facturas, formularios autocopiativos',
    color: '#a855f7',
  },
  {
    key: 'calendario',
    label: 'Calendario / Almanaque',
    icon: '📅',
    description: 'Calendarios de pared, escritorio, trípticos, almanaques anuales',
    color: '#e11d48',
  },
  {
    key: 'otro',
    label: 'Otro',
    icon: '⚙️',
    description: 'Trabajos especiales, productos no categorizados',
    color: '#64748b',
  },
];

/* ─── Category-specific default form values ──────────────────── */

export interface CategoryDefaults {
  production_description: string;
  formato: string;
  tapas_spec: string;
  interior_spec: string;
  acabado: string;
  /** Default paper type */
  papel: string;
  /** Default grammage */
  grammage_grs: number;
  /** Default sheet size */
  sheet_width: number;
  sheet_height: number;
  /** Default color config */
  color_config: string;
  /** Default machine */
  machine_type: string;
  /** Finishing defaults */
  corte_resma: boolean;
  corte_final: boolean;
  doblados: boolean;
  corchetes: boolean;
  cajas: boolean;
  /** Typical processes description */
  process_summary: string;
  /** Pliegos count */
  pliegos_count: number;
  /** Montaje grid */
  montaje_grid: string;
  /** Corte hoja */
  corte_hoja: string;
}

export const CATEGORY_DEFAULTS: Record<WorkCategoryKey, CategoryDefaults> = {
  etiqueta: {
    production_description: 'Etiquetas adhesivas impresas a todo color',
    formato: '10 x 5 cms',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Corte final / Troquelado a medida',
    papel: 'adhesivo',
    grammage_grs: 90,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: false,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN OFFSET 4/0 / TROQUELADO / EMPAQUE EN CAJAS',
    pliegos_count: 1,
    montaje_grid: '6 x 10',
    corte_hoja: 'Pliego Completo',
  },
  estuche: {
    production_description: 'Estuche de cartulina impreso a 4 colores con laminado',
    formato: '15 x 20 x 5 cms armado',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Laminado mate / Troquelado / Pegado y armado',
    papel: 'cartulina',
    grammage_grs: 300,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN 4/0 / LAMINADO MATE / TROQUELADO / PEGADO / EMPAQUE',
    pliegos_count: 1,
    montaje_grid: '2 x 2',
    corte_hoja: '1/2 Pliego',
  },
  afiche: {
    production_description: 'Afiches promocionales impresos a todo color',
    formato: '50 x 70 cms',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Corte final a medida',
    papel: 'couche',
    grammage_grs: 170,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: false,
    corchetes: false,
    cajas: false,
    process_summary: 'IMPRESIÓN OFFSET 4/0 / CORTE FINAL',
    pliegos_count: 1,
    montaje_grid: '1 x 1',
    corte_hoja: 'Pliego Completo',
  },
  caja_plegadiza: {
    production_description: 'Cajas plegadizas impresas en cartulina',
    formato: '12 x 18 x 4 cms armada',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Laminado / Troquelado / Pegado automático',
    papel: 'cartulina',
    grammage_grs: 350,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN 4/0 / LAMINADO / TROQUELADO / PEGADO AUTOMÁTICO / CAJAS',
    pliegos_count: 1,
    montaje_grid: '2 x 3',
    corte_hoja: 'Pliego Completo',
  },
  caja_display: {
    production_description: 'Display de punto de venta en cartulina rígida',
    formato: '30 x 40 x 25 cms armado',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Laminado brillante / Troquelado / Pegado manual',
    papel: 'cartulina',
    grammage_grs: 400,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: false,
    process_summary: 'IMPRESIÓN 4/0 / LAMINADO BRILLANTE / TROQUELADO / PEGADO MANUAL',
    pliegos_count: 1,
    montaje_grid: '1 x 1',
    corte_hoja: 'Pliego Completo',
  },
  libro: {
    production_description: 'Libros encuadernados con tapas y pliegos interiores',
    formato: '21.5 x 16 cms cerrado / 21.5 x 32 cms abierto',
    tapas_spec: 'Tapas 4/1 colores en Couché 250 grs',
    interior_spec: 'Interior 1/1 colores en Bond 90 grs',
    acabado: 'Alzado / Corcheteado / Doblado / Embalaje en cajas',
    papel: 'bond',
    grammage_grs: 90,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '1/1',
    machine_type: 'offset_1_color',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: true,
    cajas: true,
    process_summary: 'ALZADO / DOBLADO / 2 CORCHETES / CORTE FINAL / CAJAS',
    pliegos_count: 4,
    montaje_grid: '1 x 2',
    corte_hoja: '1/4 Normal',
  },
  revista: {
    production_description: 'Revista con tapas a color e interior en blanco y negro',
    formato: '21 x 28 cms cerrado',
    tapas_spec: 'Tapas 4/4 colores en Couché 200 grs',
    interior_spec: 'Interior 1/1 color en Bond 75 grs',
    acabado: 'Alzado / Corcheteado al lomo / Doblado / Refil',
    papel: 'bond',
    grammage_grs: 75,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '1/1',
    machine_type: 'offset_1_color',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: true,
    cajas: true,
    process_summary: 'ALZADO / CORCHETEADO AL LOMO / DOBLADO / REFIL / EMPAQUE',
    pliegos_count: 6,
    montaje_grid: '1 x 2',
    corte_hoja: '1/4 Normal',
  },
  folleto: {
    production_description: 'Folleto tríptico impreso a 4 colores ambos lados',
    formato: '21 x 10 cms cerrado / 21 x 30 cms abierto',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Doblado en 3 cuerpos / Empaque en cajas',
    papel: 'couche',
    grammage_grs: 170,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/4',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN 4/4 / CORTE / DOBLADO 3 CUERPOS / CAJAS',
    pliegos_count: 1,
    montaje_grid: '2 x 3',
    corte_hoja: '1/2 Pliego',
  },
  volante: {
    production_description: 'Volantes publicitarios impresos a 4 colores una cara',
    formato: '15 x 21 cms (medio carta)',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Corte final a medida',
    papel: 'couche',
    grammage_grs: 130,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: false,
    corchetes: false,
    cajas: false,
    process_summary: 'IMPRESIÓN 4/0 / CORTE FINAL / EMPAQUE',
    pliegos_count: 1,
    montaje_grid: '3 x 4',
    corte_hoja: 'Pliego Completo',
  },
  carpeta: {
    production_description: 'Carpeta corporativa con bolsillo interior',
    formato: '22 x 31 cms cerrada / 44 x 31 cms abierta',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Laminado mate / Troquelado / Pegado de bolsillo',
    papel: 'cartulina',
    grammage_grs: 300,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: false,
    process_summary: 'IMPRESIÓN 4/0 / LAMINADO MATE / TROQUELADO / PEGADO BOLSILLO',
    pliegos_count: 1,
    montaje_grid: '1 x 1',
    corte_hoja: 'Pliego Completo',
  },
  sobre: {
    production_description: 'Sobres impresos con ventana transparente',
    formato: '11 x 22 cms (DL estándar)',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Troquelado / Pegado de ventana / Pegado de sobre',
    papel: 'bond',
    grammage_grs: 90,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '2/0',
    machine_type: 'offset_2_colores',
    corte_resma: true,
    corte_final: true,
    doblados: true,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN 2/0 / TROQUELADO / PEGADO DE VENTANA / PEGADO / CAJAS',
    pliegos_count: 1,
    montaje_grid: '3 x 4',
    corte_hoja: 'Pliego Completo',
  },
  talonario: {
    production_description: 'Talonarios autocopiativos numerados',
    formato: '21.5 x 14 cms (medio oficio)',
    tapas_spec: '',
    interior_spec: '',
    acabado: 'Numeración / Encolado al lomo / Perforado / Tapas de cartón',
    papel: 'bond',
    grammage_grs: 56,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '1/0',
    machine_type: 'offset_1_color',
    corte_resma: true,
    corte_final: true,
    doblados: false,
    corchetes: false,
    cajas: false,
    process_summary: 'IMPRESIÓN 1/0 / NUMERACIÓN / ENCOLADO / PERFORADO / TAPAS',
    pliegos_count: 1,
    montaje_grid: '2 x 3',
    corte_hoja: '1/2 Pliego',
  },
  calendario: {
    production_description: 'Calendario impreso a todo color con base o anillado',
    formato: '33 x 48 cms (pared) / 15 x 21 cms (escritorio)',
    tapas_spec: 'Tapa 4/0 colores en Couché 250 grs',
    interior_spec: 'Hojas interiores 4/0 colores en Couché 170 grs',
    acabado: 'Perforado / Anillado doble ring / Base de cartón / Empaque',
    papel: 'couche',
    grammage_grs: 170,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/0',
    machine_type: 'offset_4_colores',
    corte_resma: true,
    corte_final: true,
    doblados: false,
    corchetes: false,
    cajas: true,
    process_summary: 'IMPRESIÓN 4/0 / CORTE / PERFORADO / ANILLADO DOBLE RING / BASE CARTÓN / EMPAQUE',
    pliegos_count: 7,
    montaje_grid: '1 x 2',
    corte_hoja: '1/2 Pliego',
  },
  otro: {
    production_description: '',
    formato: '',
    tapas_spec: '',
    interior_spec: '',
    acabado: '',
    papel: 'bond',
    grammage_grs: 90,
    sheet_width: 72,
    sheet_height: 102,
    color_config: '4/4',
    machine_type: 'impresion_digital',
    corte_resma: false,
    corte_final: false,
    doblados: false,
    corchetes: false,
    cajas: false,
    process_summary: '',
    pliegos_count: 1,
    montaje_grid: '1 x 1',
    corte_hoja: 'Pliego Completo',
  },
};

/* ─── Cost Center Types ──────────────────────────────────────── */

export interface CostCenterItem {
  id: string;
  /** Process / item name */
  name: string;
  /** Category for grouping */
  category: CostCategory;
  /** Unit of measure (hrs, kg, und, pliego, etc.) */
  unit: string;
  /** Cost per unit in CLP */
  unit_cost: number;
  /** Whether this is active/used */
  is_active: boolean;
  /** Optional notes */
  notes?: string;
}

export type CostCategory =
  | 'papel'
  | 'tinta'
  | 'planchas'
  | 'impresion'
  | 'guillotina'
  | 'terminaciones'
  | 'mano_de_obra'
  | 'tercerizado'
  | 'energia'
  | 'overhead';

export const COST_CATEGORIES: { value: CostCategory; label: string; icon: string; color: string }[] = [
  { value: 'papel', label: 'Papel / Sustrato', icon: '📜', color: '#f59e0b' },
  { value: 'tinta', label: 'Tinta', icon: '🎨', color: '#ef4444' },
  { value: 'planchas', label: 'Planchas CTP', icon: '🖨️', color: '#8b5cf6' },
  { value: 'impresion', label: 'Impresión (Máquina)', icon: '⚙️', color: '#3b82f6' },
  { value: 'guillotina', label: 'Guillotina / Corte', icon: '✂️', color: '#06b6d4' },
  { value: 'terminaciones', label: 'Terminaciones', icon: '🔧', color: '#10b981' },
  { value: 'mano_de_obra', label: 'Mano de Obra Taller', icon: '👷', color: '#f97316' },
  { value: 'tercerizado', label: 'Tercerizado', icon: '🚚', color: '#a855f7' },
  { value: 'energia', label: 'Energía / Electricidad', icon: '⚡', color: '#eab308' },
  { value: 'overhead', label: 'Overhead / Indirectos', icon: '🏢', color: '#64748b' },
];

/* ─── Production Cost Line (auto-generated from OT data) ─────── */

export interface ProductionCostLine {
  id: string;
  /** Links to a cost center item */
  cost_center_id?: string;
  /** Category */
  category: CostCategory;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit */
  unit: string;
  /** Unit cost (from cost center or manual) */
  unit_cost: number;
  /** Total cost = quantity * unit_cost */
  total_cost: number;
}

/* ─── Default cost center items (Chilean printing industry) ──── */

export const DEFAULT_COST_CENTER: CostCenterItem[] = [
  // Papel
  { id: 'cc-01', name: 'Bond 56 grs', category: 'papel', unit: 'kg', unit_cost: 950, is_active: true },
  { id: 'cc-02', name: 'Bond 75 grs', category: 'papel', unit: 'kg', unit_cost: 1100, is_active: true },
  { id: 'cc-03', name: 'Bond 90 grs', category: 'papel', unit: 'kg', unit_cost: 1250, is_active: true },
  { id: 'cc-04', name: 'Bond 140 grs', category: 'papel', unit: 'kg', unit_cost: 1500, is_active: true },
  { id: 'cc-05', name: 'Couché 130 grs', category: 'papel', unit: 'kg', unit_cost: 1800, is_active: true },
  { id: 'cc-06', name: 'Couché 170 grs', category: 'papel', unit: 'kg', unit_cost: 2000, is_active: true },
  { id: 'cc-07', name: 'Couché 200 grs', category: 'papel', unit: 'kg', unit_cost: 2200, is_active: true },
  { id: 'cc-08', name: 'Couché 250 grs', category: 'papel', unit: 'kg', unit_cost: 2500, is_active: true },
  { id: 'cc-09', name: 'Cartulina 300 grs', category: 'papel', unit: 'kg', unit_cost: 2800, is_active: true },
  { id: 'cc-10', name: 'Cartulina 350 grs', category: 'papel', unit: 'kg', unit_cost: 3000, is_active: true },
  { id: 'cc-11', name: 'Cartulina 400 grs', category: 'papel', unit: 'kg', unit_cost: 3200, is_active: true },
  { id: 'cc-12', name: 'Adhesivo 90 grs', category: 'papel', unit: 'kg', unit_cost: 3500, is_active: true },
  { id: 'cc-13', name: 'Kraft 120 grs', category: 'papel', unit: 'kg', unit_cost: 1200, is_active: true },
  // Tinta
  { id: 'cc-20', name: 'Tinta Offset CMYK', category: 'tinta', unit: 'kg', unit_cost: 31915, is_active: true },
  { id: 'cc-21', name: 'Tinta Pantone', category: 'tinta', unit: 'kg', unit_cost: 45000, is_active: true },
  { id: 'cc-22', name: 'Barniz UV', category: 'tinta', unit: 'kg', unit_cost: 25000, is_active: true },
  // Planchas
  { id: 'cc-30', name: 'Plancha CTP', category: 'planchas', unit: 'und', unit_cost: 8500, is_active: true },
  // Impresión
  { id: 'cc-40', name: 'Offset 1 Color', category: 'impresion', unit: 'hrs', unit_cost: 35000, is_active: true },
  { id: 'cc-41', name: 'Offset 2 Colores', category: 'impresion', unit: 'hrs', unit_cost: 55000, is_active: true },
  { id: 'cc-42', name: 'Offset 4 Colores', category: 'impresion', unit: 'hrs', unit_cost: 85000, is_active: true },
  { id: 'cc-43', name: 'Impresión Digital', category: 'impresion', unit: 'click', unit_cost: 595, is_active: true },
  // Guillotina
  { id: 'cc-50', name: 'Corte Resma (Guillotina)', category: 'guillotina', unit: 'hrs', unit_cost: 18000, is_active: true },
  { id: 'cc-51', name: 'Corte Final (Guillotina)', category: 'guillotina', unit: 'hrs', unit_cost: 18000, is_active: true },
  // Terminaciones
  { id: 'cc-60', name: 'Doblado', category: 'terminaciones', unit: 'hrs', unit_cost: 15000, is_active: true },
  { id: 'cc-61', name: 'Corcheteado', category: 'terminaciones', unit: 'hrs', unit_cost: 12000, is_active: true },
  { id: 'cc-62', name: 'Laminado Mate', category: 'terminaciones', unit: 'pliego', unit_cost: 120, is_active: true },
  { id: 'cc-63', name: 'Laminado Brillante', category: 'terminaciones', unit: 'pliego', unit_cost: 130, is_active: true },
  { id: 'cc-64', name: 'Troquelado', category: 'terminaciones', unit: 'hrs', unit_cost: 25000, is_active: true },
  { id: 'cc-65', name: 'Pegado Automático', category: 'terminaciones', unit: 'hrs', unit_cost: 20000, is_active: true },
  { id: 'cc-66', name: 'Pegado Manual', category: 'terminaciones', unit: 'hrs', unit_cost: 12000, is_active: true },
  { id: 'cc-67', name: 'Alzado', category: 'terminaciones', unit: 'hrs', unit_cost: 10000, is_active: true },
  { id: 'cc-68', name: 'Perforado', category: 'terminaciones', unit: 'hrs', unit_cost: 8000, is_active: true },
  { id: 'cc-69', name: 'Hot Stamping', category: 'terminaciones', unit: 'hrs', unit_cost: 40000, is_active: true },
  { id: 'cc-70', name: 'UV Localizado', category: 'terminaciones', unit: 'hrs', unit_cost: 35000, is_active: true },
  { id: 'cc-71', name: 'Empaque en Cajas', category: 'terminaciones', unit: 'hrs', unit_cost: 8000, is_active: true },
  { id: 'cc-72', name: 'Numeración', category: 'terminaciones', unit: 'hrs', unit_cost: 12000, is_active: true },
  // Mano de obra
  { id: 'cc-80', name: 'Operador de Prensa', category: 'mano_de_obra', unit: 'hrs', unit_cost: 8500, is_active: true },
  { id: 'cc-81', name: 'Ayudante de Taller', category: 'mano_de_obra', unit: 'hrs', unit_cost: 5500, is_active: true },
  { id: 'cc-82', name: 'Operador de Guillotina', category: 'mano_de_obra', unit: 'hrs', unit_cost: 7000, is_active: true },
  { id: 'cc-83', name: 'Operador de Terminaciones', category: 'mano_de_obra', unit: 'hrs', unit_cost: 6500, is_active: true },
  // Tercerizado
  { id: 'cc-90', name: 'Servicio Tercerizado', category: 'tercerizado', unit: 'und', unit_cost: 0, is_active: true },
  // Energía
  { id: 'cc-95', name: 'Electricidad por hora-máquina', category: 'energia', unit: 'hrs', unit_cost: 3500, is_active: true },
  // Overhead
  { id: 'cc-99', name: 'Gastos Generales (% sobre costo)', category: 'overhead', unit: '%', unit_cost: 8, is_active: true },
];
